import { Queue } from 'bullmq'
import { TakedownQueuePort, TakedownJob } from '../../domain/ports/takedown-queue.port.js'

export class BullMQTakedownQueue implements TakedownQueuePort {
  constructor(private readonly queue: Queue) {}

  async getJob(jobId: string): Promise<TakedownJob | null> {
    const job = await this.queue.getJob(jobId)
    if (!job) return null

    const state = await job.getState()
    return {
      id: job.id ?? jobId,
      status: state,
      attemptsMade: job.attemptsMade,
      returnValue: job.returnvalue,
      failedReason: job.failedReason ?? null,
      remove: async () => {
        await job.remove()
      },
    }
  }

  async addJob(jobId: string, data: unknown): Promise<TakedownJob> {
    const job = await this.queue.add('takedown', data, { jobId })
    const state = await job.getState()
    return {
      id: job.id ?? jobId,
      status: state,
      attemptsMade: job.attemptsMade,
      returnValue: job.returnvalue,
      failedReason: job.failedReason ?? null,
      remove: async () => {
        await job.remove()
      },
    }
  }
}
