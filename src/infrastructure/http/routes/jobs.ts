import type { FastifyInstance } from 'fastify'
import { GetJobStatusUseCase } from '../../../application/use-cases/get-job-status.js'

export interface JobRoutesOptions {
  getJobStatusUseCase: GetJobStatusUseCase
}

export async function jobRoutes(
  app: FastifyInstance,
  options: JobRoutesOptions,
): Promise<void> {
  app.get<{ Params: { id: string } }>('/jobs/:id', async (request, reply) => {
    const result = await options.getJobStatusUseCase.execute(request.params.id)
    return reply.status(200).send(result)
  })
}
