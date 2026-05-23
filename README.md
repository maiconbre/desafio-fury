# FURY

> **FURY** é uma API robusta e resiliente em **Node.js + TypeScript** projetada para processamento assíncrono de violações de anúncios em larga escala. A solução utiliza **Fastify** para baixa latência, **Zod** para validação estrita de contratos e **BullMQ + Redis** para gerenciamento de filas distribuídas com garantias de idempotência e tolerância a falhas.

---

## 📚 Documentação do Projeto

Para explorar os detalhes técnicos, decisões de design e especificações de endpoints, consulte os guias dedicados:

* 📘 **[Referência Completa da API](./docs/API.md)**: Detalhamento de todos os endpoints, payloads JSON de entrada/saída, validações de esquemas, códigos de status e exemplos de requisição com cURL.
* 🏗️ **[Guia de Arquitetura](./docs/ARCHITECTURE.md)**: Explicação aprofundada da estrutura em camadas (Clean Architecture), fluxo de dados do webhook às filas, estratégia de idempotência dupla e tratamento de graceful shutdown.
* 📔 **[Diário de Desenvolvimento](./docs/DEVELOPMENT_LOG.md)**: Histórico cronológico do desenvolvimento do projeto, processo de pareamento com IA, correções de concorrência e decisões de infraestrutura.

---

## 🛠️ Tecnologias Utilizadas

* **Fastify 5**: Framework web ultrarrápido com suporte assíncrono moderno e baixo overhead.
* **BullMQ 5 + Redis**: Gerenciamento de filas assíncronas com tratamento nativo de retentativas e concorrência.
* **Zod 3**: Validação estrita de esquemas em tempo de execução e inferência de tipos.
* **Vitest 3**: Framework de testes rápidos integrados com suporte nativo a ESM.
* **Pino**: Logger estruturado de alta performance para observabilidade detalhada.
* **Docker Compose**: Orquestração local do Redis.

---

## 🚀 Como Rodar e Testar o Projeto

Siga os passos abaixo para inicializar o ambiente local e rodar a aplicação de forma rápida.

### 1. Pré-requisitos
* **Node.js**: Versão 18 ou superior.
* **Docker / Docker Compose**: Para execução do Redis local.

### 2. Configuração do Ambiente
Instale as dependências do projeto e garanta que o arquivo `.env` esteja configurado na raiz (o projeto já disponibiliza uma pré-configuração ideal por padrão):

```bash
# Instalar dependências
npm install
```

### 3. Execução da Infraestrutura e API
Suba o container do Redis em segundo plano e inicie a API em modo de desenvolvimento (com hot reload):

```bash
# Iniciar o banco de dados Redis
docker compose up -d

# Iniciar a API em modo desenvolvimento
npm run dev
```

A API estará disponível em: `http://localhost:3000`

---

## 🧪 Suíte de Testes e Validação

O projeto possui uma estratégia de testes dividida em duas categorias complementares:

### A. Testes Unitários e de Integração (Sem Redis)
Focados na validação rápida de regras de negócio, esquemas Zod, formatação de variáveis de ambiente e rotas HTTP simuladas em memória.
```bash
# Executar testes unitários uma vez
npm test

# Executar testes unitários em modo ativo (Watch)
npm run test:watch
```

### B. Testes End-to-End (E2E) (Requer Redis ativo)
Validação de ponta a ponta realizada nativamente via Vitest que realiza requisições reais usando fetch contra a API ativa e verifica o comportamento das filas, da concorrência com locks e a persistência de dados no Redis.
```bash
# Executar a suíte de testes E2E
npm run test:e2e
```

---

## 💻 Comandos Úteis (CLI)

| Comando | Descrição |
|---|---|
| `npm run dev` | Inicia o servidor em modo de desenvolvimento com hot-reload. |
| `npm test` | Executa os testes unitários e de integração uma única vez (exclui E2E). |
| `npm run test:watch` | Executa os testes unitários em modo watch. |
| `npm run test:e2e` | Executa os testes E2E nativos do Vitest contra a API real em execução. |
| `npm run typecheck` | Valida a tipagem estática do TypeScript. |
| `npm run build` | Compila o código TypeScript para JavaScript de produção (`dist/`). |
| `npm start` | Executa a build compilada em produção (requer `npm run build`). |

---

## ⚙️ Fluxo e Resiliência Resumidos

A API foi projetada focando em resiliência e estabilidade transiente:

```
[ Cliente HTTP ]
       │  POST /webhook/violation (adId_tenantId)
       ▼
[ Fastify Server ] ──( Validação Zod )
       │
       ▼
[ ViolationUseCase ] ──( Idempotência: Lock Redis NX/PX de 5s + Bloqueio 409 )
       │
       ▼  Enfileira com ID determinístico
[ BullMQ Queue ] ──[ Redis (Persistência) ]
       │
       ▼  Retira da fila assincronamente
[ Worker / processJob ] ──( MetaGatewayPort ➔ HttpMetaGateway ➔ chamada mockada timeout 8s )
```

* **Idempotência e Concorrência**: Garantida através de identificadores determinísticos baseados na concatenação `adId_tenantId` acoplados a um Lock Distribuído curto (5 segundos) no Redis. Isso impede condições de corrida em concorrência extrema e retorna HTTP 409 Conflict consistentemente.
* **Políticas de Retry**: Até **3 tentativas** automáticas com **backoff exponencial** de 2 segundos (2s, 4s, 8s).
* **Gestão de Memória**: Expiração de jobs completados após 1 hora e falhados após 24 horas no Redis.
* **Graceful Shutdown**: Intercepção de sinais `SIGTERM` e `SIGINT` para fechamento seguro de conexões, finalização ordenada de jobs ativos com um timeout de segurança de 10 segundos.

Para uma descrição completa da arquitetura do projeto, consulte o **[Guia de Arquitetura](./docs/ARCHITECTURE.md)**.

---

## ✒️ Créditos

Desenvolvido por **Maicon B.**
* [Portfólio](https://maicon-dev.vercel.app/)
