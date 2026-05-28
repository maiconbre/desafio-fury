# Referência da API — FURY

Este documento fornece a documentação técnica completa e detalhada dos endpoints expostos pela API FURY, incluindo payloads, respostas de sucesso e de erro, regras de validação e exemplos práticos de consumo.

A API é exposta por padrão em `http://localhost:3000`.

---

## 📡 Visão Geral dos Endpoints

| Método | Rota | Descrição | Controle de Acesso / Requisitos |
|---|---|---|---|
| `POST` | `/webhook/violation` | Envia uma violação de anúncio para processamento assíncrono. | Payload JSON válido |
| `GET` | `/jobs/:id` | Consulta o status e o resultado do processamento de um job. | ID do job em formato `adId_tenantId` |
| `GET` | `/health` | Verifica a integridade da API e das dependências (Redis). | Nenhum |

---

## 🚀 Detalhes dos Endpoints

### 1. `POST /webhook/violation`

Recebe o sinal de violação de anúncio externa, valida o formato dos dados de entrada, executa regras de idempotência e insere um job de processamento assíncrono (takedown) na fila do BullMQ.

- **URL**: `/webhook/violation`
- **Método**: `POST`
- **Headers Obrigatórios**:
  - `Content-Type: application/json`

#### 📋 Esquema de Validação do Payload (Request Body)

A validação é feita utilizando **Zod**. Qualquer campo ausente ou em formato incorreto resultará em um erro `400 Bad Request`.

| Campo | Tipo | Obrigatório | Regras de Validação | Descrição |
|---|---|---|---|---|
| `adId` | `string` | Sim | Não pode ser vazio. | Identificador único do anúncio no parceiro/plataforma. |
| `tenantId` | `string` | Sim | Não pode ser vazio. | Identificador do inquilino (tenant) proprietário do anúncio. |
| `violationType` | `enum` | Sim | Deve ser um dos seguintes valores:<br>- `"PROHIBITED_TERM"`<br>- `"BRAND_VIOLATION"`<br>- `"COMPLIANCE_FAIL"` | Tipo de violação que gerou o alerta de remoção. |
| `severity` | `enum` | Sim | Deve ser um dos seguintes valores:<br>- `"LOW"`<br>- `"MEDIUM"`<br>- `"HIGH"`<br>- `"CRITICAL"` | Nível de severidade/prioridade da infração. |
| `detectedAt` | `string` | Sim | Deve seguir o padrão de data ISO 8601 (ex: `2026-05-21T10:00:00.000Z`). | Data e hora em que a infração foi detectada pelo sistema. |

#### 📥 Exemplo de Payload de Entrada (Request)
```json
{
  "adId": "ad-123",
  "tenantId": "tenant-456",
  "violationType": "PROHIBITED_TERM",
  "severity": "HIGH",
  "detectedAt": "2026-05-21T10:00:00.000Z"
}
```

#### 📤 Respostas Possíveis

##### **201 Created**
Retornado quando a requisição passa por todas as validações e o job é enfileirado com sucesso.
- **Corpo da Resposta**:
  ```json
  {
    "jobId": "ad-123_tenant-456"
  }
  ```
  > [!NOTE]
  > O `jobId` é gerado de forma determinística seguindo o padrão `{adId}_{tenantId}`. Isso é crucial para garantir a idempotência do fluxo.

##### **400 Bad Request**
Retornado caso os dados enviados sejam inválidos em relação ao esquema Zod.
- **Corpo da Resposta**:
  ```json
  {
    "error": "Bad request",
    "message": "Validation failed",
    "details": [
      {
        "code": "invalid_enum_value",
        "expected": "'PROHIBITED_TERM' | 'BRAND_VIOLATION' | 'COMPLIANCE_FAIL'",
        "received": "INVALID_TYPE",
        "path": [
          "violationType"
        ],
        "message": "Invalid enum value. Expected 'PROHIBITED_TERM' | 'BRAND_VIOLATION' | 'COMPLIANCE_FAIL', received 'INVALID_TYPE'"
      }
    ]
  }
  ```

