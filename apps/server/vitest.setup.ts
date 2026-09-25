import { config } from 'dotenv'
import { resolve } from 'node:path'

config({ path: resolve(process.cwd(), '../../.env') })
config()

process.env.DATABASE_URL ??= 'postgresql://app:app@localhost:5432/app?schema=public'
process.env.JWT_SECRET ??= 'change-me-in-production-min-16'
process.env.NODE_ENV ??= 'test'
