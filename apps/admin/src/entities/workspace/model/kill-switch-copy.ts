export function killSwitchMismatchMessage(
  wanted: boolean,
  got: boolean,
  reason: string | null,
): string {
  if (wanted === got) return ''
  if (!wanted && got && reason === 'budget_exceeded') {
    return '409 BUDGET_EXCEEDED — выключить нельзя: токены кончились'
  }
  return `Kill-switch остаётся ${got ? 'ON' : 'OFF'}`
}
