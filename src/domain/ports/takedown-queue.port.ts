export interface TakedownJob {
  id: string
  status: string
  attemptsMade: number
  returnValue: unknown
  failedReason: string | null
  remove(): Promise<void>
}

export interface TakedownQueuePort {
  getJob(jobId: string): Promise<TakedownJob | null>
  addJob(jobId: string, data: unknown): Promise<TakedownJob>
  acquireLock(lockKey: string, ttlMs: number): Promise<boolean>
  releaseLock(lockKey: string): Promise<void>
}
