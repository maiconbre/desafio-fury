import { z } from 'zod'

export const ViolationType = z.enum([
  'PROHIBITED_TERM',
  'BRAND_VIOLATION',
  'COMPLIANCE_FAIL',
])

export const Severity = z.enum([
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
])

export const violationSchema = z.object({
  adId: z.string().min(1, 'adId is required'),
  tenantId: z.string().min(1, 'tenantId is required'),
  violationType: ViolationType,
  severity: Severity,
  detectedAt: z.string().datetime({ offset: true, message: 'detectedAt must be ISO 8601' }),
})

export const takedownResultSchema = z.object({
  status: z.number(),
  ok: z.literal(true),
})

export type ViolationPayload = z.infer<typeof violationSchema>
export type TakedownResult = z.infer<typeof takedownResultSchema>
export type ViolationTypeEnum = z.infer<typeof ViolationType>
export type SeverityEnum = z.infer<typeof Severity>
