import { MetaGatewayPort } from '../../domain/ports/meta-gateway.port.js'
import { ExternalApiError } from '../../domain/errors/app-error.js'

const META_API_MOCK = 'https://jsonplaceholder.typicode.com/posts/1'

export class HttpMetaGateway implements MetaGatewayPort {
  async executeTakedown(adId: string, tenantId: string): Promise<{ status: number }> {
    // Em produção, usaríamos adId e tenantId para construir a requisição real
    const response = await fetch(META_API_MOCK, { signal: AbortSignal.timeout(8000) })

    if (!response.ok) {
      throw new ExternalApiError(`Meta API responded with ${response.status}`, {
        status: response.status,
      })
    }

    return { status: response.status }
  }
}
