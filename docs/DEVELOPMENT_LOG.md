# Diário de Desenvolvimento — FURY

> Este documento registra o processo de desenvolvimento completo: planejamento, fases de execução, decisões tomadas durante o caminho, bugs encontrados e melhorias aplicadas — incluindo o uso de IA como ferramenta de auxílio.

---

## Metodologia e Uso de IA

O desenvolvimento foi feito com auxílio do **Claude (Anthropic)** via Antigravity IDE como ferramenta de pair programming. O fluxo foi:

1. **Leitura e interpretação do enunciado** — identificação dos requisitos, ambiguidades e restrições
2. **Planejamento da arquitetura** — definição de camadas, tecnologias e ordem de implementação
3. **Implementação fase a fase** — scaffolding → schemas → queue → services → rotas → servidor → testes
4. **Revisão crítica autônoma** — auditoria linha a linha contra cada requisito, identificação de bugs e gaps

---

## Fases de Execução

### Fase 1 — Scaffolding

- `package.json` com Fastify, Zod, BullMQ, ioredis, Vitest, tsx, @types/node, Pino
- `tsconfig.json` com `strict: true`, `target: ES2022`, `moduleResolution: bundler`, `noUncheckedIndexedAccess`, `noImplicitOverride`
- `docker-compose.yml` com `redis:alpine` (porta 6379)
- `.env.example` com `REDIS_URL` e `PORT`

### Fase 2 — Config + Schema

- `src/config/env.ts`: funções `requirePort` e `requireEnv` com validação completa (NaN, float, negativo, range 1–65535)
- `src/schemas/violation.ts`: schema Zod com enums, ISO 8601 com `offset: true`, strings `min(1)`, tipos inferidos exportados

### Fase 3 — Queue + Worker

- `src/queue/connection.ts`: IORedis com `maxRetriesPerRequest: null` e `enableOfflineQueue: false`
- `src/queue/queue.ts`: BullMQ Queue com backoff exponencial (3x, delay 2s)
- `src/queue/worker.ts`: Worker com `AbortSignal.timeout(8000)`, logging Pino estruturado, `concurrency: 1`, `stalledInterval: 15s`

### Fase 4 — Services

- `src/services/violation.service.ts`: validação Zod + idempotência refinada + enqueue
- `src/services/job.service.ts`: busca por job ID + formatação de status tipada

### Fase 5 — Rotas

- `src/routes/webhook.ts`: POST /webhook/violation — thin controller, delega ao service
- `src/routes/jobs.ts`: GET /jobs/:id — thin controller, delega ao service

### Fase 6 — Servidor + Error Handling

- `src/lib/error.ts`: hierarquia `AppError → ValidationError / NotFoundError / ConflictError`
- `src/lib/error-handler.ts`: handler Fastify separado do servidor (testável independentemente)
- `src/lib/logger.ts`: singleton Pino compartilhado entre servidor e worker
- `src/server.ts`: Fastify + graceful shutdown SIGTERM/SIGINT

### Fase 7 — Testes

| Suite | Testes | O que cobre |
|---|---|---|
| `violation.test.ts` | 9 | Schema Zod — todos os campos, enums, datetime, strings vazias |
| `worker.test.ts` | 9 | processJob — 2xx, 4xx/5xx via `it.each` (7 códigos), erro de rede |
| `env.test.ts` | 13 | requirePort + requireEnv — NaN, float, negativo, 0, >65535, boundaries |
| `services/violation.service.test.ts` | 5 | processViolation — sucesso, 400, 409, re-enqueue completed/failed |
| `services/job.service.test.ts` | 7 | getJobStatus — 200, 404, sem result, failed, attempts |
| `integration/api.test.ts` | 6 | HTTP contract — Fastify inject() com BullMQ mockado |
| **Total** | **49** | **6 suites, todas as camadas** |

### Fase 8 — Documentação

- `README.md` com instruções, endpoints, exemplos curl, scripts, resiliência
- `docs/ARCHITECTURE.md` com fluxo de dados, componentes e decisões técnicas
- `docs/DEVELOPMENT_LOG.md` (este arquivo)
- Script `scripts/test-api.ps1` com 31 asserções E2E contra a API real

### Fase 9 — Refatoração para Clean Architecture

Após a entrega, o projeto foi refatorado para seguir os princípios da **Clean Architecture** (DIP, SRP, domínio puro):

- `src/domain/` — camada pura sem dependências externas: tipos TypeScript, interfaces (ports), erros de domínio
- `src/application/` — casos de uso com injeção de dependência via construtor + DTOs Zod
- `src/infrastructure/` — implementações concretas (BullMQ, Fastify, Pino)
- `src/server.ts` — Composition Root: wire de dependências manual
- `tests/use-cases/` — testes unitários com `InMemoryTakedownQueue` (fake repository)

