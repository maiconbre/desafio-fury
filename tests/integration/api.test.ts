import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'

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
  getJobs: vi.fn(),
  getJob: vi.fn(),
  add: vi.fn(),
}

vi.mock('../../src/queue/queue.js', () => ({
  takedownQueue: mockQueue,
}))

vi.mock('../../src/queue/connection.js', () => ({ connection: {} }))
vi.mock('../../src/queue/worker.js', () => ({
  worker: { close: vi.fn() },
  processJob: vi.fn(),
}))
vi.mock('bullmq', () => ({ Worker: class {}, Queue: class {} }))

describe('API Integration', () => {
  let app: ReturnType<typeof Fastify>

  beforeEach(async () => {
    vi.clearAllMocks()

    app = Fastify()

    const { webhookRoutes } = await import('../../src/routes/webhook.js')
    const { jobRoutes } = await import('../../src/routes/jobs.js')
    const { errorHandler } = await import('../../src/lib/error-handler.js')

    app.setErrorHandler(errorHandler)

    app.get('/health', () => ({ status: 'ok', timestamp: new Date().toISOString() }))
    app.register(webhookRoutes)
    app.register(jobRoutes)
    await app.ready()
  })

  describe('GET /health', () => {
    it('returns 200 with status ok', async () => {
      const response = await app.inject({ method: 'GET', url: '/health' })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toMatchObject({ status: 'ok' })
    })
  })

  describe('POST /webhook/violation', () => {
    const validBody = {
      adId: 'ad-123',
      tenantId: 'tenant-456',
      violationType: 'PROHIBITED_TERM',
      severity: 'HIGH',
      detectedAt: '2026-05-21T10:00:00.000Z',
    }

    it('returns 201 with jobId for valid payload', async () => {
      mockQueue.getJob.mockResolvedValue(undefined)
      mockQueue.add.mockResolvedValue({ id: 'ad-123_tenant-456' })

      const response = await app.inject({
        method: 'POST',
        url: '/webhook/violation',
        body: validBody,
      })

      expect(response.statusCode).toBe(201)
      expect(response.json()).toEqual({ jobId: 'ad-123_tenant-456' })
    })

    it('returns 400 for invalid payload', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/webhook/violation',
        body: { adId: 'only' },
      })

      expect(response.statusCode).toBe(400)
      const body = response.json()
      expect(body.error).toBe('Bad request')
      expect(body.message).toBe('Invalid payload')
      expect(body.details).toBeDefined()
    })

    it('returns 409 for duplicate job', async () => {
      mockQueue.getJob.mockResolvedValue({
        getState: vi.fn().mockResolvedValue('waiting'),
      })

      const response = await app.inject({
        method: 'POST',
        url: '/webhook/violation',
        body: validBody,
      })

      expect(response.statusCode).toBe(409)
      const body = response.json()
      expect(body.error).toBe('Conflict')
      expect(body.message).toContain('ad-123')
      expect(body.message).toContain('tenant-456')
    })
  })

  describe('GET /jobs/:id', () => {
    it('returns 200 with job status for existing job', async () => {
      mockQueue.getJob.mockResolvedValue(mockJob())

      const response = await app.inject({
        method: 'GET',
        url: '/jobs/ad-123_tenant-456',
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({
        jobId: 'ad-123_tenant-456',
        status: 'completed',
        attempts: 1,
        result: { status: 200, ok: true },
        error: null,
      })
    })

    it('returns 404 for non-existent job', async () => {
      mockQueue.getJob.mockResolvedValue(undefined)

      const response = await app.inject({
        method: 'GET',
        url: '/jobs/inexistente',
      })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toMatchObject({
        error: 'Not found',
        message: expect.stringContaining('inexistente'),
      })
    })
  })
})
