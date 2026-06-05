# 🚀 Especificação de Arquitetura do SaaS

> **Versão:** 1.0
>
> **Objetivo:** Construir um SaaS moderno de gerenciamento de anúncios com alta performance, baixo custo operacional e escalabilidade gradual.
>
> **Filosofia:** Simplicidade primeiro. Escalar somente quando necessário.

---

# 📚 Sumário

* Visão Geral
* Filosofia da Arquitetura
* Stack Tecnológica
* Infraestrutura
* Arquitetura Geral
* Ciclo de Vida das Requisições
* Estrutura DDD
* Estratégia do Banco de Dados
* Redis & BullMQ
* Git Flow
* CI/CD
* Observabilidade
* Estratégia de Backup
* Planejamento de Capacidade
* Roadmap de Escalabilidade
* Princípios de Desenvolvimento
* Objetivo Final

---

# 🎯 Visão Geral

Este projeto tem como objetivo fornecer uma plataforma SaaS altamente performática para gerenciamento de anúncios, capaz de suportar milhares de usuários mantendo:

* Código Limpo (Clean Code)
* DDD (Domain Driven Design)
* SOLID
* Alta Performance
* Baixo Custo Operacional
* Deploy Contínuo
* Facilidade de Manutenção
* Escalabilidade Horizontal

---

# ⚡ Filosofia da Arquitetura

## A API nunca deve executar tarefas pesadas.

### Fluxo ideal

```text
Cliente
   │
   ▼
API
   │
   ├── Validação
   ├── Persistência no PostgreSQL
   ├── Criação do Job no BullMQ
   │
   └── Retorna HTTP 200
```

Worker:

```text
Worker
   │
   ├── IA
   ├── Marketplace
   ├── Notificações
   ├── E-mails
   └── Atualização Dashboard
```

---

## Regra de Ouro

> Se uma operação levar mais de aproximadamente 300ms, ela deve ser considerada para processamento assíncrono via BullMQ.

---

# 🛠 Stack Tecnológica

## Frontend

* Next.js
* TypeScript
* TailwindCSS
* TanStack Query
* React Hook Form
* Zod

---

## Backend

* Node.js
* Fastify
* TypeScript

Padrões utilizados:

* DDD
* SOLID
* Repository Pattern
* Use Cases
* Dependency Injection
* Arquitetura orientada a eventos (Event Driven)

---

## Banco de Dados

* PostgreSQL
* Prisma ORM

---

## Cache e Filas

* Redis
* BullMQ

---

## Infraestrutura

* Ubuntu Server 24.04 LTS
* Docker
* Docker Compose
* Coolify
* Traefik

---

## Observabilidade

* Uptime Kuma
* Sentry
* Pino Logger

---

# 🖥 Infraestrutura Inicial

## Servidor

| Recurso             | Valor            |
| ------------------- | ---------------- |
| CPU                 | 4 vCPU           |
| RAM                 | 16 GB            |
| Disco               | 200 GB NVMe      |
| Virtualização       | KVM              |
| Sistema Operacional | Ubuntu 24.04 LTS |

---

## Containers

```text
coolify

frontend

backend

worker

postgres

redis

uptime-kuma
```

---

# 🏗 Arquitetura Geral

```text
                    Cloudflare

                         │

                    HTTPS

                         │

                    Traefik

                         │

          ┌──────────────┴──────────────┐

          │                             │

          ▼                             ▼

     Frontend                      Backend API

     (Next.js)                     (Fastify)

                                         │

                 ┌───────────────────────┼────────────────────────┐

                 ▼                       ▼                        ▼

           PostgreSQL                Redis                  BullMQ

                                                                  │

                                                      ┌───────────┴───────────┐

                                                      ▼                       ▼

                                                 Worker 1               Worker N
```

---

# 🔄 Ciclo de Vida das Requisições

## Operação de Leitura

```text
Cliente

   │

   ▼

API

   │

Redis Cache

   │

Hit ? ─────────────► Retorna

   │

Miss

   │

PostgreSQL

   │

Atualiza Cache

   │

Retorna
```

---

## Operação de Escrita

```text
Cliente

   │

   ▼

API

   │

PostgreSQL

   │

BullMQ.add()

   │

HTTP 200

          │

          ▼

      Worker

          │

          ├── IA

          ├── Marketplace

          ├── Email

          └── Dashboard
```

---

# 🧩 Domain Driven Design (DDD)

```text
src/

modules/

├── auth/

├── users/

├── organizations/

├── ads/

├── campaigns/

├── dashboard/

├── integrations/

├── notifications/

└── analytics/

shared/

├── cache/

├── config/

├── database/

├── events/

├── http/

├── queue/

└── utils/
```

---

## Estrutura de um módulo

```text
ads/

├── domain/

├── application/

├── infrastructure/

└── presentation/
```

---

# 🗄 Estratégia do Banco de Dados

## Regras

* UUID como chave primária.
* Soft Delete.
* Campos de auditoria.
* Migrations versionadas.

---

## Entidade Base

```prisma
id String @id @default(uuid())

createdAt DateTime @default(now())

updatedAt DateTime @updatedAt

deletedAt DateTime?
```

---

## Fluxo de Migrations

```text
schema.prisma

      │

      ▼

prisma migrate dev

      │

      ▼

Commit

      │

      ▼

CI/CD

      │

      ▼

Produção
```

---

# 🚀 Estratégia do Redis

O Redis será responsável por:

* BullMQ
* Cache Dashboard
* Rate Limiting
* Sessões futuras
* Distributed Locks futuros

---

## TTL do Cache

