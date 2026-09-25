import { describe, expect, it } from 'vitest'
import { killSwitchMismatchMessage } from './kill-switch-copy'

describe('kill-switch mismatch copy', () => {
  it('is silent when the toggle matches the server', () => {
    expect(killSwitchMismatchMessage(true, true, 'manual')).toBe('')
    expect(killSwitchMismatchMessage(false, false, null)).toBe('')
  })

  it('explains a budget lock when OFF is refused', () => {
    expect(killSwitchMismatchMessage(false, true, 'budget_exceeded')).toBe(
      '409 BUDGET_EXCEEDED — выключить нельзя: токены кончились',
    )
  })
})
