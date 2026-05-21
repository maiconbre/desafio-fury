# Arquitetura — FURY · Click Hero

## Visão geral

A aplicação é uma mini-API HTTP construída com **Fastify** que recebe webhooks de violação de anúncios, valida os dados, enfileira jobs assíncronos via **BullMQ + Redis** e expõe um endpoint de consulta de status.

---

## Estrutura de diretórios

```
fury-click-hero/
├── src/
│   ├── config/
│   │   └── env.ts                  # Leitura e validação de variáveis de ambiente
│   ├── lib/
│   │   ├── error.ts                # Classes de erro (AppError, ValidationError, etc.)
│   │   ├── error-handler.ts        # Handler global de erros do Fastify
│   │   └── logger.ts               # Instância do logger (Pino)
│   ├── queue/
│   │   ├── connection.ts           # Conexão IORedis compartilhada
│   │   ├── queue.ts                # Definição da fila BullMQ com opções de retry/backoff
│   │   └── worker.ts               # Worker e função processJob
│   ├── routes/
│   │   ├── webhook.ts              # POST /webhook/violation
│   │   └── jobs.ts                 # GET /jobs/:id
│   ├── schemas/
│   │   └── violation.ts            # Schemas Zod + tipos TypeScript exportados
│   ├── services/
│   │   ├── violation.service.ts    # Lógica: validação, idempotência, enfileiramento
│   │   └── job.service.ts          # Lógica: consulta de status do job
│   └── server.ts                   # Bootstrap, registro de rotas, graceful shutdown
├── tests/
│   ├── env.test.ts                 # Testes unitários de requireEnv / requirePort
│   ├── violation.test.ts           # Testes unitários do schema Zod
│   ├── worker.test.ts              # Testes unitários de processJob (fetch mockado)
│   └── integration/
│       └── api.test.ts             # Testes de integração via fastify.inject (BullMQ mockado)
├── scripts/
│   └── test-api.ps1               # Script E2E contra a API real em execução
├── docker-compose.yml              # Redis em container
├── .env / .env.example             # Variáveis de ambiente
├── package.json
└── tsconfig.json
```

---

## Fluxo de dados

```
Cliente HTTP
    │
    │  POST /webhook/violation  { adId, tenantId, violationType, severity, detectedAt }
    ▼
┌─────────────────────────────────────────┐
│  webhookRoutes  (src/routes/webhook.ts) │
│  Fastify route handler                  │
└────────────────────┬────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────┐
│  ViolationService                       │
│  (src/services/violation.service.ts)    │
│                                         │
│  1. violationSchema.safeParse(body)     │  ──→ 400 se inválido
│  2. takedownQueue.getJob(jobId)         │
│  3. Se estado ∈ {waiting,active,delayed}│  ──→ 409 Conflict
│  4. takedownQueue.add('takedown', data) │
└────────────────────┬────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────┐
│  BullMQ Queue  "takedown"               │
│  (src/queue/queue.ts)                   │
│                                         │
│  - jobId determinístico: adId_tenantId  │
│  - attempts: 3                          │
│  - backoff: exponential, delay: 2000ms  │
│  - removeOnComplete: 1h / max 500       │
│  - removeOnFail: 24h / max 200          │
└────────────────────┬────────────────────┘
                     │  job enfileirado no Redis
                     ▼
┌─────────────────────────────────────────┐
│  Worker  (src/queue/worker.ts)          │
│                                         │
│  processJob(job):                       │
│    fetch(JSONPlaceholder, timeout 8s)   │
│    if !response.ok → throw Error        │  ──→ BullMQ faz retry
│    return { status, ok: true }          │
└─────────────────────────────────────────┘

Cliente HTTP
    │
    │  GET /jobs/:id
    ▼
┌─────────────────────────────────────────┐
│  jobRoutes  (src/routes/jobs.ts)        │
└────────────────────┬────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────┐
│  JobService                             │
│  (src/services/job.service.ts)          │
│                                         │
│  takedownQueue.getJob(jobId)            │  ──→ 404 se não existe
│  job.getState()                         │
│  return { jobId, status, attempts,      │
│           result, error }               │
└─────────────────────────────────────────┘
```

---

## Componentes

### `src/config/env.ts`

Funções `requireEnv` e `requirePort` validam as variáveis de ambiente na inicialização. Erros de configuração falham rápido (fail-fast) antes de o servidor escutar requisições.

### `src/schemas/violation.ts`

Schema Zod central que define:
- `violationSchema` — validação do payload do webhook
- `takedownResultSchema` — validação do retorno do worker
- Tipos TypeScript derivados via `z.infer`

### `src/services/violation.service.ts` — Idempotência

A idempotência é implementada em duas camadas:

1. **Job ID determinístico**: `jobId = adId_tenantId` — o BullMQ usa esse ID como chave no Redis, impedindo dois jobs com o mesmo ID de coexistir simultaneamente.

2. **Verificação de estado**: antes de enfileirar, o serviço consulta o estado atual do job. Se o estado for `waiting`, `active` ou `delayed`, retorna `409 Conflict`. Se for `completed` ou `failed`, remove o job antigo e cria um novo (permite reprocessamento).

> **Trade-off consciente**: a verificação de estado e o enfileiramento não são atômicos. Em cenários de concorrência extrema, dois requests simultâneos podem ambos passar pela verificação antes de qualquer um enfileirar. O BullMQ protege a fila neste caso (apenas um job prevalece), mas o contrato HTTP pode retornar dois `201`. Para o escopo do desafio, esse nível de risco é aceitável.

### `src/queue/queue.ts` — Resiliência

```typescript
defaultJobOptions: {
  attempts: 3,                          // máximo de tentativas
  backoff: { type: 'exponential', delay: 2000 },  // 2s, 4s, 8s
  removeOnComplete: { count: 500, age: 3600 },    // mantém GET /jobs/:id funcional
  removeOnFail:    { count: 200, age: 86400 },    // observabilidade de falhas
}
```

### `src/queue/worker.ts` — Processamento

- Chama `https://jsonplaceholder.typicode.com/posts/1` como mock da Meta API
- Timeout de 8s via `AbortSignal.timeout`
- Qualquer resposta não-2xx lança `Error`, delegando retry ao BullMQ
- Erros de rede (timeout, DNS) propagam diretamente para o BullMQ

### `src/lib/error.ts` + `src/lib/error-handler.ts`

Hierarquia de erros tipada:

```
AppError (base)
├── ValidationError  → 400
├── NotFoundError    → 404
└── ConflictError    → 409
```

O handler global captura qualquer `AppError` e serializa para o formato de resposta padronizado. Erros desconhecidos retornam `500`.

### `src/server.ts` — Graceful Shutdown

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
| Integração — API | Vitest + `fastify.inject` + mocks BullMQ | Não | Rotas HTTP completas com BullMQ mockado |
| E2E | PowerShell + API real | **Sim** | Fluxo completo end-to-end: 31 asserções |

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
