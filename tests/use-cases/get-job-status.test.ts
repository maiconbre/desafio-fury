import { describe, it, expect, beforeEach } from 'vitest'
import { GetJobStatusUseCase } from '../../src/application/use-cases/get-job-status.js'
import { InMemoryTakedownQueue } from './in-memory-takedown-queue.js'
import { NotFoundError } from '../../src/domain/errors/app-error.js'

describe('GetJobStatusUseCase', () => {
  let queue: InMemoryTakedownQueue
  let useCase: GetJobStatusUseCase

  beforeEach(() => {
    queue = new InMemoryTakedownQueue()
    useCase = new GetJobStatusUseCase(queue)
  })

  it('returns formatted job status for existing job', async () => {
    const job = await queue.addJob('ad-123_tenant-456', {})
    job.status = 'completed'
    job.attemptsMade = 1
    job.returnValue = { status: 200 }

    const result = await useCase.execute('ad-123_tenant-456')

    expect(result).toEqual({
      jobId: 'ad-123_tenant-456',
      status: 'completed',
      attempts: 1,
      result: { status: 200 },
      error: null,
    })
  })

  it('throws NotFoundError for non-existent job', async () => {
    await expect(useCase.execute('inexistente')).rejects.toThrow(NotFoundError)
  })

  it('returns empty result when job has no returnvalue', async () => {
    const job = await queue.addJob('ad-123_tenant-456', {})
    job.returnValue = undefined

    const result = await useCase.execute('ad-123_tenant-456')

    expect(result.result).toEqual({})
  })

  it('returns null error when job has no failedReason', async () => {
    const job = await queue.addJob('ad-123_tenant-456', {})
    job.failedReason = null

    const result = await useCase.execute('ad-123_tenant-456')

    expect(result.error).toBeNull()
  })

  it('returns error string when job has failedReason', async () => {
    const job = await queue.addJob('ad-123_tenant-456', {})
    job.failedReason = 'Meta API responded with 500'

    const result = await useCase.execute('ad-123_tenant-456')

    expect(result.error).toBe('Meta API responded with 500')
  })

  it('returns the status from job', async () => {
    const job = await queue.addJob('ad-123_tenant-456', {})
    job.status = 'failed'

    const result = await useCase.execute('ad-123_tenant-456')

    expect(result.status).toBe('failed')
  })

  it('returns the correct attempts count', async () => {
    const job = await queue.addJob('ad-123_tenant-456', {})
    job.attemptsMade = 3

    const result = await useCase.execute('ad-123_tenant-456')

    expect(result.attempts).toBe(3)
  })
})
