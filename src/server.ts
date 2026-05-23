import Fastify from 'fastify'
import { env } from './config/env.js'
import { webhookRoutes } from './infrastructure/http/routes/webhook.js'
import { jobRoutes } from './infrastructure/http/routes/jobs.js'
import { healthRoutes } from './infrastructure/http/routes/health.js'
import { setupWorker } from './infrastructure/queue/worker.js'
import { HttpMetaGateway } from './infrastructure/queue/http-meta-gateway.js'
import { takedownQueue } from './infrastructure/queue/queue.js'
import { connection } from './infrastructure/queue/connection.js'
import { errorHandler } from './infrastructure/http/error-handler.js'

// Importações do Clean Architecture
import { BullMQTakedownQueue } from './infrastructure/queue/bullmq-takedown-queue.js'
import { ProcessViolationUseCase } from './application/use-cases/process-violation.js'
import { GetJobStatusUseCase } from './application/use-cases/get-job-status.js'

const app = Fastify({ logger: { level: env.LOG_LEVEL ?? 'info' } })

app.setErrorHandler((error, request, reply) => {
  app.log.error(error)
  return errorHandler(error, request, reply)
})

// Composition Root
const metaGateway = new HttpMetaGateway()
const worker = setupWorker(metaGateway)

const queueAdapter = new BullMQTakedownQueue(takedownQueue)
const processViolationUseCase = new ProcessViolationUseCase(queueAdapter)
const getJobStatusUseCase = new GetJobStatusUseCase(queueAdapter)

// Registrar as rotas injetando as dependências
app.register(healthRoutes, { ping: () => connection.ping() })
app.register(webhookRoutes, { processViolationUseCase })
app.register(jobRoutes, { getJobStatusUseCase })

async function shutdown(): Promise<void> {
  app.log.info('Shutting down gracefully...')

  // Timeout de segurança de 10s para evitar travamento zumbi no orquestrador (ECS/K8s)
  const forceShutdownTimeout = setTimeout(() => {
    app.log.error('Graceful shutdown timed out, forcing exit!')
    process.exit(1)
  }, 10000)

  // Desreferencia o timeout para não impedir que o processo finalize caso as conexões fechem antes
  forceShutdownTimeout.unref()

  await worker.close()
  await takedownQueue.close()
  try {
    await connection.quit()
  } catch (err: unknown) {
    app.log.warn({ err }, 'Redis connection already closed during shutdown')
  }
  await app.close()

  clearTimeout(forceShutdownTimeout)
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

async function start(): Promise<void> {
  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' })
    app.log.info(`Server running on port ${env.PORT}`)
    app.log.info('Worker is active and waiting for jobs')
  } catch (error: unknown) {
    app.log.error(error instanceof Error ? error.message : 'Unknown error')
    await worker.close()
    process.exit(1)
  }
}

start()
