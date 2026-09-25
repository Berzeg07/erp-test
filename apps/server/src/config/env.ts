import { config } from 'dotenv'
import { resolve } from 'node:path'
import { z } from 'zod'

config({ path: resolve(process.cwd(), '../../.env') })
config()

const INSECURE_JWT_SECRETS = new Set([
  'change-me-in-production',
  'change-me',
  'secret',
  'jwt-secret',
  'your-secret-key',
])

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  SERVER_HOST: z.string().default('0.0.0.0'),
  SERVER_PORT: z.coerce.number().int().positive().default(4101),
  CORS_ORIGIN: z.string().default('http://localhost:5283'),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_TIME_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  AUTH_RATE_LIMIT_TIME_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
})

export const env = EnvSchema.parse(process.env)

export const corsOrigins = env.CORS_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

export function assertProductionSecrets() {
  if (process.env.NODE_ENV !== 'production') return

  const secret = String(process.env.JWT_SECRET ?? env.JWT_SECRET).trim()
  const normalized = secret.toLowerCase()

  if (
    secret.length < 32 ||
    INSECURE_JWT_SECRETS.has(normalized) ||
    normalized.includes('change-me')
  ) {
    throw new Error(
      'JWT_SECRET must be a unique random string of at least 32 characters in production',
    )
  }
}

assertProductionSecrets()
