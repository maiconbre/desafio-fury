# FURY · Click Hero

> API robusta e resiliente em **Node.js + TypeScript** que implementa uma fila de processamento assíncrono de violações de anúncios, utilizando **Fastify**, **Zod**, **BullMQ** e **Redis**.

---

## 📂 Engenharia e Decisões Técnicas

Para auxiliar a avaliação e demonstrar a profundidade das decisões de engenharia adotadas neste projeto, disponibilizamos dois documentos detalhados:

1. **[Guia de Arquitetura](./docs/ARCHITECTURE.md)**: Explica em detalhes o design de software, a estrutura do projeto em camadas, o fluxo de dados dos webhooks até a fila assíncrona, a estratégia de idempotência de duas camadas e as políticas de resiliência (retry, backoff, timeouts e graceful shutdown).
2. **[Diário de Desenvolvimento](./docs/DEVELOPMENT_LOG.md)**: Registra o processo cronológico de desenvolvimento passo a passo (scaffolding até testes), a metodologia de pareamento com IA, a revisão crítica autônoma que identificou e resolveu bugs de concorrência e fechamento de conexões, e as melhorias de nível sênior aplicadas (health check ativo de dependência e TTL refinado para controle de memória Redis).

---

## 🛠️ Tecnologias Utilizadas

- **Fastify 5**: Framework web de alta performance com baixo overhead e suporte assíncrono moderno.
- **BullMQ 5 + Redis**: Engine de mensageria resiliente para enfileiramento distribuído com suporte nativo a controle de concorrência e repetição com backoff exponencial.
- **Zod 3**: Validação de esquemas e tipagem estática e de runtime.
- **Vitest 3**: Suite de testes rápidos e integrados com suporte nativo a ESM.
- **Pino**: Logger estruturado de alta performance para observabilidade detalhada.
- **TypeScript 5 (Strict)**: Segurança de tipo em todo o codebase.
- **Docker Compose**: Orquestração local do ambiente de infraestrutura (Redis).

---

## 🚀 Como Rodar e Testar o Projeto

Siga os passos abaixo para preparar o ambiente local e iniciar a aplicação.

### 1. Pré-requisitos
* **Node.js**: Versão 18 ou superior.
* **Docker / Docker Compose**: Para rodar o banco de dados Redis local.

### 2. Clonar o projeto e instalar dependências
```bash
# Instalar os pacotes necessários
npm install
```

### 3. Configurar variáveis de ambiente
O arquivo `.env` já vem criado na raiz do projeto e pré-configurado com os valores ideais para execução em ambiente local:
* `PORT=3000`
* `REDIS_URL=redis://localhost:6379`
* `LOG_LEVEL=info`

Caso precise customizar alguma configuração, basta editar diretamente o arquivo `.env`.

### 4. Subir a infraestrutura (Redis)
Utilize o Docker Compose para inicializar o serviço do Redis em background:
```bash
docker compose up -d
```

### 5. Iniciar a API em modo desenvolvimento
Inicie a aplicação com suporte a hot reload (atualização em tempo real ao modificar arquivos):
```bash
npm run dev
```
O servidor estará disponível em: `http://localhost:3000`

---

## 🧪 Suíte de Testes e Validação

O projeto possui uma estratégia de testes robusta dividida em duas grandes categorias, cobrindo todos os requisitos e cenários de falha.

### A. Testes Unitários e de Integração (Sem Redis)
Estes testes rodam em milissegundos isoladamente usando mocks e dublês de teste para BullMQ e fetch HTTP. Eles cobrem:
* Validações de limites e formatos de portas/variáveis de ambiente.
* Regras de validação de schemas Zod.
* Lógicas de erro de rede e comportamento de resposta do worker com chamadas HTTP simuladas.
* Integração de rotas HTTP com o Fastify injetando requests em memória.

**Comando para executar uma vez:**
```bash
npm test
```

