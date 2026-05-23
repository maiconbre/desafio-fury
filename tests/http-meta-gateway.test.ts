import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HttpMetaGateway } from '../src/infrastructure/queue/http-meta-gateway.js'

describe('HttpMetaGateway', () => {
  let gateway: HttpMetaGateway

  beforeEach(() => {
    gateway = new HttpMetaGateway()
    vi.restoreAllMocks()
  })

  it('deve retornar { status: 200 } quando a chamada HTTP retorna 200', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 1 }), { status: 200 }),
    )

    const result = await gateway.executeTakedown('ad-123', 'tenant-456')
    expect(result).toEqual({ status: 200 })
  })

  it('deve lançar ExternalApiError quando a chamada HTTP retorna 400', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(null, { status: 400 }),
    )

    await expect(gateway.executeTakedown('ad-123', 'tenant-456')).rejects.toMatchObject({
      name: 'ExternalApiError',
      message: 'Meta API responded with 400',
    })
  })

  it('deve lançar ExternalApiError quando a chamada HTTP retorna 500', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(null, { status: 500 }),
    )

    await expect(gateway.executeTakedown('ad-123', 'tenant-456')).rejects.toMatchObject({
      name: 'ExternalApiError',
      message: 'Meta API responded with 500',
    })
  })

  it('deve propagar erros de conexão de rede', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network timeout'))

    await expect(gateway.executeTakedown('ad-123', 'tenant-456')).rejects.toThrow('Network timeout')
  })

  it('deve propagar DOMException no caso de timeout do AbortSignal', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError')
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(abortError)

    await expect(gateway.executeTakedown('ad-123', 'tenant-456')).rejects.toThrow('The operation was aborted.')
  })
})
