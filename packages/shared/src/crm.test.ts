import { describe, expect, it } from 'vitest'
import { CRM_MAX_ATTEMPTS, CrmFaultSchema, CrmSnapshotSchema, CrmSyncBodySchema } from './crm.js'

describe('CRM-1 schemas', () => {
  it('accepts 429 and 500 faults and rejects smtp', () => {
    expect(CrmFaultSchema.parse('429')).toBe('429')
    expect(CrmFaultSchema.parse('500')).toBe('500')
    expect(CrmFaultSchema.safeParse('smtp').success).toBe(false)
  })

  it('retries a bounded number of times before DLQ', () => {
    expect(CRM_MAX_ATTEMPTS).toBe(3)
  })

  it('requires a leadCaseId to sync', () => {
    expect(CrmSyncBodySchema.parse({ leadCaseId: '11111111-1111-4111-8111-111111111111' }).leadCaseId).toBe(
      '11111111-1111-4111-8111-111111111111',
    )
    expect(CrmSyncBodySchema.safeParse({}).success).toBe(false)
  })

  it('keeps four CRM ids on a snapshot', () => {
    const parsed = CrmSnapshotSchema.parse({
      synthetic: true,
      tenant: 'athenai_demo',
      leadCaseId: '11111111-1111-4111-8111-111111111111',
      companyId: '22222222-2222-4222-8222-222222222222',
      contactId: '33333333-3333-4333-8333-333333333333',
      dealId: '44444444-4444-4444-8444-444444444444',
      taskId: '55555555-5555-4555-8555-555555555555',
      idempotent: false,
    })
    expect(parsed.dealId).toBe('44444444-4444-4444-8444-444444444444')
  })
})
