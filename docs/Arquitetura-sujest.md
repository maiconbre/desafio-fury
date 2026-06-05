SaaS Architecture Specification

Version 1.0

⸻

1. Objetivo

Construir um SaaS moderno de gerenciamento de anúncios, priorizando:

* Alta performance;
* Baixo custo operacional;
* Código limpo;
* Arquitetura DDD;
* Escalabilidade gradual;
* Simplicidade de manutenção;
* Deploy contínuo.

O projeto deverá ser capaz de crescer de uma única VPS para uma arquitetura distribuída sem necessidade de reescrita.

⸻

2. Stack Oficial

Frontend

* Next.js
* TypeScript
* TailwindCSS
* React Hook Form
* Zod
* TanStack Query

⸻

Backend

* Node.js
* Fastify
* TypeScript

Padrões:

* DDD
* SOLID
* Repository Pattern
* Use Cases
* Dependency Injection
* Event Driven (leve)

⸻

Banco

* PostgreSQL
* Prisma ORM

Características:

* UUID
* Soft Delete
* Audit Fields
* Migrations versionadas

⸻

Cache e Filas

Redis

Responsável por:

* BullMQ
* Cache
* Rate Limiting
* Sessões futuras
* Distributed Locks futuros

⸻

BullMQ

Toda tarefa pesada deverá ser executada através de filas.

Filas iniciais:

* ads-processing
* ads-publish
* dashboard-update
* notifications
* emails
* webhooks
* analytics

⸻

3. Filosofia Arquitetural

Regra principal

A API nunca deve executar tarefas demoradas.

Fluxo ideal:

Cliente
   │
   ▼
API
   │
   ├── Validação
   ├── PostgreSQL
   ├── BullMQ.add()
   │
   └── HTTP 200
            │
            ▼
         Worker
            │
            ├── IA
            ├── Marketplace
            ├── Notificações
            └── Dashboard

⸻

Operações síncronas

* Login
* Cadastro
* Atualizar Perfil
* Buscar Dados
* Consultar Dashboard (cache)

⸻

Operações assíncronas

* Publicação de anúncios
* Processamento IA
* Geração de PDF
* Envio WhatsApp
* Envio Email
* Webhooks
* Atualização Dashboard
* Analytics
* Importação CSV

⸻

4. Infraestrutura

VPS Inicial

KVM 4

Recurso	Valor
CPU	4 vCPU
RAM	16 GB
Disco	200 GB NVMe
SO	Ubuntu 24.04

⸻

Containers

coolify
frontend
backend
worker
postgres
redis
uptime-kuma

⸻

Reverse Proxy

Coolify + Traefik

Responsável por:

* SSL
* HTTPS
* Deploy
* Domínios

⸻

5. Estrutura DDD

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
├── database/
├── cache/
├── queue/
├── events/
├── config/
├── http/
└── utils/

Cada módulo:

domain/
application/
infrastructure/
presentation/

⸻

6. Banco de Dados

Todos os modelos:

id String @id @default(uuid())
createdAt DateTime @default(now())
updatedAt DateTime @updatedAt
deletedAt DateTime?

Nunca realizar alterações manuais.

Fluxo:

schema.prisma
      │
      ▼
prisma migrate dev
      │
      ▼
Commit Migration
      │
      ▼
CI/CD
      │
      ▼
Produção

⸻

7. Redis

Responsabilidades:

BullMQ

Fila principal da aplicação.

⸻

Cache

Dashboard:

TTL: 30 segundos

Analytics:

TTL: 60 segundos

Relatórios:

TTL: 300 segundos

⸻

Rate Limit

Login.

API pública.

Webhooks.

⸻

8. Dashboard

Nunca realizar agregações pesadas em tempo real.

Fluxo:

Evento
   │
BullMQ
   │
Atualiza Métricas
   │
Redis
   │
Dashboard lê cache

Objetivo:

Tempo médio:

5 ~ 30 ms.

⸻

9. Git Flow

Branches

