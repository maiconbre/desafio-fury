# Arquitetura — FURY

## Visão geral

A aplicação é uma mini-API HTTP construída com **Fastify** que recebe webhooks de violação de anúncios, valida os dados, enfileira jobs assíncronos via **BullMQ + Redis** e expõe um endpoint de consulta de status.

A arquitetura segue os princípios da **Clean Architecture (DIP, SRP)** com três camadas principais: domínio, aplicação e infraestrutura.

---

## Estrutura de diretórios

```
fury/
├── src/
│   ├── config/
│   │   └── env.ts                          # Leitura e validação de variáveis de ambiente
│   │
│   ├── domain/                             # Camada de domínio (zero dependências externas)
│   │   ├── errors/
│   │   │   └── app-error.ts                # Hierarquia de erros (AppError, ValidationError, etc.)
│   │   ├── models/
│   │   │   └── violation.ts                # Tipos puros TypeScript (ViolationPayload, TakedownResult)
│   │   └── ports/
│   │       ├── takedown-queue.port.ts      # Interface para fila de jobs e controle de locks
│   │       └── meta-gateway.port.ts        # [NEW] Interface pura para integração externa com Meta API
│   │
│   ├── application/                        # Camada de aplicação (casos de uso)
│   │   ├── dtos/
│   │   │   └── violation.dto.ts            # Schemas Zod + tipos inferidos
│   │   └── use-cases/
│   │       ├── process-violation.ts        # Use case: receber, travar com lock e enfileirar violação
│   │       └── get-job-status.ts           # Use case: consultar status do job
│   │
│   ├── infrastructure/                     # Camada de infraestrutura (frameworks, bibliotecas)
│   │   ├── http/
│   │   │   ├── routes/
│   │   │   │   ├── webhook.ts              # POST /webhook/violation (thin controller)
│   │   │   │   ├── jobs.ts                 # GET /jobs/:id (thin controller)
│   │   │   │   └── health.ts               # [NEW] GET /health (desacoplado e testável)
│   │   │   └── error-handler.ts            # Handler global de erros do Fastify (não mascara erros nativos)
│   │   ├── logging/
│   │   │   └── logger.ts                   # Instância do logger (Pino)
│   │   └── queue/
│   │       ├── connection.ts               # Conexão IORedis compartilhada
│   │       ├── queue.ts                    # Definição da fila BullMQ
│   │       ├── bullmq-takedown-queue.ts    # Implementação da porta TakedownQueuePort (BullMQ + Redis lock)
│   │       ├── http-meta-gateway.ts        # [NEW] Implementação concreta da porta MetaGatewayPort
│   │       └── worker.ts                   # Worker factory e processJob
│   │
│   └── server.ts                           # Composition Root + bootstrap + graceful shutdown com timeout
│
├── tests/
│   ├── env.test.ts                         # Testes unitários de validação do envSchema (Zod)
│   ├── violation.test.ts                   # Testes unitários do schema Zod
│   ├── http-meta-gateway.test.ts           # [NEW] Testes unitários do gateway HTTP espiando o fetch
│   ├── worker.test.ts                      # Testes unitários de processJob (desacoplados, gateway mockado)
│   ├── use-cases/                          # Testes unitários com InMemory adapter (sem infra)
│   │   ├── in-memory-takedown-queue.ts     # Fake repository para testes com controle de locks
│   │   ├── process-violation.test.ts       # Testes do use case de violação (com teste de lock concorrente)
│   │   └── get-job-status.test.ts          # Testes do use case de status
│   └── integration/
│       ├── api.test.ts                     # Testes de integração via fastify.inject (health check injetável)
│       └── api.e2e.test.ts                 # [NEW] Testes E2E multiplataforma em Vitest contra API física real
├── docker-compose.yml                      # Redis em container
├── .env / .env.example                     # Variáveis de ambiente
├── package.json
└── tsconfig.json
```

---

## Princípios Arquiteturais

### Inversão de Dependência (DIP)

Os casos de uso (`application/use-cases`) dependem de interfaces definidas no domínio (`domain/ports`), não de implementações concretas. A infraestrutura implementa essas interfaces e é injetada via construtor no **Composition Root** (`server.ts`).

```
┌──────────┐     ┌──────────────┐     ┌──────────────────────┐
│  Routes  │────→│  Use Cases   │────→│  Ports (interfaces)  │
│ (infra)  │     │ (application)│     │      (domain)        │
└──────────┘     └──────────────┘     └──────────┬───────────┘
                                                 │
                                        ┌────────▼───────────┐
                                        │  Implementações     │
                                        │  (infra/queue,      │
                                        │   tests/in-memory)  │
                                        └────────────────────┘
```

