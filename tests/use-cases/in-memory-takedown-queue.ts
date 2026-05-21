import { TakedownQueuePort, TakedownJob } from '../../src/domain/ports/takedown-queue.port.js'

export class InMemoryTakedownQueue implements TakedownQueuePort {
  public jobs = new Map<string, TakedownJob>()
  public addCalls: Array<{ jobId: string; data: unknown }> = []

  async getJob(jobId: string): Promise<TakedownJob | null> {
    return this.jobs.get(jobId) ?? null
  }

  async addJob(jobId: string, data: unknown): Promise<TakedownJob> {
    this.addCalls.push({ jobId, data })
    const job: TakedownJob = {
      id: jobId,
      status: 'waiting',
      attemptsMade: 0,
      returnValue: null,
      failedReason: null,
      remove: async () => {
        this.jobs.delete(jobId)
      },
    }
    this.jobs.set(jobId, job)
    return job
  }
}
