# FURY · Click Hero
## Desafio Técnico — Full Stack Pleno

---

## 📝 Contexto

Você está sendo avaliado para uma posição de **Full Stack Pleno** no projeto **FURY** — um gestor autônomo de tráfego pago movido a IA. 

Uma das funcionalidades centrais do produto é a integração com a **Meta Ads API**: nosso sistema precisa buscar dados de anúncios, processá-los e enfileirar ações automaticamente.

> [!NOTE]
> Este desafio simula uma tarefa real da **Sprint 1** do projeto.

---

## 🎯 O Desafio

### Objetivo
Construir uma mini-API em **Node.js + TypeScript** que execute os seguintes passos:

1. **Webhook de Violação (`POST`)**: Receba um webhook que simula uma notificação de anúncio com violação.
2. **Validação**: Valide o payload recebido utilizando **Zod**.
3. **Fila de Execução**: Enfileire um job de `'takedown'` usando **BullMQ**.
4. **Processamento (Worker)**: O worker deste job deve fazer uma chamada HTTP externa para simular a integração com a Meta API. 
   - **Endpoint substituto**: Use a API pública [JSONPlaceholder - Posts](https://jsonplaceholder.typicode.com/posts/1) apenas para testar o fluxo HTTP (sucesso, falha, retry).
   - **Tratamento de Erros**: Trate corretamente os cenários de sucesso (`2xx`) e falha (`4xx`/`5xx` ou timeout). Não é necessário validar ou mapear o conteúdo da resposta externa.
5. **Consulta de Status (`GET`)**: Exponha um endpoint `GET /jobs/:id` que retorne o status atual do job na fila.

---

### 📥 Payload do Webhook

**Rota:** `POST /webhook/violation`

```json
{
  "adId": "string (obrigatório)",
  "tenantId": "string (obrigatório)",
  "violationType": "PROHIBITED_TERM | BRAND_VIOLATION | COMPLIANCE_FAIL",
  "severity": "LOW | MEDIUM | HIGH | CRITICAL",
  "detectedAt": "ISO 8601 datetime"
}
```

---

### ⚙️ Requisitos Técnicos

- **TypeScript**: Utilizar tipagem consistente em toda a aplicação (evitar o uso de `any`).
- **Validação de Payload (Zod)**: Em caso de payload inválido, retornar HTTP Status `400` com os erros detalhados.
- **BullMQ + Redis**: Gerenciamento de filas com Redis (pode ser executado localmente via Docker ou utilizando Upstash free tier).
- **Resiliência no Worker**: Tratar falhas com retry automático e estratégia de **backoff exponencial** (máximo de 3 tentativas).
- **Idempotência**: Garantir que o mesmo par `adId` + `tenantId` **não** gere dois jobs simultâneos em execução/pendentes na fila.
- **Endpoint de Status**: `GET /jobs/:id` deve retornar a seguinte estrutura:
  ```json
  {
    "jobId": "string",
    "status": "string",
    "attempts": 0,
    "result": {},
    "error": "string | null"
  }
  ```
- **Documentação**: Incluir um arquivo `README.md` detalhado com instruções claras de como rodar o projeto localmente.

---

## 🚦 Regras e Entrega

- **📅 Prazo**: Até domingo às 20h.
- **📤 Entrega**: Preencha o formulário em [Forms Google](https://forms.gle/SzsmQo2JJVX1AfJ57) informando o link do seu repositório público no GitHub.
- **🛠️ Ferramentas**: Pode e deve usar o **Claude Code** (ou a ferramenta de IA/IDE de sua preferência) naturalmente no seu dia a dia.
- **🚫 Escopo Reduzido**: Não é necessário implementar autenticação, banco de dados persistente tradicional (SQL/NoSQL além do Redis) ou front-end.
- **💎 Qualidade sobre Quantidade**: Foque na qualidade do código, boas práticas, tratamento de erros e arquitetura limpa.

---

> [!TIP]
> Em caso de dúvidas sobre o enunciado, entre em contato antes de assumir premissas. Ambiguidade produtiva ou proposital **não** faz parte deste desafio.
