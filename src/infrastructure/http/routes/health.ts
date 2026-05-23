import type { FastifyInstance } from 'fastify'

export interface HealthRoutesOptions {
  ping: () => Promise<unknown>
}

export async function healthRoutes(
  app: FastifyInstance,
  options: HealthRoutesOptions,
): Promise<void> {
  app.get('/health', async (_, reply) => {
    try {
      await options.ping()
      return reply.send({ status: 'ok', redis: 'connected', timestamp: new Date().toISOString() })
    } catch {
      return reply.status(503).send({ status: 'degraded', redis: 'disconnected', timestamp: new Date().toISOString() })
    }
  })
}
