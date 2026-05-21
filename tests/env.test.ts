import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('env validation', () => {
  beforeEach(() => {
    // Limpa o cache do módulo para forçar a reavaliação do process.env
    vi.resetModules()
  })

  it('uses default values when env is empty', async () => {
    process.env = {}
    const { env } = await import('../src/config/env.js')
    expect(env.PORT).toBe(3000)
    expect(env.LOG_LEVEL).toBe('info')
    expect(env.REDIS_URL).toBe('redis://localhost:6379')
  })

  it('parses valid PORT correctly', async () => {
    process.env = { PORT: '4000' }
    const { env } = await import('../src/config/env.js')
    expect(env.PORT).toBe(4000)
  })

  it('throws an error if PORT is invalid (e.g. out of range)', async () => {
    process.env = { PORT: '70000' }
    await expect(import('../src/config/env.js')).rejects.toThrow('Invalid environment variables')
  })

  it('throws an error if PORT is negative', async () => {
    process.env = { PORT: '-80' }
    await expect(import('../src/config/env.js')).rejects.toThrow('Invalid environment variables')
  })

  it('throws an error if REDIS_URL is invalid', async () => {
    process.env = { REDIS_URL: 'not-a-url' }
    await expect(import('../src/config/env.js')).rejects.toThrow('Invalid environment variables')
  })
})

