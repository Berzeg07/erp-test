import { describe, expect, it } from 'vitest'
import type { LlmOutputStored } from '@app/shared'
import { qualifyLlmMessage } from './qualify-copy'

const locked = {
  tenant: 'athenai_demo' as const,
  channel: 'mock_email' as const,
  cta: 'book_a_15min_demo' as const,
}

describe('qualifyLlmMessage', () => {
  it('names kill-switch skip so the mute screencast can read it', () => {
    const output: LlmOutputStored = {
      kind: 'skipped',
      reason: 'kill_switch',
      tokensCharged: 0,
      locked,
    }
    expect(qualifyLlmMessage(output)).toEqual({
      text: '409 KILL_SWITCH_ACTIVE — mock LLM не вызван',
      type: 'error',
    })
  })

  it('names budget skip', () => {
    const output: LlmOutputStored = {
      kind: 'skipped',
      reason: 'budget_exceeded',
      tokensCharged: 0,
      locked,
    }
    expect(qualifyLlmMessage(output).text).toContain('BUDGET_EXCEEDED')
  })

  it('shows mock advice on a live call', () => {
    const output: LlmOutputStored = {
      kind: 'advice',
      advice: 'qualify',
      summary: 'Complete allowed-basis record according to rules-v1.',
      confidence: 0.78,
      tokensCharged: 250,
      locked,
    }
    expect(qualifyLlmMessage(output)).toMatchObject({
      type: 'success',
      text: expect.stringContaining('qualify'),
    })
  })
})
