import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FixtureBundleSchema, type RawLeadRecord, type TenantSlug } from '@app/shared'
import { resolveFixturesDir } from './fixtures-path.js'

export function loadFixtureLeads(): RawLeadRecord[] {
  const path = join(resolveFixturesDir(), 'leads.json')
  return FixtureBundleSchema.parse(JSON.parse(readFileSync(path, 'utf8'))).leads
}

export function loadFixtureCsv(): string {
  return readFileSync(join(resolveFixturesDir(), 'leads.csv'), 'utf8')
}

export function mockSourceLeadsForTenant(slug: TenantSlug): RawLeadRecord[] {
  return loadFixtureLeads().filter((row) => row.tenantSlug === slug && row.source === 'mock_api')
}
