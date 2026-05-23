import { TakedownQueuePort, TakedownJob } from '../../src/domain/ports/takedown-queue.port.js'

export class InMemoryTakedownQueue implements TakedownQueuePort {
  public jobs = new Map<string, TakedownJob>()
  public addCalls: Array<{ jobId: string; data: unknown }> = []
  public locks = new Set<string>()

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

  async acquireLock(lockKey: string, _ttlMs: number): Promise<boolean> {
    if (this.locks.has(lockKey)) {
      return false
    }
    this.locks.add(lockKey)
    return true
  }

  async releaseLock(lockKey: string): Promise<void> {
    this.locks.delete(lockKey)
  }
}
