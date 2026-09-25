import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export function resolveFixturesDir(): string {
  const fromEnv = process.env.FIXTURES_DIR
  if (fromEnv && existsSync(join(fromEnv, 'leads.json'))) {
    return fromEnv
  }

  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    join(process.cwd(), 'fixtures'),
    join(process.cwd(), '../../fixtures'),
    join(here, '../../../../../fixtures'),
    join(here, '../../../../fixtures'),
  ]

  for (const dir of candidates) {
    if (existsSync(join(dir, 'leads.json'))) return dir
  }

  throw new Error('fixtures/leads.json not found')
}
