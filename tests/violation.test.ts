import { describe, it, expect } from 'vitest'
import { violationSchema } from '../src/application/dtos/violation.dto.js'

const validPayload = {
  adId: 'ad-123',
  tenantId: 'tenant-456',
  violationType: 'PROHIBITED_TERM',
  severity: 'HIGH',
  detectedAt: '2026-05-21T10:00:00.000Z',
} as const

describe('violationSchema', () => {
  it('accepts valid payload', () => {
    const result = violationSchema.safeParse(validPayload)
    expect(result.success).toBe(true)
  })

  it('rejects missing adId', () => {
    const { adId: _, ...payload } = validPayload
    const result = violationSchema.safeParse(payload)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain('adId')
    }
  })

  it('rejects missing tenantId', () => {
    const { tenantId: _, ...payload } = validPayload
    const result = violationSchema.safeParse(payload)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain('tenantId')
    }
  })

  it('rejects invalid violationType', () => {
    const result = violationSchema.safeParse({ ...validPayload, violationType: 'INVALID' })
    expect(result.success).toBe(false)
  })

  it('rejects invalid severity', () => {
    const result = violationSchema.safeParse({ ...validPayload, severity: 'URGENT' })
    expect(result.success).toBe(false)
  })

  it('rejects invalid detectedAt format', () => {
    const result = violationSchema.safeParse({ ...validPayload, detectedAt: 'not-a-date' })
    expect(result.success).toBe(false)
  })

  it('rejects empty adId string', () => {
    const result = violationSchema.safeParse({ ...validPayload, adId: '' })
    expect(result.success).toBe(false)
  })

  it('accepts all violation types', () => {
    for (const violationType of ['PROHIBITED_TERM', 'BRAND_VIOLATION', 'COMPLIANCE_FAIL']) {
      const result = violationSchema.safeParse({ ...validPayload, violationType })
      expect(result.success).toBe(true)
    }
  })

  it('accepts all severity levels', () => {
    for (const severity of ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']) {
      const result = violationSchema.safeParse({ ...validPayload, severity })
      expect(result.success).toBe(true)
    }
  })
})
