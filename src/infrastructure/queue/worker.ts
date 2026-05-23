import { Worker } from 'bullmq'
import { connection } from './connection.js'
import { logger } from '../logging/logger.js'
import type { ViolationPayload, TakedownResult } from '../../domain/models/violation.js'
import { MetaGatewayPort } from '../../domain/ports/meta-gateway.port.js'

export function createProcessJob(metaGateway: MetaGatewayPort) {
  return async (job: { data: ViolationPayload }): Promise<TakedownResult> => {
    // A chamada de rede foi delegada ao Gateway do domínio (DIP)
    return await metaGateway.executeTakedown(job.data.adId, job.data.tenantId)
  }
}

export function setupWorker(metaGateway: MetaGatewayPort): Worker<ViolationPayload> {
  const processJob = createProcessJob(metaGateway)

  const worker = new Worker<ViolationPayload>('takedown', processJob, {
    connection,
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

  return worker
}