main
develop
feature/*
hotfix/*

⸻

Desenvolvimento

feature/create-ad
        │
        ▼
    develop
        │
(beta.seusaas.com)
        │
        ▼
      main
(app.seusaas.com)

⸻

Hotfix

hotfix/login
       │
       ▼
     main
       │
       ▼
   develop

Regras:

* Feature nasce em feature/*
* Merge em develop
* Teste ambiente Beta
* Merge em main
* Hotfix nasce em main

⸻

10. CI/CD

GitHub Actions.

Pipeline:

Install
Lint
Typecheck
Tests
Prisma Generate
Docker Build
Deploy

Deploy automático:

develop -> Beta

main -> Produção

⸻

11. Observabilidade

Uptime Kuma

Monitorar:

* Frontend
* API
* PostgreSQL
* Redis

Alerta:

Telegram.

⸻

Logs

Pino Logger.

Formato JSON.

Campos:

* requestId
* userId
* route
* latency
* statusCode

⸻

Error Tracking

Sentry.

⸻

12. Backup

Diariamente:

pg_dump

Compactar.

Enviar para Cloudflare R2.

Política:

* 7 diários
* 4 semanais
* 3 mensais

⸻

13. Capacity Planning

Consumo médio esperado

Serviço	RAM
Ubuntu	800 MB
Coolify	400 MB
Next	300 MB
API	400 MB
Worker	300 MB
PostgreSQL	1.5 GB
Redis	500 MB
Uptime Kuma	150 MB

Total aproximado:

4.5 GB

Memória livre:

11 GB

⸻

14. Capacidade Estimada

MVP

* 100 clientes
* 1.000 usuários
* 20 simultâneos

CPU:

10%

RAM:

5 GB

⸻

Crescimento

* 300 clientes
* 5.000 usuários
* 50 simultâneos

CPU:

30%

RAM:

7 GB

⸻

Expansão

* 800 clientes
* 15.000 usuários
* 150 simultâneos

CPU:

50%

RAM:

9 GB

⸻

Limite confortável

* 2.000 clientes pagantes
* 30.000 usuários cadastrados
* 250 usuários simultâneos

CPU:

80%

RAM:

12 GB

⸻

15. Throughput BullMQ

Jobs leves:

* Emails
* Dashboard
* Cache

Capacidade:

100.000 ~ 300.000 jobs/dia

⸻

Jobs médios:

* Publicação anúncios
* Sincronização

30.000 ~ 80.000 jobs/dia

⸻

Jobs IA:

* Descrições
* Processamento imagens

5.000 ~ 20.000 jobs/dia

⸻

16. Estratégia de Escalabilidade

Estágio 1

Frontend
API
Worker
PostgreSQL
Redis

Até:

* 300 simultâneos
* 2.000 clientes

⸻

Estágio 2

Adicionar Workers:

Worker-1
Worker-2
Worker-3

Sem alterar API.

Capacidade:

500 simultâneos.

⸻

Estágio 3

Separar Banco.

VPS APP:

* Frontend
* API
* Workers

VPS DATA:

* PostgreSQL
* Redis

Capacidade:

800 simultâneos.

5.000 clientes.

⸻

Estágio 4

Escalabilidade Horizontal.

          Load Balancer
        API-1
        API-2
        API-3
Worker-1
Worker-2
Worker-3
Worker-4
PostgreSQL
Redis

Capacidade estimada:

* 1.000+ usuários simultâneos
* 10.000+ clientes pagantes

⸻

17. Princípios Definitivos

1. API apenas orquestra.
2. PostgreSQL é a fonte de verdade.
3. Redis acelera leituras.
4. BullMQ executa trabalhos.
5. Dashboard nunca calcula em tempo real.
6. Toda integração externa é assíncrona.
7. Crescimento ocorre adicionando Workers.
8. Simplicidade é prioridade sobre complexidade.
9. DDD organiza o domínio.
10. A arquitetura deve permitir crescimento sem reescrita.

⸻

Filosofia Final

API responde rápido.

Workers trabalham pesado.

Redis entrega velocidade.

PostgreSQL garante consistência.

BullMQ absorve a carga.

A simplicidade é a principal estratégia de escalabilidade.