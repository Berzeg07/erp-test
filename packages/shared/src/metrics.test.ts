import { describe, expect, it } from 'vitest'
import { KillSwitchBodySchema, MetricsSchema, humanMinutesFromCounts, ratio } from './metrics.js'

describe('METR-1 schemas', () => {
  it('requires synthetic true on metrics', () => {
    expect(
      MetricsSchema.parse({
        synthetic: true,
        tenant: 'athenai_demo',
        imported: 1,
        uniqueLeads: 1,
        qualified: 1,
        manualReview: 0,
        blocked: 0,
        drafts: 0,
        approvals: 0,
        mockSent: 0,
        replies: 0,
        meetings: 0,
        payments: 0,
        expenses: 0,
        humanMinutes: 0,
        costPerLead: 0,
        costPerMeeting: 0,
        cac: 0,
        killSwitchOn: false,
        killSwitchReason: null,
      }).synthetic,
    ).toBe(true)
  })

  it('rejects a live-looking payload without synthetic', () => {
    expect(MetricsSchema.safeParse({ tenant: 'athenai_demo', imported: 1 }).success).toBe(false)
  })

  it('counts approve as 2 minutes and review as 5', () => {
    expect(humanMinutesFromCounts(1, 1)).toBe(7)
    expect(ratio(10, 2)).toBe(5)
    expect(ratio(10, 0)).toBe(0)
  })

  it('accepts a kill-switch toggle', () => {
    expect(KillSwitchBodySchema.parse({ on: true, reason: 'manual' })).toEqual({ on: true, reason: 'manual' })
    expect(KillSwitchBodySchema.parse({ on: false }).on).toBe(false)
  })
})
