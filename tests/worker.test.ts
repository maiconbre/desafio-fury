import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ViolationPayload } from '../src/domain/models/violation.js'

vi.mock('../src/infrastructure/queue/connection.js', () => ({
  connection: {},
}))

vi.mock('bullmq', () => {
  const EventEmitter = require('node:events')
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

  it('returns success when fetch returns 2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 1 }), { status: 200 }),
    )

    const { processJob } = await import('../src/infrastructure/queue/worker.js')
    const result = await processJob({ data: validData })

    expect(result).toEqual({ status: 200, ok: true })
  })

  it.each([400, 401, 403, 404, 429, 500, 503])('throws when fetch returns %i (4xx/5xx)', async (status) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(null, { status }),
    )

    const { processJob } = await import('../src/infrastructure/queue/worker.js')
    await expect(processJob({ data: validData })).rejects.toThrow(
      `Meta API responded with ${status}`,
    )
  })

  it('throws on network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network timeout'))

    const { processJob } = await import('../src/infrastructure/queue/worker.js')
    await expect(processJob({ data: validData })).rejects.toThrow('Network timeout')
  })
})
