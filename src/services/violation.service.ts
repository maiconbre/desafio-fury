import { violationSchema } from '../schemas/violation.js'
import { takedownQueue } from '../queue/queue.js'
import { ValidationError, ConflictError } from '../lib/error.js'

export interface ViolationResult {
  jobId: string
}

export async function processViolation(body: unknown): Promise<ViolationResult> {
  const parsed = violationSchema.safeParse(body)

  if (!parsed.success) {
    throw new ValidationError('Invalid payload', parsed.error.issues)
  }

  const { adId, tenantId } = parsed.data
  const jobId = `${adId}_${tenantId}`

  const existingJob = await takedownQueue.getJob(jobId)

  if (existingJob) {
    const state = await existingJob.getState()

    if (['waiting', 'active', 'delayed'].includes(state)) {
      throw new ConflictError(
        `A job for adId "${adId}" and tenantId "${tenantId}" is already pending or in progress`,
      )
    }

    await existingJob.remove()
  }

  const job = await takedownQueue.add('takedown', parsed.data, {
    jobId,
  })

  return { jobId: job.id ?? jobId }
}
