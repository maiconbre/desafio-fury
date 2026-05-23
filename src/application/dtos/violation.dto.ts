import { z } from 'zod'

export const ViolationTypeSchema = z.enum([
  'PROHIBITED_TERM',
  'BRAND_VIOLATION',
  'COMPLIANCE_FAIL',
])

export const SeveritySchema = z.enum([
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
])

export const violationSchema = z.object({
  adId: z.string().min(1, 'adId is required'),
  tenantId: z.string().min(1, 'tenantId is required'),
  violationType: ViolationTypeSchema,
  severity: SeveritySchema,
  detectedAt: z.string().datetime({ offset: true, message: 'detectedAt must be ISO 8601' }),
})

export const takedownResultSchema = z.object({
  status: z.number(),
})