| Recurso    | TTL          |
| ---------- | ------------ |
| Dashboard  | 30 segundos  |
| Analytics  | 60 segundos  |
| Relatórios | 300 segundos |

---

# ⚙ Estratégia BullMQ

## Filas

```text
ads-processing

ads-publish

dashboard-update

emails

notifications

analytics

webhooks
```

---

## Workers

```text
worker

├── ads

├── notifications

├── emails

└── analytics
```

---

# 🌳 Git Flow

## Branches

```text
main

develop

feature/*

hotfix/*
```

---

## Fluxo de Desenvolvimento

```text
feature/create-ad

          │

          ▼

      develop

          │

          ▼

 beta.seusaas.com

          │

          ▼

        main

          │

          ▼

 app.seusaas.com
```

---

## Fluxo de Hotfix

```text
hotfix/login

      │

      ▼

    main

      │

      ▼

   develop
```

---

## Regras

* Nunca desenvolver diretamente na develop.
* Nunca criar hotfix a partir da develop.
* Toda feature deve possuir Pull Request.
* Produção recebe deploy apenas pela main.

---

# 🔥 CI/CD

GitHub Actions.

Pipeline:

```text
Install

Lint

Typecheck

Tests

Prisma Generate

Docker Build

Deploy
```

---

## Ambientes

| Branch  | Ambiente |
| ------- | -------- |
| develop | Beta     |
| main    | Produção |

---

# 📈 Observabilidade

## Uptime Kuma

Monitorar:

* Frontend
* Backend
* PostgreSQL
* Redis

---

## Logs

Pino Logger.

Campos obrigatórios:

* requestId
* userId
* route
* latency
* statusCode

---

## Rastreamento de Erros

Sentry.

Capturar:

* Exceptions
* Stack Traces
* Performance

---

# 💾 Estratégia de Backup

Diariamente:

```bash
pg_dump
```

Compactação:

```bash
tar -czf backup.tar.gz
```

Destino:

* Cloudflare R2

Política:

| Tipo    | Quantidade |
| ------- | ---------- |
| Diário  | 7          |
| Semanal | 4          |
| Mensal  | 3          |

---

# 📊 Planejamento de Capacidade

## Consumo Médio de Memória

| Serviço     | RAM      |
| ----------- | -------- |
| Ubuntu      | 800 MB   |
| Coolify     | 400 MB   |
| Frontend    | 300 MB   |
| Backend     | 400 MB   |
| Worker      | 300 MB   |
| PostgreSQL  | 1.500 MB |
| Redis       | 500 MB   |
| Uptime Kuma | 150 MB   |

Total aproximado:

**≈ 4,5 GB**

Memória disponível:

**≈ 11 GB**

---

# 👥 Capacidade Estimada

## MVP

* 100 clientes pagantes
* 1.000 usuários cadastrados
* 20 usuários simultâneos

CPU:

10%

RAM:

5 GB

---

## Validação

* 300 clientes pagantes
* 5.000 usuários
* 50 simultâneos

CPU:

30%

RAM:

7 GB

---

## Crescimento

* 800 clientes pagantes
* 15.000 usuários
* 150 simultâneos

CPU:

50%

RAM:

9 GB

---

## Limite Confortável

* 2.000 clientes pagantes
* 30.000 usuários cadastrados
* 250 usuários simultâneos

CPU:

80%

RAM:

12 GB

---

# 📦 Throughput BullMQ

## Jobs Leves

* Cache
* Emails
* Dashboard

Capacidade:

**100.000 ~ 300.000 jobs/dia**

---

## Jobs Médios

* Publicação de anúncios
* Sincronização Marketplace

Capacidade:

**30.000 ~ 80.000 jobs/dia**

---

## Jobs Pesados

* IA
* Processamento de Imagens

Capacidade:

**5.000 ~ 20.000 jobs/dia**

---

# 📈 Roadmap de Escalabilidade

## Estágio 1

```text
Frontend

Backend

Worker

PostgreSQL

Redis
```

Até:

* 300 usuários simultâneos
* 2.000 clientes pagantes

---

## Estágio 2

Adicionar Workers

```text
Worker-1

Worker-2

Worker-3
```

Até:

* 500 usuários simultâneos

---

## Estágio 3

Separar Banco de Dados

```text
VPS APP

Frontend

Backend

Workers

-----------------

VPS DATA

PostgreSQL

Redis
```

Até:

* 800 usuários simultâneos
* 5.000 clientes pagantes

---

## Estágio 4

Escalabilidade Horizontal

```text
             Load Balancer

          ┌──────┴──────┐

        API-1      API-2

          ┌──────┴──────┐

     Worker1 Worker2 Worker3

            PostgreSQL

               Redis
```

Capacidade estimada:

* 1.000+ usuários simultâneos
* 10.000+ clientes pagantes

---

# 📏 Princípios de Desenvolvimento

## API

* Rápida
* Stateless
* Leve

---

## PostgreSQL

* Fonte única da verdade

---

## Redis

* Camada de velocidade

---

## BullMQ

* Camada de processamento pesado

---

## Dashboard

Nunca calcular métricas em tempo real.

Sempre utilizar projeções em cache.

---

# 🎯 Princípios Arquiteturais

> A API orquestra.

> O PostgreSQL armazena.

> O Redis acelera.

> O BullMQ processa.

> Os Workers escalam.

> A simplicidade vence.

---

# 🚀 Objetivo Final

Construir um SaaS capaz de evoluir de uma única VPS KVM para uma arquitetura distribuída, mantendo a mesma base de código, a mesma organização arquitetural e a mesma simplicidade operacional.

**Escalar adicionando Workers, e não complexidade.**