| Mudança | Antes | Depois |
|---------|-------|--------|
| Zod schemas | `src/schemas/violation.ts` | `src/application/dtos/violation.dto.ts` |
| Erros | `src/lib/error.ts` | `src/domain/errors/app-error.ts` |
| Logger | `src/lib/logger.ts` | `src/infrastructure/logging/logger.ts` |
| Lógica de negócio | `src/services/*.service.ts` | `src/application/use-cases/*.ts` |
| Fila | `src/queue/` | `src/infrastructure/queue/` (com adapter) |
| Rotas | `src/routes/` | `src/infrastructure/http/routes/` |
| Error handler | `src/lib/error-handler.ts` | `src/infrastructure/http/error-handler.ts` |
| Testes services | `tests/services/` (BullMQ mockado) | `tests/use-cases/` (InMemory adapter) |
| Testes integração | BullMQ mockado via `vi.mock` | `InMemoryTakedownQueue` puro |

---

## Decisões de Planejamento

Decisões tomadas **antes** da implementação:

| Decisão | Alternativa descartada | Justificativa |
|---|---|---|
| Fastify | Express | Nativo com TypeScript, mais performático, menos boilerplate |
| `fetch` nativo | `axios` | Node 18+ já inclui, zero dependência extra |
| Zod sem `@fastify/type-provider-zod` | Plugin do Fastify | Mais explícito, menos acoplamento, mais testável |
| DIP manual (construtor) | DI Container (Inversify) | Sem dependência extra, explícito e testável |
| Job ID `adId_tenantId` | UUID aleatório | Permite dedup nativo no BullMQ e consulta direta sem mapeamento |
| Sem autenticação / SQL / frontend | — | Explicitamente fora do escopo (desafio.md, linha 74) |

**O que foi explicitamente evitado:**

- DI Container (Inversify, tsyringe)
- JSDoc (código autoexplicativo)
- OpenAPI / Swagger
- Rate limiting, CI/CD, métricas

---

## Revisão Crítica e Melhorias

Após a primeira versão funcional, foi feita uma **auditoria linha a linha** contra cada requisito do desafio. Dois gaps foram identificados:

---

### Bug 1 — Race condition silenciosa na idempotência (aceito com trade-off)

**Problema:** A verificação de idempotência e o enfileiramento não são atômicos:

```typescript
const existingJob = await takedownQueue.getJob(jobId)  // check
// ← gap de tempo aqui em concorrência extrema →
const job = await takedownQueue.add('takedown', data, { jobId })  // add
```

Dois requests simultâneos com o mesmo `adId+tenantId` podem ambos passar pelo `getJob` antes de qualquer um enfileirar. O BullMQ com `jobId` fixo garante que **a fila nunca terá duplicatas** (o segundo `add` é silenciado), mas o segundo request receberá `201` em vez de `409` nesse cenário extremo.

**Trade-off consciente aceito:**
- A fila está protegida — o requisito principal do desafio é atendido
- A alternativa (atomic check-and-set via Lua script no Redis) adicionaria complexidade injustificável para o escopo
- Concorrência extrema não é um caso de uso realista para o mock atual

---

### Bug 2 — Graceful shutdown travado com Redis offline (corrigido)

**Problema:**

```typescript
await connection.quit()  // lançava exceção se Redis offline → app.close() nunca executado
```

**Correção:**

```typescript
try {
  await connection.quit()
} catch (err: unknown) {
  app.log.warn({ err }, 'Redis connection already closed during shutdown')
}
await app.close()   // sempre executado
process.exit(0)     // sempre executado
```

---

## Melhorias Aplicadas

### Health check real com verificação ativa do Redis

**Antes:** `/health` retornava `200` sempre, mesmo com Redis offline.

**Depois:**
```typescript
app.get('/health', async (_, reply) => {
  try {
    await connection.ping()
    return reply.send({ status: 'ok', redis: 'connected', timestamp: new Date().toISOString() })
  } catch {
    return reply.status(503).send({ status: 'degraded', redis: 'disconnected', timestamp: new Date().toISOString() })
  }
})
```

Agora detecta degradação real de dependência — diferencial de observabilidade.

---

### TTL nos jobs Redis

**Antes:** `removeOnComplete: false` e `removeOnFail: false` — jobs acumulavam indefinidamente no Redis.

**Depois:**
```typescript
removeOnComplete: { count: 500, age: 3600 },   // mantém GET /jobs/:id funcional por 1h
removeOnFail:    { count: 200, age: 86400 },    // observabilidade de falhas por 24h
```

Equilíbrio entre observabilidade e uso de memória Redis.

---

### Comentário de contexto no worker

**Antes:** `job.data` ignorado sem explicação — ambíguo entre decisão intencional e esquecimento.

