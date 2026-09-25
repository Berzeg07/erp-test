import { describe, expect, it } from 'vitest'
import { evaluateRulesV1, type RulesInput } from './rules.js'

function base(overrides: Partial<RulesInput> = {}): RulesInput {
  return {
    deliveryGuard: 'CLEAR',
    deliveryGuardReason: null,
    processingBasis: 'CONSENT',
    hasEmail: true,
    hasCompany: true,
    tags: [],
    sourcePurpose: 'webinar_followup',
    conflicts: [],
    mergeBy: 'external_id',
    ...overrides,
  }
}

describe('evaluateRulesV1', () => {
  it('qualifies a complete allowed-basis case without conflicts', () => {
    const out = evaluateRulesV1(base())
    expect(out.status).toBe('QUALIFY')
    expect(out.deliveryGuard).toBe('CLEAR')
    expect(out.llmOutput).toBeNull()
    expect(out.policyVersion).toBe('rules-v1')
    expect(out.reasons).toContain('rules_v1_qualify')
    expect(out.score).toBeGreaterThanOrEqual(80)
  })

  it('rejects a clean off-ICP record without blocking contact', () => {
    const out = evaluateRulesV1(base({ tags: ['reject_icp'], sourcePurpose: 'wrong_icp', mergeBy: 'none' }))
    expect(out.status).toBe('REJECT')
    expect(out.deliveryGuard).toBe('CLEAR')
    expect(out.reasons).toContain('not_icp')
  })

  it('does not qualify an incomplete record', () => {
    const out = evaluateRulesV1(
      base({
        hasEmail: false,
        hasCompany: false,
        mergeBy: 'none',
        processingBasis: 'CONSENT',
      }),
    )
    expect(out.status).toBe('MANUAL_REVIEW')
    expect(out.deliveryGuard).toBe('CLEAR')
    expect(out.reasons).toContain('incomplete_record')
  })

  it('blocks outbound while a Person×Company conflict is live', () => {
    const out = evaluateRulesV1(base({ conflicts: ['company_multiple_contacts'], mergeBy: 'domain' }))
    expect(out.status).toBe('MANUAL_REVIEW')
    expect(out.deliveryGuard).toBe('BLOCKED')
    expect(out.deliveryGuardReason).toBeNull()
    expect(out.reasons.some((row) => row.startsWith('conflict:'))).toBe(true)
  })

  it('keeps name-only overlap on review without blocking', () => {
    const out = evaluateRulesV1(base({ conflicts: ['name_only_overlap'], mergeBy: 'none' }))
    expect(out.status).toBe('MANUAL_REVIEW')
    expect(out.deliveryGuard).toBe('CLEAR')
    expect(out.reasons).toContain('low_merge_confidence')
  })

  it('does not raise a policy-blocked case to QUALIFY', () => {
    const out = evaluateRulesV1(
      base({
        deliveryGuard: 'BLOCKED',
        deliveryGuardReason: 'opt_out',
        processingBasis: 'PROHIBITED',
      }),
    )
    expect(out.status).toBe('MANUAL_REVIEW')
    expect(out.deliveryGuard).toBe('BLOCKED')
    expect(out.deliveryGuardReason).toBe('opt_out')
    expect(out.reasons).toContain('blocked:opt_out')
  })

  it('rejects invalid input via Zod', () => {
    expect(() =>
      evaluateRulesV1({
        ...base(),
        processingBasis: 'NOT_A_BASIS',
      } as unknown as RulesInput),
    ).toThrow()
  })
})
