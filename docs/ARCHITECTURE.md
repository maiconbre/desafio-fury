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
│   │       └── takedown-queue.port.ts      # Interface (contrato) para fila de jobs
│   │
│   ├── application/                        # Camada de aplicação (casos de uso)
│   │   ├── dtos/
│   │   │   └── violation.dto.ts            # Schemas Zod + tipos inferidos
│   │   └── use-cases/
│   │       ├── process-violation.ts        # Use case: receber e enfileirar violação
│   │       └── get-job-status.ts           # Use case: consultar status do job
│   │
│   ├── infrastructure/                     # Camada de infraestrutura (frameworks, bibliotecas)
│   │   ├── http/
│   │   │   ├── routes/
│   │   │   │   ├── webhook.ts              # POST /webhook/violation (thin controller)
│   │   │   │   └── jobs.ts                 # GET /jobs/:id (thin controller)
│   │   │   └── error-handler.ts            # Handler global de erros do Fastify
│   │   ├── logging/
│   │   │   └── logger.ts                   # Instância do logger (Pino)
│   │   └── queue/
│   │       ├── connection.ts               # Conexão IORedis compartilhada
│   │       ├── queue.ts                    # Definição da fila BullMQ
│   │       ├── bullmq-takedown-queue.ts    # Implementação da porta TakedownQueuePort
│   │       └── worker.ts                   # Worker e função processJob
│   │
│   └── server.ts                           # Composition Root + bootstrap + graceful shutdown
│
├── tests/
│   ├── env.test.ts                         # Testes unitários de requireEnv / requirePort
│   ├── violation.test.ts                   # Testes unitários do schema Zod
│   ├── worker.test.ts                      # Testes unitários de processJob (fetch mockado)
│   ├── use-cases/                          # Testes unitários com InMemory adapter (sem infra)
│   │   ├── in-memory-takedown-queue.ts     # Fake repository para testes
│   │   ├── process-violation.test.ts       # Testes do use case de violação
│   │   └── get-job-status.test.ts          # Testes do use case de status
│   └── integration/
│       └── api.test.ts                     # Testes de integração via fastify.inject (InMemory adapter)
├── scripts/
│   └── test-api.ps1                        # Script E2E contra a API real em execução
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
│    fetch(JSONPlaceholder, timeout 8s)        │
│    if !response.ok → throw Error             │  ──→ BullMQ faz retry
│    return { status, ok: true }               │
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

Funções `requireEnv` e `requirePort` validam as variáveis de ambiente na inicialização. Erros de configuração falham rápido (fail-fast) antes de o servidor escutar requisições.

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

### `src/application/use-cases/process-violation.ts` — Idempotência

A idempotência é implementada de forma estrita em duas camadas:

1. **Job ID determinístico**: `jobId = adId_tenantId` — o BullMQ usa esse ID como chave no Redis, impedindo dois jobs com o mesmo ID de coexistir.

2. **Bloqueio de duplicatas (409)**: antes de enfileirar, o use case verifica se um job com esse ID já existe na fila (em **qualquer estado**: waiting, active, delayed, completed ou failed). Se existir, rejeita imediatamente com `409 Conflict`. Isso garante que uma mesma violação (par `adId`+`tenantId`) seja processada apenas uma única vez na história do sistema.

> **Trade-off consciente**: a verificação de estado e o enfileiramento não são atômicos em nível de Redis. Em cenários de concorrência extrema (microssegundos), dois requests simultâneos podem ambos passar pela verificação de existência antes de qualquer um enfileirar. O BullMQ protege a fila neste caso (apenas o primeiro job inserido prevalece e o segundo é descartado), mas o contrato HTTP pode retornar dois `201`. Para o escopo do desafio, a proteção do lado da aplicação é suficiente e altamente performática.

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

- Chama `https://jsonplaceholder.typicode.com/posts/1` como mock da Meta API
- Timeout de 8s via `AbortSignal.timeout`
- Qualquer resposta não-2xx lança `Error`, delegando retry ao BullMQ
- Erros de rede (timeout, DNS) propagam diretamente para o BullMQ

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
1. Fecha o worker BullMQ (para de aceitar novos jobs)
2. Fecha a fila BullMQ
3. Encerra a conexão Redis (`QUIT`)
4. Fecha o servidor Fastify

---

## Camadas de teste

| Tipo | Ferramenta | Requer Redis | O que testa |
|---|---|---|---|
| Unitário — Schema | Vitest | Não | Validação Zod para todos os casos de borda |
| Unitário — Worker | Vitest + `vi.spyOn(fetch)` | Não | processJob: 2xx, 4xx/5xx, erro de rede |
| Unitário — Env | Vitest | Não | requireEnv / requirePort: edge cases de configuração |
| Unitário — Use Cases | Vitest + InMemory adapter | Não | Lógica de negócio sem infraestrutura |
| Integração — API | Vitest + `fastify.inject` + InMemory adapter | Não | Rotas HTTP completas com adapter em memória |
| E2E | PowerShell + API real | **Sim** | Fluxo completo end-to-end: 33 asserções |

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
