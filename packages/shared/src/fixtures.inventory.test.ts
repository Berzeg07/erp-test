import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  ExpectedOutcomesBundleSchema,
  FixtureBundleSchema,
  PlannedReplySchema,
} from './fixtures.js'

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '../../../fixtures')

function readJson(name: string) {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8')) as unknown
}

describe('FIX-1 open fixture set', () => {
  const bundle = FixtureBundleSchema.parse(readJson('leads.json'))
  const expected = ExpectedOutcomesBundleSchema.parse(readJson('expected-outcomes.json'))

  it('has at least 60 synthetic leads across both tenants', () => {
    expect(bundle.synthetic).toBe(true)
    expect(bundle.leads.length).toBeGreaterThanOrEqual(60)
    const tenants = new Set(bundle.leads.map((row) => row.tenantSlug))
    expect(tenants).toEqual(new Set(['athenai_demo', 'proshelf_demo']))
  })

  it('covers required traps', () => {
    const tags = bundle.leads.flatMap((row) => row.tags)
    expect(tags).toContain('duplicate_external_id')
    expect(tags).toContain('duplicate_domain')
    expect(tags).toContain('incomplete')
    expect(tags).toContain('source_conflict')
    expect(tags).toContain('email_two_companies')
    expect(tags).toContain('opt_out')
    expect(tags).toContain('suppression')
    expect(tags).toContain('prompt_injection')
    expect(tags).toContain('cross_tenant_email')
    expect(bundle.leads.filter((row) => row.tags.includes('prompt_injection')).length).toBeGreaterThanOrEqual(5)

    const segments = new Set(bundle.leads.map((row) => row.segment).filter(Boolean))
    expect(segments.size).toBeGreaterThanOrEqual(3)

    const bases = new Set(bundle.leads.map((row) => row.processingBasis))
    expect(bases.has('CONSENT')).toBe(true)
    expect(bases.has('DOCUMENTED_LEGITIMATE_INTEREST')).toBe(true)
    expect(bases.has('UNKNOWN')).toBe(true)
    expect(bases.has('PROHIBITED')).toBe(true)

    const replies = new Set(bundle.leads.map((row) => row.plannedReply).filter(Boolean))
    for (const kind of PlannedReplySchema.options) {
      expect(replies.has(kind)).toBe(true)
    }

    const shared = bundle.leads.filter((row) => row.email === 'ivan.shared@mail.example')
    expect(new Set(shared.map((row) => row.tenantSlug))).toEqual(
      new Set(['athenai_demo', 'proshelf_demo']),
    )
  })

  it('has expected outcomes for every record', () => {
    const leadIds = bundle.leads.map((row) => row.id).sort()
    const outcomeIds = expected.outcomes.map((row) => row.recordId).sort()
    expect(outcomeIds).toEqual(leadIds)
    expect(expected.policyVersion).toBe('rules-v1')
  })

  it('keeps cross-tenant emails in separate merge groups', () => {
    const a = expected.outcomes.find((row) => row.recordId === 'a-iso-ivan')
    const p = expected.outcomes.find((row) => row.recordId === 'p-iso-ivan')
    expect(a?.tenantSlug).toBe('athenai_demo')
    expect(p?.tenantSlug).toBe('proshelf_demo')
    expect(a?.mergeGroup).not.toBe(p?.mergeGroup)
  })

  it('blocks opt-out and injection without QUALIFY', () => {
    const blocked = expected.outcomes.filter((row) =>
      ['opt_out', 'prompt_injection'].includes(row.deliveryGuardReason ?? ''),
    )
    expect(blocked.length).toBeGreaterThanOrEqual(6)
    expect(blocked.every((row) => row.status === 'MANUAL_REVIEW')).toBe(true)
    expect(blocked.every((row) => row.deliveryGuard === 'BLOCKED')).toBe(true)
  })
})
