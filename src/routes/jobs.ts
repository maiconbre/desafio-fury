import type { FastifyInstance } from 'fastify'
import { getJobStatus } from '../services/job.service.js'

export async function jobRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>('/jobs/:id', async (request, reply) => {
    const result = await getJobStatus(request.params.id)
    return reply.status(200).send(result)
  })
}
