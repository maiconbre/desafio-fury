export function requireEnv(key: string, fallback: string): string {
  const value = process.env[key] ?? fallback
  if (value === '') {
    throw new Error(`Environment variable ${key} is required but was empty`)
  }
  return value
}

export function requirePort(key: string, fallback: number): number {
  const raw = process.env[key]
  if (raw === undefined || raw === '') return fallback
  const port = Number(raw)
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Environment variable ${key} must be a valid port (1-65535), got "${raw}"`)
  }
  return port
}

export const env = {
  REDIS_URL: requireEnv('REDIS_URL', 'redis://localhost:6379'),
  PORT: requirePort('PORT', 3000),
  LOG_LEVEL: requireEnv('LOG_LEVEL', 'info'),
} as const
