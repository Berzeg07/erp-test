import { config } from 'dotenv'
import { resolve } from 'node:path'
import { toTestDatabaseUrl } from './src/lib/test-database-url.js'

config({ path: resolve(process.cwd(), '../../.env') })
config()

process.env.JWT_SECRET ??= 'change-me-in-production-min-16'
process.env.NODE_ENV ??= 'test'

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
} else if (process.env.DATABASE_URL) {
  process.env.DATABASE_URL = toTestDatabaseUrl(process.env.DATABASE_URL)
} else {
  process.env.DATABASE_URL = 'postgresql://app:app@localhost:5432/app?schema=test'
}
