import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NotFoundError } from '../../src/lib/error.js'

const mockJob = (overrides: Record<string, unknown> = {}) => ({
  id: 'ad-123_tenant-456',
  data: { adId: 'ad-123', tenantId: 'tenant-456' },
  attemptsMade: 1,
  returnvalue: { status: 200, ok: true },
  failedReason: undefined,
  getState: vi.fn().mockResolvedValue('completed'),
  ...overrides,
})

const mockQueue = {
  getJob: vi.fn(),
  getJobs: vi.fn(),
  add: vi.fn(),
}

vi.mock('../../src/queue/queue.js', () => ({
  takedownQueue: mockQueue,
}))

vi.mock('../../src/queue/connection.js', () => ({ connection: {} }))
vi.mock('bullmq', () => ({ Worker: class {}, Queue: class {} }))

describe('job.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getJobStatus', () => {
    it('returns formatted job status for existing job', async () => {
      mockQueue.getJob.mockResolvedValue(mockJob())

      const { getJobStatus } = await import('../../src/services/job.service.js')
      const result = await getJobStatus('ad-123_tenant-456')

      expect(result).toEqual({
        jobId: 'ad-123_tenant-456',
        status: 'completed',
        attempts: 1,
        result: { status: 200, ok: true },
        error: null,
      })
    })

    it('throws NotFoundError for non-existent job', async () => {
      mockQueue.getJob.mockResolvedValue(undefined)

      const { getJobStatus } = await import('../../src/services/job.service.js')

      await expect(getJobStatus('inexistente')).rejects.toThrow(NotFoundError)
    })

    it('returns empty result when job has no returnvalue', async () => {
      mockQueue.getJob.mockResolvedValue(mockJob({ returnvalue: undefined }))

      const { getJobStatus } = await import('../../src/services/job.service.js')
      const result = await getJobStatus('ad-123_tenant-456')

      expect(result.result).toEqual({})
    })

    it('returns null error when job has no failedReason', async () => {
      mockQueue.getJob.mockResolvedValue(mockJob({ failedReason: undefined }))

      const { getJobStatus } = await import('../../src/services/job.service.js')
      const result = await getJobStatus('ad-123_tenant-456')

      expect(result.error).toBeNull()
    })

    it('returns error string when job has failedReason', async () => {
      mockQueue.getJob.mockResolvedValue(
        mockJob({ failedReason: 'Meta API responded with 500' }),
      )

      const { getJobStatus } = await import('../../src/services/job.service.js')
      const result = await getJobStatus('ad-123_tenant-456')

      expect(result.error).toBe('Meta API responded with 500')
    })

    it('returns the state from getState', async () => {
      const job = mockJob({ getState: vi.fn().mockResolvedValue('failed') })
      mockQueue.getJob.mockResolvedValue(job)

      const { getJobStatus } = await import('../../src/services/job.service.js')
      const result = await getJobStatus('ad-123_tenant-456')

      expect(result.status).toBe('failed')
    })

    it('returns the correct attempts count', async () => {
      const job = mockJob({ attemptsMade: 3 })
      mockQueue.getJob.mockResolvedValue(job)

      const { getJobStatus } = await import('../../src/services/job.service.js')
      const result = await getJobStatus('ad-123_tenant-456')

      expect(result.attempts).toBe(3)
    })
  })
})
