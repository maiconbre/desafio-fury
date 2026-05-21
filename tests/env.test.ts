import { describe, it, expect } from 'vitest'

describe('requirePort', () => {
  it('returns fallback when env is not set', async () => {
    const { requirePort } = await import('../src/config/env.js')
    expect(requirePort('UNSET_VAR', 3000)).toBe(3000)
  })

  it('returns fallback when env is empty string', async () => {
    process.env.TEST_EMPTY = ''
    const { requirePort } = await import('../src/config/env.js')
    expect(requirePort('TEST_EMPTY', 8080)).toBe(8080)
  })

  it('returns parsed number for valid port', async () => {
    process.env.TEST_PORT = '4000'
    const { requirePort } = await import('../src/config/env.js')
    expect(requirePort('TEST_PORT', 3000)).toBe(4000)
  })

  it('throws for NaN', async () => {
    process.env.TEST_NAN = 'not-a-number'
    const { requirePort } = await import('../src/config/env.js')
    expect(() => requirePort('TEST_NAN', 3000)).toThrow('must be a valid port')
  })

  it('throws for port 0', async () => {
    process.env.TEST_ZERO = '0'
    const { requirePort } = await import('../src/config/env.js')
    expect(() => requirePort('TEST_ZERO', 3000)).toThrow('must be a valid port')
  })

  it('throws for floating point', async () => {
    process.env.TEST_FLOAT = '123.45'
    const { requirePort } = await import('../src/config/env.js')
    expect(() => requirePort('TEST_FLOAT', 3000)).toThrow('must be a valid port')
  })

  it('throws for negative port', async () => {
    process.env.TEST_NEG = '-80'
    const { requirePort } = await import('../src/config/env.js')
    expect(() => requirePort('TEST_NEG', 3000)).toThrow('must be a valid port')
  })

  it('throws for port > 65535', async () => {
    process.env.TEST_HIGH = '70000'
    const { requirePort } = await import('../src/config/env.js')
    expect(() => requirePort('TEST_HIGH', 3000)).toThrow('must be a valid port')
  })

  it('accepts port 1', async () => {
    process.env.TEST_MIN = '1'
    const { requirePort } = await import('../src/config/env.js')
    expect(requirePort('TEST_MIN', 3000)).toBe(1)
  })

  it('accepts port 65535', async () => {
    process.env.TEST_MAX = '65535'
    const { requirePort } = await import('../src/config/env.js')
    expect(requirePort('TEST_MAX', 3000)).toBe(65535)
  })
})

describe('requireEnv', () => {
  it('returns value when env is set', async () => {
    process.env.TEST_VAL = 'my-value'
    const { requireEnv } = await import('../src/config/env.js')
    expect(requireEnv('TEST_VAL', 'fallback')).toBe('my-value')
  })

  it('returns fallback when env is not set', async () => {
    const { requireEnv } = await import('../src/config/env.js')
    expect(requireEnv('UNSET_VAR_2', 'fallback')).toBe('fallback')
  })

  it('throws when env is empty string', async () => {
    process.env.TEST_EMPTY2 = ''
    const { requireEnv } = await import('../src/config/env.js')
    expect(() => requireEnv('TEST_EMPTY2', 'fallback')).toThrow('required but was empty')
  })
})
