import { z } from 'zod'

const envSchema = z.object({
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  PORT: z.coerce
    .number()
    .int()
    .min(1, 'must be a valid port')
    .max(65535, 'must be a valid port')
    .default(3000),
  LOG_LEVEL: z.string().min(1, 'required but was empty').default('info'),
})

const _env = envSchema.safeParse(process.env)

if (!_env.success) {
  console.error('Invalid environment variables:', _env.error.format())
  throw new Error('Invalid environment variables')
}

export const env = _env.data

