export interface MetaGatewayPort {
  executeTakedown(adId: string, tenantId: string): Promise<{ status: number }>
}
