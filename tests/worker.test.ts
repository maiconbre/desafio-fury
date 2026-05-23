import { describe, it, expect, vi } from 'vitest'
import type { ViolationPayload } from '../src/domain/models/violation.js'
import { createProcessJob } from '../src/infrastructure/queue/worker.js'
import { MetaGatewayPort } from '../src/domain/ports/meta-gateway.port.js'
import { ExternalApiError } from '../src/domain/errors/app-error.js'

const validData: ViolationPayload = {
  adId: 'ad-123',
  tenantId: 'tenant-456',
  violationType: 'PROHIBITED_TERM',
  severity: 'HIGH',
  detectedAt: '2026-05-21T10:00:00.000Z',
}

describe('processJob (createProcessJob)', () => {
  it('deve chamar o executeTakedown do gateway com adId e tenantId corretos e retornar sucesso', async () => {
    const mockGateway: MetaGatewayPort = {
      executeTakedown: vi.fn().mockResolvedValue({ status: 200 }),
    }

    const processJob = createProcessJob(mockGateway)
    const result = await processJob({ data: validData })

    expect(mockGateway.executeTakedown).toHaveBeenCalledWith('ad-123', 'tenant-456')
    expect(result).toEqual({ status: 200 })
  })

  it('deve propagar erro de tipo ExternalApiError lançado pelo gateway', async () => {
    const mockGateway: MetaGatewayPort = {
      executeTakedown: vi.fn().mockRejectedValue(new ExternalApiError('Meta API responded with 400', { status: 400 })),
    }

    const processJob = createProcessJob(mockGateway)

    await expect(processJob({ data: validData })).rejects.toMatchObject({
      name: 'ExternalApiError',
      message: 'Meta API responded with 400',
    })
  })

  it('deve propagar erros de rede lançados pelo gateway', async () => {
    const mockGateway: MetaGatewayPort = {
      executeTakedown: vi.fn().mockRejectedValue(new Error('Network timeout')),
    }

    const processJob = createProcessJob(mockGateway)

    await expect(processJob({ data: validData })).rejects.toThrow('Network timeout')
  })
})
