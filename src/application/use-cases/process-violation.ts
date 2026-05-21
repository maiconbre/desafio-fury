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

    const existingJob = await this.queue.getJob(jobId)

    if (existingJob) {
      if (['waiting', 'active', 'delayed'].includes(existingJob.status)) {
        throw new ConflictError(
          `A job for adId "${adId}" and tenantId "${tenantId}" is already pending or in progress`,
        )
      }

      await existingJob.remove()
    }

    const job = await this.queue.addJob(jobId, parsed.data)

    return { jobId: job.id }
  }
}
