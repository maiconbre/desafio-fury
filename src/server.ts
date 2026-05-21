import Fastify from 'fastify'
import { env } from './config/env.js'
import { webhookRoutes } from './routes/webhook.js'
import { jobRoutes } from './routes/jobs.js'
import { worker } from './queue/worker.js'
import { takedownQueue } from './queue/queue.js'
import { connection } from './queue/connection.js'
import { errorHandler } from './lib/error-handler.js'

const app = Fastify({ logger: { level: env.LOG_LEVEL ?? 'info' } })

app.setErrorHandler((error, request, reply) => {
  app.log.error(error)
  return errorHandler(error, request, reply)
})

app.get('/health', async (_, reply) => {
  try {
    await connection.ping()
    return reply.send({ status: 'ok', redis: 'connected', timestamp: new Date().toISOString() })
  } catch {
    return reply.status(503).send({ status: 'degraded', redis: 'disconnected', timestamp: new Date().toISOString() })
  }
})

app.register(webhookRoutes)
app.register(jobRoutes)

async function shutdown(): Promise<void> {
  app.log.info('Shutting down gracefully...')
  await worker.close()
  await takedownQueue.close()
  try {
    await connection.quit()
  } catch (err: unknown) {
    app.log.warn({ err }, 'Redis connection already closed during shutdown')
  }
  await app.close()
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
