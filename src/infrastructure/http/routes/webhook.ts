import type { FastifyInstance } from 'fastify'
import { ProcessViolationUseCase } from '../../../application/use-cases/process-violation.js'

export interface WebhookRoutesOptions {
  processViolationUseCase: ProcessViolationUseCase
}

export async function webhookRoutes(
  app: FastifyInstance,
  options: WebhookRoutesOptions,
): Promise<void> {
  app.post('/webhook/violation', async (request, reply) => {
    const result = await options.processViolationUseCase.execute(request.body)
    return reply.status(201).send(result)
  })
}
