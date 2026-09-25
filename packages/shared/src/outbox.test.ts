import { describe, expect, it } from 'vitest'
import { OutboxSendResultSchema } from './outbox.js'

describe('OutboxSendResultSchema', () => {
  it('accepts a mock-sent payload', () => {
    expect(
      OutboxSendResultSchema.parse({
        synthetic: true,
        tenant: 'athenai_demo',
        outboxId: '11111111-1111-4111-8111-111111111111',
        leadCaseId: '22222222-2222-4222-8222-222222222222',
        draftVersionId: '33333333-3333-4333-8333-333333333333',
        status: 'MOCK_SENT',
        channel: 'mock_email',
        toEmail: 'ira@nimbus-apps.example',
        idempotent: false,
        sentAt: '2026-09-25T18:00:00.000Z',
      }).status,
    ).toBe('MOCK_SENT')
  })

  it('rejects a live SMTP channel', () => {
    expect(
      OutboxSendResultSchema.safeParse({
        synthetic: true,
        tenant: 'athenai_demo',
        outboxId: '11111111-1111-4111-8111-111111111111',
        leadCaseId: '22222222-2222-4222-8222-222222222222',
        draftVersionId: '33333333-3333-4333-8333-333333333333',
        status: 'MOCK_SENT',
        channel: 'smtp',
        toEmail: 'ira@nimbus-apps.example',
        idempotent: false,
        sentAt: '2026-09-25T18:00:00.000Z',
      }).success,
    ).toBe(false)
  })
})
