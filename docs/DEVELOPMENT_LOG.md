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
| `violation.test.ts` | 9 | Schema Zod — exaustivo em tipos, campos e formato de data |
| `worker.test.ts` | 5 | processJob — success, 400, 500, network error, timeout abort |
| `env.test.ts` | 5 | Configuração — valida limites da porta e parse de variáveis nativas |
| `use-cases/process-violation.test.ts` | 12 | Delegação p/ fila, verificação exata de idempotência e propagação de ValidationError |
| `use-cases/get-job-status.test.ts` | 7 | Transformação de status, 404 para jobs inexistentes |
| `integration/api.test.ts` | 11 | Contrato HTTP completo com InMemoryAdapter e mock de injeção |
| **Total** | **49** | **6 suites** |

### Fase 8 — Documentação

- `README.md` com instruções, endpoints, exemplos curl, scripts, resiliência
- `docs/ARCHITECTURE.md` com fluxo de dados, componentes e decisões técnicas
- `docs/DEVELOPMENT_LOG.md` (este arquivo)
- Script `scripts/test-api.ps1` com 33 asserções E2E contra a API real

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
| Idempotência estrita: 409 Conflict para duplicatas em *qualquer* estado | ✅ |
| GET /jobs/:id retorna 404 se job não existe | ✅ |
| Payload inválido retorna 400 com detalhes Zod | ✅ |
| Worker trata erro HTTP e de rede → retry automático | ✅ |
| Graceful shutdown completo (SIGTERM/SIGINT) | ✅ |
| Timeout HTTP 8s via AbortSignal | ✅ |
| Logger Pino estruturado (zero console.log) | ✅ |
| README com instruções completas e curl examples | ✅ |
| `docker-compose.yml` funcional | ✅ |
| 49 testes unitários/integração passando | ✅ |
| 33 asserções E2E passando (API real) | ✅ |
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
| 6 | Tratamento 2xx | `{ status }` tipado via `takedownResultSchema` | ✅ |
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

---

## Fase 10 — Melhorias Primeira Revisão

Após revisão crítica do código, 11 melhorias foram identificadas e aplicadas para elevar a qualidade do projeto. Nenhuma delas adiciona funcionalidade fora do escopo do desafio — todas são refinamentos de qualidade e consistência.

### Grupo A — Correção de inconsistências

**A1 — `logger.ts` → `config/env.ts`**

O `logger.ts` lia `process.env.LOG_LEVEL` diretamente, bypassando o módulo centralizado de configuração. Corrigido para importar `env.LOG_LEVEL` de `config/env.ts` — único ponto de acesso a variáveis de ambiente na aplicação.

**A2 — `require()` → `import()` dinâmico em `worker.test.ts`**

O mock do BullMQ usava `require('node:events')` dentro de `vi.mock()` em projeto ESM (`"type": "module"`). Substituído por factory assíncrona com `await import('node:events')` — comportamento correto para ESM.

**A3 — `tsconfig.test.json` + typecheck dos testes**

`tsc --noEmit` não validava os arquivos em `tests/` (excluídos do `tsconfig.json` base). Criado `tsconfig.test.json` que extende o base e inclui `tests/`. O script `typecheck` agora valida ambos: `tsc --noEmit && tsc -p tsconfig.test.json --noEmit`.

**A4 — `.env.example` versionado**

O repositório não tinha um `.env.example` versionado. Criado com todos os campos documentados (REDIS_URL, PORT, LOG_LEVEL) e instruções de uso. O `.env` local continua ignorado pelo `.gitignore`.

**A5 — Removido `ok: true` como literal type**

`TakedownResult.ok: true` era um literal fixo sem valor discriminante — o worker nunca retorna `ok: false`, então o tipo não acrescentava nada. Removido de `domain/models/violation.ts`, `application/dtos/violation.dto.ts`, `infrastructure/queue/worker.ts` e testes correspondentes.

**A6 — `error-handler.ts`: `ErrorResponse` no `ERROR_MAP`**

