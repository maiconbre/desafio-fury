import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ViolationPayload } from '../src/domain/models/violation.js'
import { ExternalApiError } from '../src/domain/errors/app-error.js'

vi.mock('../src/infrastructure/queue/connection.js', () => ({
  connection: {},
}))

vi.mock('bullmq', async () => {
  const { EventEmitter } = await import('node:events')
  class MockWorker extends EventEmitter {
    constructor() { super() }
    close() { return Promise.resolve() }
  }
  return {
    Worker: MockWorker,
    Queue: class MockQueue {
      getJob() { return Promise.resolve(null) }
      getJobs() { return Promise.resolve([]) }
      add() { return Promise.resolve({ id: 'mock-id' }) }
      close() { return Promise.resolve() }
    },
  }
})

const validData: ViolationPayload = {
  adId: 'ad-123',
  tenantId: 'tenant-456',
  violationType: 'PROHIBITED_TERM',
  severity: 'HIGH',
  detectedAt: '2026-05-21T10:00:00.000Z',
}

describe('processJob', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  // ─── Success ───────────────────────────────────────────────────────────────

  it('returns { status: 200 } when Meta API responds 200', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 1 }), { status: 200 }),
    )

    const { processJob } = await import('../src/infrastructure/queue/worker.js')
    const result = await processJob({ data: validData })

    expect(result).toEqual({ status: 200 })
  })

  // ─── HTTP Errors (!response.ok) — deve lançar ExternalApiError ────────────

  it('throws ExternalApiError when Meta API returns a client error (e.g. 400)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 400 }))

    const { processJob } = await import('../src/infrastructure/queue/worker.js')
    await expect(processJob({ data: validData })).rejects.toMatchObject({
      name: 'ExternalApiError',
      message: 'Meta API responded with 400',
    })
  })

  it('throws ExternalApiError when Meta API returns a server error (e.g. 500)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 500 }))

    const { processJob } = await import('../src/infrastructure/queue/worker.js')
    await expect(processJob({ data: validData })).rejects.toMatchObject({
      name: 'ExternalApiError',
      message: 'Meta API responded with 500',
    })
  })

  // ─── Network / timeout errors ──────────────────────────────────────────────

  it('propagates network error (ECONNREFUSED, etc.)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network timeout'))

    const { processJob } = await import('../src/infrastructure/queue/worker.js')
    await expect(processJob({ data: validData })).rejects.toThrow('Network timeout')
  })

  it('propagates AbortSignal timeout as DOMException', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError')
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(abortError)

    const { processJob } = await import('../src/infrastructure/queue/worker.js')
    await expect(processJob({ data: validData })).rejects.toThrow('The operation was aborted.')
  })
})

