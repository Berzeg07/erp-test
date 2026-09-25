import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { config } from 'dotenv'
import { toTestDatabaseUrl } from './src/lib/test-database-url.js'

const require = createRequire(import.meta.url)

export default function setup() {
  config({ path: resolve(process.cwd(), '../../.env') })
  config()

  const source = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
  if (!source) {
    return
  }

  const testUrl = process.env.TEST_DATABASE_URL ?? toTestDatabaseUrl(source)
  const prismaCli = resolve(dirname(require.resolve('prisma/package.json')), 'build/index.js')
  const result = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'inherit',
  })

  if (result.status !== 0) {
    throw new Error(`prisma migrate deploy for test schema failed (exit ${result.status ?? 'null'})`)
  }
}