O tipo `ReturnType<typeof internal>` no `ERROR_MAP` era desnecessariamente verboso. Substituído pela interface `ErrorResponse` que já existia no arquivo `app-error.ts` — mais legível e semânticamente correto.

### Grupo B — Cobertura de testes

**B1 — Teste do health check degradado (503)**

O cenário de Redis offline no `/health` estava implementado mas sem teste. Adicionado teste em `api.test.ts` que usa uma instância Fastify isolada com `ping()` mockado para lançar exceção — sem depender de Redis real.

**B4 — Comentário `concurrency: 1` no worker**

Adicionado comentário explicando que `concurrency: 1` é conservador para o mock JSONPlaceholder e que em produção com a Meta API real o valor deve ser avaliado com base nos rate limits.

### Grupo C — Polimento arquitetural

**C1 — `engines` no `package.json`**

Adicionado `"engines": { "node": ">=18.0.0" }` formalizando o requisito de Node.js já mencionado no README.

**C2 — Comentário inline da race condition**

O trade-off da race condition de idempotência estava documentado apenas no `DEVELOPMENT_LOG.md`. Movido para comentário inline em `process-violation.ts`, no ponto exato onde o gap existe — visível para qualquer revisor de PR.

**C3 — Atualização deste DEVELOPMENT_LOG**

Este registro documenta as melhorias aplicadas na Fase 10.

---

## Fase 11 — Refatoração e Operações Avançadas (Pós-Revisão)

Após uma rodada de revisão sob critérios rigorosos, o projeto foi submetido a uma grande refatoração de infraestrutura, concorrência e testes para atingir estabilidade de produção corporativa premium.

### Melhorias Técnicas Implementadas:

1. **DIP na Meta API (Worker)**:
   - Criada a porta pura no domínio `MetaGatewayPort` e a implementação concreta `HttpMetaGateway` na infraestrutura.
   - Refatorado o worker para aceitar injeção de dependência via factories (`createProcessJob` e `setupWorker`).
   - Mocks de testes no `worker.test.ts` foram simplificados drasticamente, deixando de depender de simulação interna do BullMQ e de sockets de rede globais.

2. **Neutralização de Race Conditions (Idempotência Transacional)**:
   - Implementado um controle de exclusão mútua curto (lock distribuído de 5s com opções `'PX', ttlMs, 'NX'`) no Redis antes de realizar o check-then-act do enfileiramento de jobs no use case `ProcessViolationUseCase`.
   - Garante que webhooks duplicados em microssegundos respondam de forma consistente HTTP 409 Conflict, protegendo o contrato HTTP e a integridade da fila do BullMQ.

3. **Novo E2E Nativo Multiplataforma (Vitest)**:
   - O script PowerShell legado `scripts/test-api.ps1` foi excluído.
   - Criada a suíte de testes E2E `tests/integration/api.e2e.test.ts` escrita em Vitest usando requests físicos locais.
   - Scripts do `package.json` unificados e compatibilizados para rodar nativamente em qualquer sistema operacional (inclusive containers Docker e pipelines de CI/CD Linux).

4. **Tratamento de Erros e Health Check Injetável**:
   - Correção do handler global de erros no Fastify (`error-handler.ts`) para erros HTTP nativos de infraestrutura menor que 500 (ex: payload JSON corrompido com status 400). Erros não são mais ocultados como HTTP 500.
   - Desacoplada a rota de saúde `/health` em um plugin de rotas isolado `healthRoutes`, permitindo injetar dinamicamente a verificação de ping do Redis tanto no Composition Root quanto nos testes de integração.

5. **Timeout no Graceful Shutdown**:
   - Implementado um timeout global de 10s no shutdown do `server.ts` que força a saída com erro (`process.exit(1)`) caso conexões ativas travem no término do processo.

### Homologação Final da Fase 11:
- `npm run typecheck` completado com **100% de sucesso**.
- `npm test` executando **53 testes unitários e de integração passados**.
- `npm run test:e2e` executando **17 testes E2E reais passados** contra o Redis e servidor ativo.