##### **409 Conflict**
Retornado se já existir um job com a mesma combinação de `adId` e `tenantId` em estado pendente/em execução (`waiting`, `active` ou `delayed`).
- **Corpo da Resposta**:
  ```json
  {
    "error": "Conflict",
    "message": "A job for adId \"ad-123\" and tenantId \"tenant-456\" already exists"
  }
  ```
  > [!TIP]
  > Esta camada de proteção impede que múltiplos disparos redundantes consumam infraestrutura externa e gerem condições de corrida concorrentes sobre o mesmo anúncio.

#### 💻 Exemplo de Requisição com cURL
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

Consulta o estado atual, número de tentativas de processamento e os resultados de um job na fila pelo seu identificador determinístico (`adId_tenantId`).

- **URL**: `/jobs/:id` (ex: `/jobs/ad-123_tenant-456`)
- **Método**: `GET`

#### 📤 Respostas Possíveis

##### **200 OK**
O job foi encontrado. O corpo detalha seu estado e o resultado caso já tenha sido concluído.
- **Corpo da Resposta**:
  ```json
  {
    "jobId": "ad-123_tenant-456",
    "status": "completed",
    "attempts": 1,
    "result": {
      "status": 200,
      "ok": true
    },
    "error": null
  }
  ```

  ###### **Explicação dos Campos da Resposta:**
  - `jobId`: O identificador determinístico do job consultado.
  - `status`: O estado atual do job no BullMQ. Pode assumir um dos seguintes valores:
    - `waiting`: O job está na fila aguardando que um worker o retire para processamento.
    - `active`: O worker está processando o job neste exato momento.
    - `completed`: O processamento terminou com sucesso.
    - `failed`: O processamento falhou após esgotar todas as tentativas permitidas.
    - `delayed`: O job está temporariamente pausado devido a uma política de backoff.
  - `attempts`: O número de tentativas de execução realizadas até o momento.
  - `result`: O retorno do processamento assíncrono (preenchido apenas quando o status é `completed`).
  - `error`: Mensagem de erro capturada caso o job esteja no estado de falha (`failed`).

##### **404 Not Found**
Retornado caso o ID fornecido não coincida com nenhum job na memória do Redis, ou se o job já tiver expirado do tempo de vida (TTL) configurado.
- **Corpo da Resposta**:
  ```json
  {
    "error": "Not found",
    "message": "No job found with id \"ad-999_tenant-999\""
  }
  ```
  > [!NOTE]
  > Para evitar consumo excessivo de RAM no Redis, os metadados de jobs concluídos com sucesso são removidos automaticamente após **1 hora**, e os de falha após **24 horas**.

#### 💻 Exemplo de Requisição com cURL
```bash
curl http://localhost:3000/jobs/ad-123_tenant-456
```

---

### 3. `GET /health`

Informa sobre a integridade operacional da API e a saúde da conectividade direta com o banco Redis. Utilizado para orquestração de containers e monitoramento ativo de produção (liveness/readiness probes).

- **URL**: `/health`
- **Método**: `GET`

#### 📤 Respostas Possíveis

##### **200 OK**
A aplicação e o Redis estão saudáveis e conectados.
- **Corpo da Resposta**:
  ```json
  {
    "status": "ok",
    "redis": "connected",
    "timestamp": "2026-05-21T21:30:00.000Z"
  }
  ```

##### **503 Service Unavailable**
A API está rodando, porém a conexão ativa com o Redis caiu ou falhou. O sistema opera em modo degradado.
- **Corpo da Resposta**:
  ```json
  {
    "status": "degraded",
    "redis": "disconnected",
    "timestamp": "2026-05-21T21:30:05.000Z"
  }
  ```
  > [!WARNING]
  > Quando o Redis está desconectado, novos jobs não podem ser criados ou consultados, causando a rejeição imediata de novos webhooks.

#### 💻 Exemplo de Requisição com cURL
```bash
curl http://localhost:3000/health
```

---

## 🧪 Teste de Integração / E2E

Para validar o fluxo completo contra a API real em execução:

1. Garanta que a API esteja rodando (`npm run dev`) e o Redis esteja ativo (`docker compose up -d`).
2. Execute:
   ```bash
   npm run test:e2e
   ```

Os testes E2E cobrem cenários de payload válido/inválido, idempotência, consulta de status e health check.
