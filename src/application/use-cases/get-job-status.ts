import { TakedownQueuePort } from '../../domain/ports/takedown-queue.port.js'
import { NotFoundError } from '../../domain/errors/app-error.js'
import { takedownResultSchema } from '../dtos/violation.dto.js'

export interface JobStatusResponse {
  jobId: string
  status: string
  attempts: number
  result: Record<string, unknown>
  error: string | null
}

export class GetJobStatusUseCase {
  constructor(private readonly queue: TakedownQueuePort) {}

  private getJobResult(returnValue: unknown): Record<string, unknown> {
    const result = takedownResultSchema.safeParse(returnValue)
    if (result.success) {
      return result.data
    }
    return {}
  }

  async execute(jobId: string): Promise<JobStatusResponse> {
    const job = await this.queue.getJob(jobId)

    if (job === null) {
      throw new NotFoundError(`No job found with id "${jobId}"`)
    }

    return {
      jobId: job.id,
      status: job.status,
      attempts: job.attemptsMade,
      result: this.getJobResult(job.returnValue),
      error: job.failedReason,
    }
  }
}
