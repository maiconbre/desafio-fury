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

  it('adds job and returns jobId for valid payload', async () => {
    const result = await useCase.execute(validPayload)

    expect(result).toEqual({ jobId: 'ad-123_tenant-456' })
    expect(queue.addCalls).toHaveLength(1)
    expect(queue.addCalls[0]).toEqual({
      jobId: 'ad-123_tenant-456',
      data: validPayload,
    })
  })

  it('throws ValidationError for invalid payload', async () => {
    await expect(useCase.execute({})).rejects.toThrow(ValidationError)
  })

  it('throws ValidationError with details for partial payload', async () => {
    await expect(useCase.execute({ adId: 'only' })).rejects.toMatchObject({
      name: 'ValidationError',
      details: expect.any(Array),
    })
  })

  it('throws ConflictError when duplicate job is in active/waiting/delayed status', async () => {
    // Adiciona o primeiro job (vai com status 'waiting' por padrão)
    await useCase.execute(validPayload)

    // Tenta re-adicionar e deve falhar
    await expect(useCase.execute(validPayload)).rejects.toThrow(ConflictError)
  })

  it('removes completed job and adds a new one', async () => {
    // Adiciona o job
    const job = await queue.addJob('ad-123_tenant-456', validPayload)
    // Força o status para completed
    job.status = 'completed'

    const result = await useCase.execute(validPayload)

    expect(result).toEqual({ jobId: 'ad-123_tenant-456' })
    // Deve ter chamado addJob (que incrementa a lista de chamadas de add)
    expect(queue.addCalls).toHaveLength(2)
  })

  it('removes failed job and adds a new one', async () => {
    const job = await queue.addJob('ad-123_tenant-456', validPayload)
    job.status = 'failed'

    const result = await useCase.execute(validPayload)

    expect(result).toEqual({ jobId: 'ad-123_tenant-456' })
    expect(queue.addCalls).toHaveLength(2)
  })
})
