import type { FastifyInstance } from 'fastify'
import { processViolation } from '../services/violation.service.js'

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  app.post('/webhook/violation', async (request, reply) => {
    const result = await processViolation(request.body)
    return reply.status(201).send(result)
  })
}
