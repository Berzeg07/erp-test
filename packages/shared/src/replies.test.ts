import { describe, expect, it } from 'vitest'
import { EventBodySchema, ReplyBodySchema, taskTypeForReply } from './replies.js'

describe('REPLY-1 schemas', () => {
  it('accepts the six TZ reply types plus fixture neutral', () => {
    for (const type of ['positive', 'negative', 'question', 'opt_out', 'out_of_office', 'uncertain', 'neutral']) {
      expect(ReplyBodySchema.parse({ leadCaseId: '11111111-1111-4111-8111-111111111111', type }).type).toBe(type)
    }
  })

  it('rejects smtp-looking junk as a reply type', () => {
    expect(
      ReplyBodySchema.safeParse({
        leadCaseId: '11111111-1111-4111-8111-111111111111',
        type: 'smtp',
      }).success,
    ).toBe(false)
  })

  it('opens a manager task only for question, opt_out and uncertain', () => {
    expect(taskTypeForReply('question')).toBe('question')
    expect(taskTypeForReply('opt_out')).toBe('opt_out')
    expect(taskTypeForReply('uncertain')).toBe('uncertain')
    expect(taskTypeForReply('positive')).toBeNull()
    expect(taskTypeForReply('negative')).toBeNull()
    expect(taskTypeForReply('out_of_office')).toBeNull()
    expect(taskTypeForReply('neutral')).toBeNull()
  })

  it('accepts a payment/meeting event body with leadCaseId only', () => {
    expect(EventBodySchema.parse({ leadCaseId: '11111111-1111-4111-8111-111111111111' }).leadCaseId).toBe(
      '11111111-1111-4111-8111-111111111111',
    )
  })
})
