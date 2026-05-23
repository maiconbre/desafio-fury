import { describe, it, expect, beforeEach } from 'vitest'
import { ProcessViolationUseCase } from '../../src/application/use-cases/process-violation.js'
import { InMemoryTakedownQueue } from './in-memory-takedown-queue.js'
import { ValidationError, ConflictError } from '../../src/domain/errors/app-error.js'

const validPayload = {
  adId: 'ad-123',
  tenantId: 'tenant-456',
  violationType: 'PROHIBITED_TERM' as const,
  severity: 'HIGH' as const,
  detectedAt: '2026-05-21T10:00:00.000Z',
}

describe('ProcessViolationUseCase', () => {
  let queue: InMemoryTakedownQueue
  let useCase: ProcessViolationUseCase

  beforeEach(() => {
    queue = new InMemoryTakedownQueue()
    useCase = new ProcessViolationUseCase(queue)
  })

  // ─── Happy path ────────────────────────────────────────────────────────────

  it('adds job and returns jobId for valid payload', async () => {
    const result = await useCase.execute(validPayload)

    expect(result).toEqual({ jobId: 'ad-123_tenant-456' })
    expect(queue.addCalls).toHaveLength(1)
    expect(queue.addCalls[0]).toEqual({
      jobId: 'ad-123_tenant-456',
      data: validPayload,
    })
  })

  it('jobId is composed as adId_tenantId', async () => {
    const result = await useCase.execute({ ...validPayload, adId: 'foo', tenantId: 'bar' })
    expect(result.jobId).toBe('foo_bar')
  })

  // ─── Validation ────────────────────────────────────────────────────────────

  it('throws ValidationError with issues array for invalid payload', async () => {
    // A validação completa do schema já é coberta pelo violation.test.ts
    await expect(useCase.execute({ adId: 'only' })).rejects.toMatchObject({
      name: 'ValidationError',
      details: expect.any(Array),
    })
  })

  // ─── Idempotência ──────────────────────────────────────────────────────────

  it('throws ConflictError when lock is already acquired by another request (concurrency)', async () => {
    const jobId = `${validPayload.adId}_${validPayload.tenantId}`
    await queue.acquireLock(`lock:job:${jobId}`, 5000)

    await expect(useCase.execute(validPayload)).rejects.toThrow(ConflictError)
    expect(queue.addCalls).toHaveLength(0)
  })

  it('throws ConflictError when job with same adId+tenantId already exists (waiting)', async () => {
    await useCase.execute(validPayload)

    await expect(useCase.execute(validPayload)).rejects.toThrow(ConflictError)
  })

  it.each(['waiting', 'active', 'delayed', 'completed', 'failed'] as const)(
    'throws ConflictError regardless of existing job status: %s',
    async (status) => {
      const job = await queue.addJob('ad-123_tenant-456', validPayload)
      job.status = status

      await expect(useCase.execute(validPayload)).rejects.toThrow(ConflictError)
    },
  )

  it('ConflictError message contains adId and tenantId', async () => {
    await useCase.execute(validPayload)

    await expect(useCase.execute(validPayload)).rejects.toMatchObject({
      name: 'ConflictError',
      message: expect.stringContaining('ad-123'),
    })
  })

  it('allows new job for different tenantId on same adId', async () => {
    await useCase.execute(validPayload)
    const result = await useCase.execute({ ...validPayload, tenantId: 'other-tenant' })

    expect(result.jobId).toBe('ad-123_other-tenant')
    expect(queue.addCalls).toHaveLength(2)
  })

  it('allows new job for different adId on same tenantId', async () => {
    await useCase.execute(validPayload)
    const result = await useCase.execute({ ...validPayload, adId: 'other-ad' })

    expect(result.jobId).toBe('other-ad_tenant-456')
    expect(queue.addCalls).toHaveLength(2)
  })
})
