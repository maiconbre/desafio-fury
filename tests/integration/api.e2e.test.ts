import { describe, it, expect, beforeAll } from 'vitest'

const BASE_URL = process.env.BASE_URL && process.env.BASE_URL !== '/'
  ? process.env.BASE_URL
  : 'http://localhost:3000'

describe('API End-to-End (E2E) Tests', () => {
  // 0. Verificar se o servidor está rodando antes dos testes
  beforeAll(async () => {
    try {
      const response = await fetch(`${BASE_URL}/health`)
      if (!response.ok) {
        throw new Error(`Degraded status: ${response.status}`)
      }
    } catch (error) {
      console.error(`\n[ERROR] O servidor não está rodando em ${BASE_URL}.`)
      console.error('Execute "npm run dev" em outro terminal antes de rodar os testes E2E.\n')
      throw error
    }
  })

  // 1. GET /health
  describe('GET /health', () => {
    it('deve retornar status 200 e informações de conectividade com Redis', async () => {
      const response = await fetch(`${BASE_URL}/health`)
      expect(response.status).toBe(200)

      const body = await response.json() as { status: string; redis: string; timestamp: string }
      expect(body.status).toBe('ok')
      expect(body.redis).toBe('connected')
      expect(body.timestamp).toBeDefined()
      expect(new Date(body.timestamp).getTime()).not.toBeNaN()
    })
  })

  // 2. POST /webhook/violation - Payload válido
  describe('POST /webhook/violation', () => {
    it('deve aceitar payload válido, enfileirar o job e retornar status 201 com jobId determinístico', async () => {
      const uniqueAd = `ad-e2e-${Date.now()}-${Math.floor(Math.random() * 1000)}`
      const payload = {
        adId: uniqueAd,
        tenantId: 'tenant-e2e',
        violationType: 'PROHIBITED_TERM',
        severity: 'HIGH',
        detectedAt: '2026-05-21T10:00:00.000Z',
      }

      const response = await fetch(`${BASE_URL}/webhook/violation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      expect(response.status).toBe(201)

      const body = await response.json() as { jobId: string }
      expect(body.jobId).toBeDefined()
      expect(body.jobId).toContain(uniqueAd)
      expect(body.jobId).toContain('tenant-e2e')

      // Guardar o ID para testar a consulta do status posteriormente
      const createdJobId = body.jobId

      // Aguardar o worker processar o job (Mock da Meta API leva alguns milissegundos)
      await new Promise((resolve) => setTimeout(resolve, 3000))

      const statusResponse = await fetch(`${BASE_URL}/jobs/${createdJobId}`)
      expect(statusResponse.status).toBe(200)
      const statusBody = await statusResponse.json() as { jobId: string; status: string; attempts: number; result: Record<string, unknown>; error: string | null }
      expect(statusBody.jobId).toBe(createdJobId)
      expect(statusBody.status).toBe('completed')
      expect(statusBody.attempts).toBe(1)
      expect(statusBody.result).toEqual({ status: 200 })
      expect(statusBody.error).toBeNull()
    })

    // 3. Testar todos os violationTypes
    it.each(['PROHIBITED_TERM', 'BRAND_VIOLATION', 'COMPLIANCE_FAIL'])(
      'deve aceitar o tipo de violação %s e retornar 201',
      async (violationType) => {
        const payload = {
          adId: `ad-type-${violationType}-${Math.floor(Math.random() * 1000000)}`,
          tenantId: 'tenant-types',
          violationType,
          severity: 'LOW',
          detectedAt: '2026-05-21T10:00:00.000Z',
        }

        const response = await fetch(`${BASE_URL}/webhook/violation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        expect(response.status).toBe(201)
      }
    )

    // 4. Testar todos os severities
    it.each(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])(
      'deve aceitar a severidade %s e retornar 201',
      async (severity) => {
        const payload = {
          adId: `ad-sev-${severity}-${Math.floor(Math.random() * 1000000)}`,
          tenantId: 'tenant-sev',
          violationType: 'COMPLIANCE_FAIL',
          severity,
          detectedAt: '2026-05-21T10:00:00.000Z',
        }

        const response = await fetch(`${BASE_URL}/webhook/violation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        expect(response.status).toBe(201)
      }
    )

    // 5. Validação de Payload com Zod (HTTP 400)
    describe('Validações estritas de schema (HTTP 400)', () => {
      it('deve retornar 400 para payload vazio', async () => {
        const response = await fetch(`${BASE_URL}/webhook/violation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })

        expect(response.status).toBe(400)
        const body = await response.json() as { error: string; message: string; details: unknown[] }
        expect(body.error).toBe('Bad request')
        expect(body.message).toBe('Invalid payload')
        expect(body.details).toBeDefined()
        expect(body.details.length).toBeGreaterThan(0)
      })

      it('deve retornar 400 para violationType inválido', async () => {
        const response = await fetch(`${BASE_URL}/webhook/violation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            adId: 'x',
            tenantId: 'y',
            violationType: 'INVALID_TYPE',
            severity: 'HIGH',
            detectedAt: '2026-05-21T10:00:00.000Z',
          }),
        })

        expect(response.status).toBe(400)
      })

      it('deve retornar 400 para severity inválido', async () => {
        const response = await fetch(`${BASE_URL}/webhook/violation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            adId: 'x',
            tenantId: 'y',
            violationType: 'PROHIBITED_TERM',
            severity: 'URGENT',
            detectedAt: '2026-05-21T10:00:00.000Z',
          }),
        })

        expect(response.status).toBe(400)
      })

      it('deve retornar 400 para data detectedAt malformatada', async () => {
        const response = await fetch(`${BASE_URL}/webhook/violation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            adId: 'x',
            tenantId: 'y',
            violationType: 'PROHIBITED_TERM',
            severity: 'HIGH',
            detectedAt: 'nao-e-uma-data',
          }),
        })

        expect(response.status).toBe(400)
      })

      it('deve retornar 400 se adId for vazio', async () => {
        const response = await fetch(`${BASE_URL}/webhook/violation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            adId: '',
            tenantId: 'y',
            violationType: 'PROHIBITED_TERM',
            severity: 'HIGH',
            detectedAt: '2026-05-21T10:00:00.000Z',
          }),
        })

        expect(response.status).toBe(400)
      })

      it('deve retornar 400 se faltar campo obrigatório (tenantId)', async () => {
        const response = await fetch(`${BASE_URL}/webhook/violation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            adId: 'x',
            violationType: 'PROHIBITED_TERM',
            severity: 'HIGH',
            detectedAt: '2026-05-21T10:00:00.000Z',
          }),
        })

        expect(response.status).toBe(400)
      })
    })

    // 6. Teste de Idempotência (HTTP 409)
    describe('Controle de Idempotência', () => {
      it('deve retornar 409 para solicitações duplicadas consecutivas', async () => {
        const idempAd = `ad-idemp-${Date.now()}-${Math.floor(Math.random() * 1000)}`
        const payload = {
          adId: idempAd,
          tenantId: 'tenant-idemp',
          violationType: 'BRAND_VIOLATION',
          severity: 'CRITICAL',
          detectedAt: '2026-05-21T10:00:00.000Z',
        }

        // Cloggar o processamento enviando jobs prévios fakes de baixa severidade
        // Isso ajuda a garantir que o worker esteja ocupado ou com jobs na fila
        for (let i = 0; i < 5; i++) {
          await fetch(`${BASE_URL}/webhook/violation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              adId: `clog-${i}-${Math.floor(Math.random() * 1000000)}`,
              tenantId: 'clog',
              violationType: 'PROHIBITED_TERM',
              severity: 'LOW',
              detectedAt: '2026-05-21T10:00:00.000Z',
            }),
          })
        }

        // Dispara a primeira requisição (deve enfileirar com sucesso)
        const res1 = await fetch(`${BASE_URL}/webhook/violation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        expect(res1.status).toBe(201)

        // Dispara a segunda requisição idêntica imediatamente
        const res2 = await fetch(`${BASE_URL}/webhook/violation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        expect(res2.status).toBe(409)
        const body2 = await res2.json() as { error: string; message: string }
        expect(body2.error).toBe('Conflict')
        expect(body2.message).toContain(idempAd)
      })
    })
  })

  // 8. GET /jobs/:id - Job Inexistente (HTTP 404)
  describe('GET /jobs/:id - Consulta', () => {
    it('deve retornar 404 para job inexistente', async () => {
      const nonexistentId = 'job-que-nao-existe-xyz'
      const response = await fetch(`${BASE_URL}/jobs/${nonexistentId}`)

      expect(response.status).toBe(404)
      const body = await response.json() as { error: string; message: string }
      expect(body.error).toBe('Not found')
      expect(body.message).toContain(nonexistentId)
    })
  })
})