### Domínio Puro (zero dependências externas)

A camada `src/domain/` **não importa** nenhuma biblioteca externa (Zod, Fastify, BullMQ, Pino). Ela contém apenas:
- **Modelos**: tipos TypeScript puros
- **Portas**: interfaces (contratos)
- **Erros**: classes de erro de domínio

### Schemas Zod na Application

Os schemas de validação (Zod) residem em `src/application/dtos/`, e não no domínio. Isso mantém o domínio livre de dependências de frameworks.

---

## Fluxo de dados

```
Cliente HTTP
    │
    │  POST /webhook/violation  { adId, tenantId, violationType, severity, detectedAt }
    ▼
┌──────────────────────────────────────────────┐
│  webhookRoutes  (infrastructure/http/routes) │
│  Fastify route handler (thin controller)     │
└────────────────────┬─────────────────────────┘
                     │  delega para o use case
                     ▼
┌──────────────────────────────────────────────┐
│  ProcessViolationUseCase                     │
│  (application/use-cases)                     │
│                                              │
│  1. violationSchema.safeParse(body)          │  ──→ 400 se inválido
│  2. this.queue.getJob(jobId)                 │  ──→ via TakedownQueuePort
│  3. Se status ∈ {waiting,active,delayed}     │  ──→ 409 Conflict
│  4. this.queue.addJob(jobId, data)           │
└────────────────────┬─────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────┐
│  BullMQTakedownQueue (implements Port)       │
│  (infrastructure/queue)                      │
│                                              │
│  - jobId determinístico: adId_tenantId       │
│  - attempts: 3                               │
│  - backoff: exponential, delay: 2000ms       │
│  - removeOnComplete: 1h / max 500            │
│  - removeOnFail: 24h / max 200               │
└────────────────────┬─────────────────────────┘
                     │  job enfileirado no Redis
                     ▼
┌──────────────────────────────────────────────┐
│  Worker  (infrastructure/queue/worker.ts)    │
│                                              │
│  processJob(job):                            │
│    chama MetaGatewayPort.executeTakedown()   │  ──→ injetado de forma desacoplada
│                                              │
│  HttpMetaGateway (infrastructure/queue)      │
│    fetch(JSONPlaceholder, timeout 8s)        │
│    if !response.ok → throw ExternalApiError   │  ──→ BullMQ faz retry
│    return { status }                         │
└──────────────────────────────────────────────┘

Cliente HTTP
    │
    │  GET /jobs/:id
    ▼
┌──────────────────────────────────────────────┐
│  jobRoutes  (infrastructure/http/routes)     │
└────────────────────┬─────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────┐
│  GetJobStatusUseCase                         │
│  (application/use-cases)                     │
│                                              │
│  this.queue.getJob(jobId)                    │  ──→ 404 se não existe
│  return { jobId, status, attempts,           │
│           result, error }                    │
└──────────────────────────────────────────────┘
```

---

## Componentes

### `src/config/env.ts`

O `envSchema` (Zod) valida as variáveis de ambiente na inicialização. Erros de configuração falham rápido (fail-fast) antes de o servidor escutar requisições.

### `src/domain/models/violation.ts`

Tipos TypeScript puros (sem dependência externa):
- `ViolationType`, `Severity` — union types string
- `ViolationPayload` — interface do payload do webhook
- `TakedownResult` — interface do retorno do worker

### `src/application/dtos/violation.dto.ts`

Schemas Zod centrais:
- `violationSchema` — validação do payload do webhook
- `takedownResultSchema` — validação do retorno do worker

Os schemas ficam na camada de aplicação (não no domínio) para manter o domínio livre de dependências de frameworks.

### `src/domain/ports/takedown-queue.port.ts`

Interface (contrato) que define as operações de fila que os casos de uso podem chamar:
- `getJob(jobId)` — buscar job por ID
- `addJob(jobId, data)` — adicionar job à fila

Implementações concretas:
- `src/infrastructure/queue/bullmq-takedown-queue.ts` — produção (BullMQ)
- `tests/use-cases/in-memory-takedown-queue.ts` — testes unitários

### `src/application/use-cases/process-violation.ts` — Idempotência e Concorrência

A idempotência e a proteção de concorrência são implementadas em três camadas transacionais:

1. **Lock Distribuído Temporário (Redis)**: Antes de verificar e adicionar o job, o use case adquire um lock atômico de exclusão mútua de curta duração (5 segundos) no Redis com a chave `lock:job:${jobId}` (usando as opções `'PX', ttl, 'NX'`). Se o lock não for adquirido, o request concorrente falha imediatamente com `409 Conflict`. Isso impede a condição de corrida clássica "Check-Then-Act".

