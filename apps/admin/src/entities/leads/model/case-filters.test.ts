import { describe, expect, it } from 'vitest'
import type { LeadCaseSummary } from '@app/shared'
import {
  caseListBadge,
  caseMatchesFilter,
  isCleanQualify,
  isDuplicateCase,
  isInjectionCase,
} from './case-filters'

function sample(over: Partial<LeadCaseSummary> = {}): LeadCaseSummary {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    status: 'QUALIFY',
    deliveryGuard: 'CLEAR',
    deliveryGuardReason: null,
    processingBasis: 'CONSENT',
    processingBasisEvidenceRefs: [],
    sourcePurpose: 'webinar_followup',
    score: 80,
    confidence: 0.8,
    policyVersion: 'rules-v1',
    mergeBy: 'none',
    conflicts: [],
    reasons: [],
    person: { id: '00000000-0000-4000-8000-000000000002', emailNormalized: 'a@b.example', displayName: 'Ira' },
    company: { id: '00000000-0000-4000-8000-000000000003', name: 'Nimbus', domains: ['nimbus.example'] },
    rawCount: 1,
    ...over,
  }
}

describe('case list filters', () => {
  it('flags injection separately from status', () => {
    const row = sample({
      status: 'MANUAL_REVIEW',
      deliveryGuard: 'BLOCKED',
      deliveryGuardReason: 'prompt_injection',
      reasons: ['prompt_injection'],
    })
    expect(isInjectionCase(row)).toBe(true)
    expect(caseMatchesFilter(row, 'injection')).toBe(true)
    expect(caseListBadge(row)).toBe('injection')
  })

  it('flags duplicates by rawCount or mergeBy', () => {
    expect(isDuplicateCase(sample({ rawCount: 2 }))).toBe(true)
    expect(isDuplicateCase(sample({ mergeBy: 'domain', rawCount: 1 }))).toBe(false)
    expect(caseMatchesFilter(sample({ rawCount: 2 }), 'duplicate')).toBe(true)
  })

  it('keeps QUALIFY+CLEAR as the clean draft candidate', () => {
    const row = sample()
    expect(isCleanQualify(row)).toBe(true)
    expect(caseMatchesFilter(row, 'qualify')).toBe(true)
    expect(caseListBadge(row)).toBe('чистый QUALIFY')
  })

  it('does not treat a blocked case as a clean qualify', () => {
    const row = sample({ deliveryGuard: 'BLOCKED', deliveryGuardReason: 'opt_out' })
    expect(isCleanQualify(row)).toBe(false)
    expect(caseMatchesFilter(row, 'blocked')).toBe(true)
  })
})
