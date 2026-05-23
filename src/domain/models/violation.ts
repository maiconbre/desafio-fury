export type ViolationType = 'PROHIBITED_TERM' | 'BRAND_VIOLATION' | 'COMPLIANCE_FAIL'

export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export interface ViolationPayload {
  adId: string
  tenantId: string
  violationType: ViolationType
  severity: Severity
  detectedAt: string
}

export interface TakedownResult {
  status: number
}