2. **Job ID determinístico**: `jobId = adId_tenantId` — o BullMQ usa esse ID como chave exclusiva no Redis, prevenindo jobs duplicados na fila.

3. **Bloqueio de duplicatas (409)**: Sob a proteção do lock distribuído, o use case verifica se o job já existe na fila. Se existir, lança `ConflictError` (HTTP 409). Isso garante que o contrato HTTP da API seja 100% consistente, respondendo HTTP 201 apenas para a primeira criação e HTTP 409 para solicitações duplicadas simultâneas.

### `src/application/use-cases/get-job-status.ts` — Consulta

Use case que consulta o status de um job na fila:
- Busca o job via `TakedownQueuePort.getJob(jobId)`
- Lança `NotFoundError` (404) se o job não existe
- Retorna estrutura padronizada `{ jobId, status, attempts, result, error }`

### `src/infrastructure/queue/queue.ts` — Resiliência

```typescript
defaultJobOptions: {
  attempts: 3,                          // máximo de tentativas
  backoff: { type: 'exponential', delay: 2000 },  // 2s, 4s, 8s
  removeOnComplete: { count: 500, age: 3600 },    // mantém GET /jobs/:id funcional
  removeOnFail:    { count: 200, age: 86400 },    // observabilidade de falhas
}
```

### `src/infrastructure/queue/worker.ts` — Processamento

O worker é completamente modular e não se acopla à tecnologia HTTP de integração externa:
- Depende apenas da interface abstrata `MetaGatewayPort`.
- Recebe a implementação concreta por injeção (`HttpMetaGateway`) a partir do Composition Root.
- O `HttpMetaGateway` encapsula as chamadas de rede à Meta API (`jsonplaceholder.typicode.com/posts/1`) com timeout de 8s via `AbortSignal.timeout` e lança `ExternalApiError` para respostas não-2xx, delegando retentativas automáticas ao BullMQ.

### `src/domain/errors/app-error.ts` + `src/infrastructure/http/error-handler.ts`

Hierarquia de erros tipada (no domínio):

```
AppError (base)
├── ValidationError  → 400
├── NotFoundError    → 404
└── ConflictError    → 409
```

O handler global (na infraestrutura) captura qualquer `AppError` e serializa para o formato de resposta padronizado. Erros desconhecidos retornam `500`.

### `src/server.ts` — Composition Root + Graceful Shutdown

O `server.ts` atua como **Composition Root**: todas as dependências são instanciadas e injetadas manualmente:

```typescript
const queueAdapter = new BullMQTakedownQueue(takedownQueue)
const processViolationUseCase = new ProcessViolationUseCase(queueAdapter)
const getJobStatusUseCase = new GetJobStatusUseCase(queueAdapter)

app.register(webhookRoutes, { processViolationUseCase })
app.register(jobRoutes, { getJobStatusUseCase })
```

Ao receber `SIGTERM` ou `SIGINT`:
1. Dispara um timeout de proteção global de 10s. Se os recursos não fecharem nesse período, o processo finaliza forçadamente com `process.exit(1)`, evitando containers zumbis no orquestrador (ECS/K8s).
2. Fecha o worker BullMQ (para de aceitar novos de forma ordenada).
3. Fecha a fila BullMQ.
4. Encerra a conexão Redis (`QUIT`).
5. Fecha o servidor Fastify.

---

## Camadas de teste

| Tipo | Ferramenta | Requer Redis | O que testa |
|---|---|---|---|
| Unitário — Schema | Vitest | Não | Validação Zod para todos os casos de borda |
| Unitário — Worker | Vitest + `vi.spyOn(fetch)` | Não | processJob: 2xx, 4xx/5xx, erro de rede |
| Unitário — Env | Vitest | Não | envSchema: edge cases de configuração |
| Unitário — Use Cases | Vitest + InMemory adapter | Não | Lógica de negócio sem infraestrutura |
| Integração — API | Vitest + `fastify.inject` + InMemory adapter | Não | Rotas HTTP completas com adapter em memória |
| E2E | Vitest + API real | **Sim** | Fluxo completo de conectividade, concorrência por locks, Zod validation e status da API real |

---

## Stack

| Camada | Tecnologia |
|---|---|
| Runtime | Node.js 18+ (ESM nativo) |
| HTTP | Fastify 5 |
| Validação | Zod 3 |
| Fila | BullMQ 5 |
| Redis client | IORedis 5 |
| Logger | Pino |
| Tipos | TypeScript 5 (strict) |
| Testes unitários | Vitest |
| Testes E2E | PowerShell (`Invoke-WebRequest`) |
| Redis (infra) | Docker / redis:alpine |
