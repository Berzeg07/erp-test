import { describe, expect, it } from 'vitest'
import { MOCK_EMAIL_CHANNEL, POLICY_FIXED_CTA } from './llm.js'
import { composeDraftFromEvidence, DraftPatchBodySchema } from './drafts.js'

const ira = {
  contactName: 'Ira Sokolova',
  email: 'ira@nimbus-apps.example',
  companyName: 'Nimbus Apps Ltd',
  domains: ['nimbus-apps.example'],
  processingBasis: 'CONSENT' as const,
  sourcePurpose: 'webinar_followup',
  evidenceRefs: [{ rawId: 'raw-1', field: 'processingBasis', source: 'webinar_csv' }],
}

describe('composeDraftFromEvidence', () => {
  it('builds subject and body only from card evidence and fixed CTA/channel', () => {
    const out = composeDraftFromEvidence(ira)
    expect(out.subject).toBe('Follow-up: Nimbus Apps Ltd')
    expect(out.body).toContain('Ira Sokolova')
    expect(out.body).toContain('ira@nimbus-apps.example')
    expect(out.body).toContain('Nimbus Apps Ltd')
    expect(out.body).toContain('CONSENT')
    expect(out.body).toContain('webinar_followup')
    expect(out.body).toContain(POLICY_FIXED_CTA)
    expect(out.body).toContain(MOCK_EMAIL_CHANNEL)
    expect(out.body).toContain('raw-1')
  })

  it('does not copy untrusted comment or LLM summary into the letter', () => {
    const out = composeDraftFromEvidence(ira)
    expect(out.body).not.toContain('Ignore previous')
    expect(out.body).not.toContain('Complete allowed-basis record')
    expect(out.body).not.toContain('Attended pricing webinar')
  })
})

describe('DraftPatchBodySchema', () => {
  it('rejects empty text', () => {
    expect(DraftPatchBodySchema.safeParse({ text: '' }).success).toBe(false)
    expect(DraftPatchBodySchema.safeParse({}).success).toBe(false)
  })
})