**Depois:**
```typescript
// job.data (adId, tenantId, violationType, severity) is intentionally unused here.
// JSONPlaceholder is a static mock that simulates the Meta API HTTP contract.
// A real Meta API integration would use job.data.adId and job.data.tenantId
// to build the takedown request URL and payload.
const response = await fetch(META_API_MOCK, { signal: AbortSignal.timeout(8000) })
```

---

## Checklist de Qualidade Final

| Item | Status |
|---|---|
| `npm run build` passa sem erros | ✅ |
| Zero `any` em `src/` | ✅ |
| Zero `as` (type assertions) em `src/` | ✅ |
| Zod valida todos os campos (enums, ISO 8601, min(1)) | ✅ |
| Backoff exponencial (3 tentativas, delay 2s) | ✅ |
| Idempotência: `waiting/active/delayed` → 409 | ✅ |
| Idempotência: `completed/failed` → remove + re-enqueue | ✅ |
| GET /jobs/:id retorna 404 se job não existe | ✅ |
| Payload inválido retorna 400 com detalhes Zod | ✅ |
| Worker trata erro HTTP e de rede → retry automático | ✅ |
| Graceful shutdown completo (SIGTERM/SIGINT) | ✅ |
| Timeout HTTP 8s via AbortSignal | ✅ |
| Logger Pino estruturado (zero console.log) | ✅ |
| README com instruções completas e curl examples | ✅ |
| `docker-compose.yml` funcional | ✅ |
| 50 testes unitários passando | ✅ |
| 31 asserções E2E passando (API real) | ✅ |
| Clean Architecture: domínio puro (zero dependências externas) | ✅ |
| Clean Architecture: DIP com port + adapter | ✅ |
| Clean Architecture: Composition Root | ✅ |
| Testes de use case com InMemory adapter (sem mocks de infra) | ✅ |

---

## Conformidade Final com o Desafio

| # | Requisito (desafio.md) | Implementação | Status |
|---|---|---|---|
| 1 | `POST /webhook/violation` | `src/infrastructure/http/routes/webhook.ts` → `ProcessViolationUseCase` | ✅ |
| 2 | Validação com Zod | `src/application/dtos/violation.dto.ts` — enums + ISO 8601 + `.min(1)` | ✅ |
| 3 | HTTP 400 com erros detalhados | `ValidationError` com `details: ZodError.issues` | ✅ |
| 4 | BullMQ + Redis (Docker) | `src/infrastructure/queue/` + `docker-compose.yml` | ✅ |
| 5 | Worker → JSONPlaceholder | `fetch` com `AbortSignal.timeout(8000)` | ✅ |
| 6 | Tratamento 2xx | `{ status, ok: true }` tipado via `takedownResultSchema` | ✅ |
| 7 | Tratamento 4xx/5xx | `throw new Error()` → retry automático BullMQ | ✅ |
| 8 | Timeout/rede | `AbortSignal.timeout(8000)` captura ambos | ✅ |
| 9 | `GET /jobs/:id` | `src/infrastructure/http/routes/jobs.ts` → `GetJobStatusUseCase` | ✅ |
| 10 | Estrutura `{ jobId, status, attempts, result, error }` | Exata conforme spec | ✅ |
| 11 | 404 se job inexistente | `NotFoundError` → handler global → 404 | ✅ |
| 12 | Backoff exponencial, máx 3 tentativas | `attempts: 3`, `type: 'exponential'`, `delay: 2000` | ✅ |
| 13 | Idempotência `adId + tenantId` | Check por estado + jobId nativo BullMQ | ✅ |
| 14 | TypeScript sem `any` | Zero `any`, zero `as` em `src/` | ✅ |
| 15 | README.md detalhado | Setup, curl, payloads, scripts, resiliência | ✅ |

**15/15 requisitos atendidos.**

---

## Clean Architecture — Checklist de Aderência

| Princípio | Status | Onde |
|---|---|---|
| Domínio puro (zero dependências externas) | ✅ | `src/domain/` — models, ports, errors (sem zod, fastify, bullmq) |
| Inversão de Dependência (DIP) | ✅ | Port `TakedownQueuePort` no domínio, implementada por `BullMQTakedownQueue` na infra |
| Casos de uso com DI via construtor | ✅ | `ProcessViolationUseCase` e `GetJobStatusUseCase` recebem `TakedownQueuePort` |
| Composition Root | ✅ | `src/server.ts` — wire manual de todas as dependências |
| DTOs separados do domínio | ✅ | Zod schemas em `src/application/dtos/`, tipos puros em `src/domain/models/` |
| Controllers thin (HTTP only) | ✅ | `src/infrastructure/http/routes/` — delegam para use cases |
| Testes com Fake Repository | ✅ | `InMemoryTakedownQueue` — testes de use case sem mocks de infraestrutura |
| Erros de domínio isolados | ✅ | `src/domain/errors/app-error.ts` — sem dependência de framework HTTP |