**Comando para rodar em modo watch (desenvolvimento ativo):**
```bash
npm run test:watch
```

### B. Testes End-to-End (E2E) (Com Redis e API real)
Esta suite valida os contratos reais e a resiliência em tempo de execução. Ela levanta requisições HTTP reais contra o servidor e analisa as respostas do banco Redis e do Worker.
* **O que é testado (31 asserções)**:
  * Health check ativo de dependências.
  * Criação correta de jobs na fila com ID determinístico.
  * Rejeição de requisições malformadas (status 400).
  * Lógica de idempotência ativa e status de conflito (status 409).
  * Ciclo de vida completo do processamento de jobs e recuperação de status (status 200/404).

**Requisitos para rodar o E2E:**
1. A API deve estar rodando em segundo plano (`npm run dev`).
2. O Redis deve estar rodando no Docker (`docker compose up -d`).

**Comando para rodar (Windows PowerShell):**
```bash
npm run test:e2e
```
*Caso queira rodar o script PowerShell manualmente especificando um host diferente, você pode usar:*
```bash
powershell -ExecutionPolicy Bypass -File scripts/test-api.ps1 -BaseUrl "http://localhost:3000"
```

---

## 💻 Todos os Comandos do Projeto (CLI)

| Comando | Descrição |
|---|---|
| `npm run dev` | Inicia o servidor em modo de desenvolvimento com hot reload. |
| `npm test` | Executa todos os testes unitários e de integração uma única vez. |
| `npm run test:watch` | Executa os testes unitários em modo watch. |
| `npm run test:e2e` | Executa o script E2E de validação de rotas e fluxo contra o servidor ativo. |
| `npm run typecheck` | Executa a validação de tipos TypeScript sem compilar os arquivos. |
| `npm run build` | Compila o código TypeScript para JavaScript de produção (`dist/`). |
| `npm start` | Executa o build de produção compilado na pasta `dist/` (requer `npm run build` anterior). |

---

## 📡 Endpoints da API

A API implementa contratos estritos e bem documentados, garantindo consistência técnica em cenários de sucesso e erro.

### 1. `POST /webhook/violation`
Recebe o sinal de violação de anúncio externa, valida o formato e coloca em fila de processamento assíncrono.

* **URL**: `http://localhost:3000/webhook/violation`
* **Método**: `POST`
* **Content-Type**: `application/json`

**Exemplo de Payload (Request):**
```json
{
  "adId": "ad-123",
  "tenantId": "tenant-456",
  "violationType": "PROHIBITED_TERM",
  "severity": "HIGH",
  "detectedAt": "2026-05-21T10:00:00.000Z"
}
```

* **Regras de Validação dos Campos**:
  * `adId`: `string` não vazia (obrigatório).
  * `tenantId`: `string` não vazia (obrigatório).
  * `violationType`: deve ser um dos enums: `PROHIBITED_TERM` | `BRAND_VIOLATION` | `COMPLIANCE_FAIL`.
  * `severity`: deve ser um dos enums: `LOW` | `MEDIUM` | `HIGH` | `CRITICAL`.
  * `detectedAt`: string formatada em padrão ISO 8601 (obrigatório).

**Respostas Possíveis**:
* **201 Created**: Job inserido na fila assíncrona. Retorna o ID determinístico do job.
  ```json
  { "jobId": "ad-123_tenant-456" }
  ```
* **400 Bad Request**: Erro de validação de payload (Zod). Retorna o detalhamento do campo violado.
  ```json
  {
    "error": "Bad request",
    "message": "Validation failed",
    "details": [
      {
        "code": "invalid_enum_value",
        "path": ["severity"],
        "message": "Invalid enum value..."
      }
    ]
  }
  ```
* **409 Conflict**: Job já está na fila sendo processado ou aguardando execução. Proteção ativa de idempotência.
  ```json
  {
    "error": "Conflict",
    "message": "A takedown job for this ad and tenant is already active or waiting"
  }
  ```

