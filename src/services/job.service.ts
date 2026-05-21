import { takedownQueue } from '../queue/queue.js'
import { NotFoundError } from '../lib/error.js'
import { takedownResultSchema } from '../schemas/violation.js'

export interface JobStatusResponse {
  jobId: string
  status: string
  attempts: number
  result: Record<string, unknown>
  error: string | null
}

function getJobResult(returnvalue: unknown): Record<string, unknown> {
  const result = takedownResultSchema.safeParse(returnvalue)
  if (result.success) {
    return result.data
  }
  return {}
}

export async function getJobStatus(jobId: string): Promise<JobStatusResponse> {
  const job = await takedownQueue.getJob(jobId)

  if (job === undefined) {
    throw new NotFoundError(`No job found with id "${jobId}"`)
  }

  const state = await job.getState()

  return {
    jobId: job.id ?? jobId,
    status: state,
    attempts: job.attemptsMade,
    result: getJobResult(job.returnvalue),
    error: job.failedReason ?? null,
  }
}
