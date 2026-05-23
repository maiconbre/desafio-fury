import { TakedownQueuePort } from '../../domain/ports/takedown-queue.port.js'
import { violationSchema } from '../dtos/violation.dto.js'
import { ValidationError, ConflictError } from '../../domain/errors/app-error.js'

export interface ViolationResult {
  jobId: string
}

export class ProcessViolationUseCase {
  constructor(private readonly queue: TakedownQueuePort) {}

  async execute(body: unknown): Promise<ViolationResult> {
    const parsed = violationSchema.safeParse(body)

    if (!parsed.success) {
      throw new ValidationError('Invalid payload', parsed.error.issues)
    }

    const { adId, tenantId } = parsed.data
    const jobId = `${adId}_${tenantId}`
    const lockKey = `lock:job:${jobId}`

    // Idempotência Transacional: Adquire lock de exclusão mútua curto (5 segundos)
    const acquired = await this.queue.acquireLock(lockKey, 5000)
    if (!acquired) {
      throw new ConflictError(
        `A job creation request for adId "${adId}" and tenantId "${tenantId}" is already being processed`,
      )
    }

    try {
      const existingJob = await this.queue.getJob(jobId)

      if (existingJob) {
        throw new ConflictError(
          `A job for adId "${adId}" and tenantId "${tenantId}" already exists`,
        )
      }

      const job = await this.queue.addJob(jobId, parsed.data)

      return { jobId: job.id }
    } finally {
      await this.queue.releaseLock(lockKey)
    }
  }
}
