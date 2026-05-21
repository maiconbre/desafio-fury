import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ValidationError, ConflictError } from '../../src/lib/error.js'

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

const validPayload = {
  adId: 'ad-123',
  tenantId: 'tenant-456',
  violationType: 'PROHIBITED_TERM' as const,
  severity: 'HIGH' as const,
  detectedAt: '2026-05-21T10:00:00.000Z',
}

describe('violation.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('processViolation', () => {
    it('adds job and returns jobId for valid payload', async () => {
      mockQueue.getJob.mockResolvedValue(undefined)
      mockQueue.add.mockResolvedValue({ id: 'ad-123_tenant-456' })

      const { processViolation } = await import('../../src/services/violation.service.js')
      const result = await processViolation(validPayload)

      expect(result).toEqual({ jobId: 'ad-123_tenant-456' })
      expect(mockQueue.getJob).toHaveBeenCalledWith('ad-123_tenant-456')
      expect(mockQueue.add).toHaveBeenCalledWith('takedown', validPayload, {
        jobId: 'ad-123_tenant-456',
      })
    })

    it('throws ValidationError for invalid payload', async () => {
      const { processViolation } = await import('../../src/services/violation.service.js')

      await expect(processViolation({})).rejects.toThrow(ValidationError)
    })

    it('throws ValidationError with Zod issues details', async () => {
      const { processViolation } = await import('../../src/services/violation.service.js')

      await expect(processViolation({ adId: 'only' })).rejects.toMatchObject({
        name: 'ValidationError',
        details: expect.any(Array),
      })
    })

    it('throws ConflictError when duplicate job exists in waiting/active/delayed states', async () => {
      mockQueue.getJob.mockResolvedValue({
        getState: vi.fn().mockResolvedValue('waiting'),
      })

      const { processViolation } = await import('../../src/services/violation.service.js')

      await expect(processViolation(validPayload)).rejects.toThrow(ConflictError)
    })

    it('removes completed job and adds a new one', async () => {
      const mockRemove = vi.fn().mockResolvedValue(undefined)
      mockQueue.getJob.mockResolvedValue({
        getState: vi.fn().mockResolvedValue('completed'),
        remove: mockRemove,
      })
      mockQueue.add.mockResolvedValue({ id: 'ad-123_tenant-456' })

      const { processViolation } = await import('../../src/services/violation.service.js')
      const result = await processViolation(validPayload)

      expect(result).toEqual({ jobId: 'ad-123_tenant-456' })
      expect(mockRemove).toHaveBeenCalled()
      expect(mockQueue.add).toHaveBeenCalled()
    })

    it('removes failed job and adds a new one', async () => {
      const mockRemove = vi.fn().mockResolvedValue(undefined)
      mockQueue.getJob.mockResolvedValue({
        getState: vi.fn().mockResolvedValue('failed'),
        remove: mockRemove,
      })
      mockQueue.add.mockResolvedValue({ id: 'ad-123_tenant-456' })

      const { processViolation } = await import('../../src/services/violation.service.js')
      const result = await processViolation(validPayload)

      expect(result).toEqual({ jobId: 'ad-123_tenant-456' })
      expect(mockRemove).toHaveBeenCalled()
      expect(mockQueue.add).toHaveBeenCalled()
    })
  })
})
