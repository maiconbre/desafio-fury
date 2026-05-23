import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Fastify from 'fastify'
import { InMemoryTakedownQueue } from '../use-cases/in-memory-takedown-queue.js'
import { ProcessViolationUseCase } from '../../src/application/use-cases/process-violation.js'
import { GetJobStatusUseCase } from '../../src/application/use-cases/get-job-status.js'
import { webhookRoutes } from '../../src/infrastructure/http/routes/webhook.js'
import { jobRoutes } from '../../src/infrastructure/http/routes/jobs.js'
import { healthRoutes } from '../../src/infrastructure/http/routes/health.js'
import { errorHandler } from '../../src/infrastructure/http/error-handler.js'

describe('API Integration', () => {
  let app: ReturnType<typeof Fastify>
  let queue: InMemoryTakedownQueue

  beforeEach(async () => {
    queue = new InMemoryTakedownQueue()
    const processViolationUseCase = new ProcessViolationUseCase(queue)
    const getJobStatusUseCase = new GetJobStatusUseCase(queue)

    app = Fastify()
    app.setErrorHandler(errorHandler)

    app.register(healthRoutes, { ping: () => Promise.resolve() })
    app.register(webhookRoutes, { processViolationUseCase })
    app.register(jobRoutes, { getJobStatusUseCase })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  // ─── GET /health ───────────────────────────────────────────────────────────

  describe('GET /health', () => {
    it('returns 200 with status ok, redis connected, and timestamp', async () => {
      const response = await app.inject({ method: 'GET', url: '/health' })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.status).toBe('ok')
      expect(body.redis).toBe('connected')
      expect(body.timestamp).toBeDefined()
      expect(new Date(body.timestamp).getTime()).not.toBeNaN()
    })

    it('returns 503 when Redis ping fails (degraded mode)', async () => {
      const pingMock = { ping: vi.fn().mockRejectedValueOnce(new Error('ECONNREFUSED')) }

      const degradedApp = Fastify()
      degradedApp.register(healthRoutes, { ping: () => pingMock.ping() })
      await degradedApp.ready()

      const response = await degradedApp.inject({ method: 'GET', url: '/health' })

      expect(response.statusCode).toBe(503)
      expect(response.json()).toMatchObject({ status: 'degraded', redis: 'disconnected' })
      expect(response.json()).toHaveProperty('timestamp')

      await degradedApp.close()
    })
  })

  // ─── POST /webhook/violation ───────────────────────────────────────────────

  describe('POST /webhook/violation', () => {
    const validBody = {
      adId: 'ad-123',
      tenantId: 'tenant-456',
      violationType: 'PROHIBITED_TERM' as const,
      severity: 'HIGH' as const,
      detectedAt: '2026-05-21T10:00:00.000Z',
    }

    it('returns 201 with deterministic jobId (adId_tenantId)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/webhook/violation',
        body: validBody,
      })

      expect(response.statusCode).toBe(201)
      expect(response.json()).toEqual({ jobId: 'ad-123_tenant-456' })
    })

    it('returns 400 for invalid payload — shape: error + message + details', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/webhook/violation',
        body: { adId: 'only' },
      })

      expect(response.statusCode).toBe(400)
      const body = response.json()
      expect(body.error).toBe('Bad request')
      expect(body.message).toBe('Invalid payload')
      expect(Array.isArray(body.details)).toBe(true)
      expect(body.details.length).toBeGreaterThan(0)
    })

    it('returns 400 for empty body', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/webhook/violation',
        body: {},
      })
      expect(response.statusCode).toBe(400)
    })

    it('returns 409 for duplicate adId+tenantId — shape: error + message', async () => {
      await app.inject({ method: 'POST', url: '/webhook/violation', body: validBody })

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

    it('allows duplicate adId with different tenantId', async () => {
      await app.inject({ method: 'POST', url: '/webhook/violation', body: validBody })

      const response = await app.inject({
        method: 'POST',
        url: '/webhook/violation',
        body: { ...validBody, tenantId: 'tenant-other' },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().jobId).toBe('ad-123_tenant-other')
    })
  })

  // ─── GET /jobs/:id ─────────────────────────────────────────────────────────

  describe('GET /jobs/:id', () => {
    it('returns 200 with full job shape for a completed job', async () => {
      await app.inject({
        method: 'POST',
        url: '/webhook/violation',
        body: {
          adId: 'ad-999',
          tenantId: 'tenant-999',
          violationType: 'PROHIBITED_TERM' as const,
          severity: 'LOW' as const,
          detectedAt: '2026-05-21T10:00:00.000Z',
        },
      })

      const jobId = 'ad-999_tenant-999'
      const job = await queue.getJob(jobId)
      if (job) {
        job.status = 'completed'
        job.attemptsMade = 1
        job.returnValue = { status: 200 }
      }

      const response = await app.inject({ method: 'GET', url: `/jobs/${jobId}` })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({
        jobId,
        status: 'completed',
        attempts: 1,
        result: { status: 200 },
        error: null,
      })
    })

    it('returns 200 with error field populated for a failed job', async () => {
      await app.inject({
        method: 'POST',
        url: '/webhook/violation',
        body: {
          adId: 'ad-fail',
          tenantId: 'tenant-fail',
          violationType: 'BRAND_VIOLATION' as const,
          severity: 'CRITICAL' as const,
          detectedAt: '2026-05-21T10:00:00.000Z',
        },
      })

      const jobId = 'ad-fail_tenant-fail'
      const job = await queue.getJob(jobId)
      if (job) {
        job.status = 'failed'
        job.attemptsMade = 3
        job.failedReason = 'Meta API responded with 500'
      }

      const response = await app.inject({ method: 'GET', url: `/jobs/${jobId}` })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.status).toBe('failed')
      expect(body.attempts).toBe(3)
      expect(body.error).toBe('Meta API responded with 500')
      expect(body.result).toEqual({})
    })

    it('returns 200 with empty result for waiting job', async () => {
      await app.inject({
        method: 'POST',
        url: '/webhook/violation',
        body: {
          adId: 'ad-wait',
          tenantId: 'tenant-wait',
          violationType: 'COMPLIANCE_FAIL' as const,
          severity: 'MEDIUM' as const,
          detectedAt: '2026-05-21T10:00:00.000Z',
        },
      })

      const response = await app.inject({ method: 'GET', url: '/jobs/ad-wait_tenant-wait' })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.status).toBe('waiting')
      expect(body.result).toEqual({})
      expect(body.error).toBeNull()
    })

    it('returns 404 — shape: error + message containing jobId', async () => {
      const response = await app.inject({ method: 'GET', url: '/jobs/inexistente' })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toMatchObject({
        error: 'Not found',
        message: expect.stringContaining('inexistente'),
      })
    })
  })
})

