import type { LlmOutputStored } from '@app/shared'

export type QualifyLlmAlert = {
  text: string
  type: 'success' | 'warning' | 'error'
}

export function qualifyLlmMessage(output: LlmOutputStored | null): QualifyLlmAlert {
  if (!output) {
    return { text: 'Qualify / LLM: нет llmOutput', type: 'warning' }
  }
  if (output.kind === 'skipped') {
    if (output.reason === 'kill_switch') {
      return { text: '409 KILL_SWITCH_ACTIVE — mock LLM не вызван', type: 'error' }
    }
    if (output.reason === 'budget_exceeded') {
      return { text: '409 BUDGET_EXCEEDED — mock LLM не вызван, токены кончились', type: 'error' }
    }
    return { text: 'mock LLM пропущен: delivery_blocked', type: 'warning' }
  }
  if (output.kind === 'error') {
    return {
      text: `mock LLM ошибка: ${output.error} — статус из сломанного JSON не повышаем`,
      type: 'warning',
    }
  }
  return {
    text: `mock LLM совет: ${output.advice} · ${output.summary} · tokens ${output.tokensCharged}`,
    type: 'success',
  }
}
