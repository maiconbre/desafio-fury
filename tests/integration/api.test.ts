import { describe, it, expect, beforeEach } from 'vitest'
import Fastify from 'fastify'
import { InMemoryTakedownQueue } from '../use-cases/in-memory-takedown-queue.js'
import { ProcessViolationUseCase } from '../../src/application/use-cases/process-violation.js'
import { GetJobStatusUseCase } from '../../src/application/use-cases/get-job-status.js'
import { webhookRoutes } from '../../src/infrastructure/http/routes/webhook.js'
import { jobRoutes } from '../../src/infrastructure/http/routes/jobs.js'
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

    app.get('/health', () => ({ status: 'ok', timestamp: new Date().toISOString() }))
    app.register(webhookRoutes, { processViolationUseCase })
    app.register(jobRoutes, { getJobStatusUseCase })
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
      violationType: 'PROHIBITED_TERM' as const,
      severity: 'HIGH' as const,
      detectedAt: '2026-05-21T10:00:00.000Z',
    }

    it('returns 201 with jobId for valid payload', async () => {
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
      await app.inject({
        method: 'POST',
        url: '/webhook/violation',
        body: validBody,
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
        job.returnValue = { status: 200, ok: true }
      }

      const response = await app.inject({
        method: 'GET',
        url: `/jobs/${jobId}`,
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({
        jobId,
        status: 'completed',
        attempts: 1,
        result: { status: 200, ok: true },
        error: null,
      })
    })

    it('returns 404 for non-existent job', async () => {
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
