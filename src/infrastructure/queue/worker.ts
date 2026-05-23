import { Worker } from 'bullmq'
import { connection } from './connection.js'
import { logger } from '../logging/logger.js'
import type { ViolationPayload, TakedownResult } from '../../domain/models/violation.js'
import { ExternalApiError } from '../../domain/errors/app-error.js'

const META_API_MOCK = 'https://jsonplaceholder.typicode.com/posts/1'

export async function processJob(job: { data: ViolationPayload }): Promise<TakedownResult> {
  // job.data (adId, tenantId, violationType, severity) is intentionally unused here.
  // JSONPlaceholder is a static mock that simulates the Meta API HTTP contract (success/failure/retry).
  // A real Meta API integration would use job.data.adId and job.data.tenantId
  // to build the takedown request URL and payload.
  const response = await fetch(META_API_MOCK, { signal: AbortSignal.timeout(8000) })

  if (!response.ok) {
    throw new ExternalApiError(`Meta API responded with ${response.status}`, {
      status: response.status,
    })
  }

  return { status: response.status }
}

export const worker = new Worker<ViolationPayload>('takedown', processJob, {
  connection,
  // concurrency: 1 → conservador para o mock JSONPlaceholder.
  // Em produção com a Meta API real, avaliar aumento baseado nos rate limits da API.
  concurrency: 1,
  lockDuration: 30000,
  stalledInterval: 15000,
})

worker.on('failed', (job, error) => {
  logger.error({ jobId: job?.id, attempts: job?.attemptsMade }, `Job failed: ${error.message}`)
})

worker.on('completed', (job) => {
  logger.info({ jobId: job.id, returnvalue: job.returnvalue }, 'Job completed')
})