**Exemplo com cURL:**
```bash
curl -X POST http://localhost:3000/webhook/violation \
  -H "Content-Type: application/json" \
  -d '{
    "adId": "ad-123",
    "tenantId": "tenant-456",
    "violationType": "PROHIBITED_TERM",
    "severity": "HIGH",
    "detectedAt": "2026-05-21T10:00:00.000Z"
  }'
```

---

### 2. `GET /jobs/:id`
Consulta o estado atual e o resultado de processamento de um job pelo seu identificador.

* **URL**: `http://localhost:3000/jobs/:id`
* **Método**: `GET`

**Respostas Possíveis**:
* **200 OK**: Retorna o estado do job.
  ```json
  {
    "jobId": "ad-123_tenant-456",
    "status": "completed",
    "attempts": 0,
    "result": { "status": 200, "ok": true },
    "error": null
  }
  ```
  *(Os possíveis valores de `status` são: `waiting`, `active`, `completed`, `failed` ou `delayed`)*
* **404 Not Found**: ID informado não coincide com nenhum job persistido no Redis (ou já expirou do TTL).
  ```json
  {
    "error": "Not found",
    "message": "No job found with id \"ad-999_tenant-999\""
  }
  ```

**Exemplo com cURL:**
```bash
curl http://localhost:3000/jobs/ad-123_tenant-456
```

---

### 3. `GET /health`
Informa a saúde geral do serviço e a conectividade de dependências ativas.

* **URL**: `http://localhost:3000/health`
* **Método**: `GET`

**Respostas Possíveis**:
* **200 OK**: Aplicação e Redis operando perfeitamente.
  ```json
  {
    "status": "ok",
    "redis": "connected",
    "timestamp": "2026-05-21T21:30:00.000Z"
  }
  ```
* **503 Service Unavailable**: O servidor está de pé, mas perdeu a conexão ativa com o Redis.
  ```json
  {
    "status": "degraded",
    "redis": "disconnected",
    "timestamp": "2026-05-21T21:30:05.000Z"
  }
  ```

**Exemplo com cURL:**
```bash
curl http://localhost:3000/health
```

---

## ⚙️ Arquitetura Resumida e Resiliência

Para mais detalhes sobre as decisões, consulte o [Guia de Arquitetura](./docs/ARCHITECTURE.md). O core do fluxo baseia-se em:

```
[ Cliente HTTP ]
       │  POST /webhook/violation (adId_tenantId)
       ▼
[ Fastify Server ] ──( Validação Zod )
       │
       ▼
[ ViolationService ] ──( Idempotência: verifica se há job ativo/waiting )
       │
       ▼  Enfileira com ID determinístico
[ BullMQ Queue ] ──[ Redis (Persistência) ]
       │
       ▼  Retira da fila assincronamente
[ Worker / processJob ] ──( Chamada externa mockada com timeout de 8s )
```

* **Idempotência Dinâmica**: Garantida via chaves exclusivas no BullMQ baseadas na combinação `adId_tenantId`. Se o job anterior falhou ou já concluiu, o sistema limpa o histórico antigo permitindo que uma nova violação para o mesmo anúncio seja reprocessada se reenviada.
* **Resiliência Transiente**: Políticas de retentativa automática configuradas com **3 tentativas no máximo** e **backoff exponencial de 2 segundos** (2s, 4s, 8s).
* **Gestão de Memória Redis**: Jobs bem-sucedidos expiram em 1 hora (`removeOnComplete: { age: 3600 }`) e falhos expiram em 24 horas (`removeOnFail: { age: 86400 }`) mantendo a fila enxuta e saudável.
* **Desligamento Gracioso (Graceful Shutdown)**: Captura de sinais do sistema operacional (`SIGTERM` e `SIGINT`) garantindo que conexões ao Redis e processamento ativo do Worker sejam fechados limpos sem perda ou corrupção de mensagens.
