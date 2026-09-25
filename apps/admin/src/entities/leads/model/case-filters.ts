import type { LeadCaseSummary } from '@app/shared'

export type CaseListFilter = 'all' | 'injection' | 'blocked' | 'duplicate' | 'qualify'

export function isInjectionCase(row: LeadCaseSummary): boolean {
  return (
    row.deliveryGuardReason === 'prompt_injection' ||
    row.reasons.includes('prompt_injection')
  )
}

export function isDuplicateCase(row: LeadCaseSummary): boolean {
  return row.rawCount > 1
}

export function isCleanQualify(row: LeadCaseSummary): boolean {
  return row.status === 'QUALIFY' && row.deliveryGuard === 'CLEAR'
}

export function caseMatchesFilter(row: LeadCaseSummary, filter: CaseListFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'injection') return isInjectionCase(row)
  if (filter === 'blocked') return row.deliveryGuard === 'BLOCKED'
  if (filter === 'duplicate') return isDuplicateCase(row)
  return isCleanQualify(row)
}

export function caseListBadge(row: LeadCaseSummary): string {
  if (isInjectionCase(row)) return 'injection'
  if (isDuplicateCase(row)) return 'дубль'
  if (isCleanQualify(row)) return 'чистый QUALIFY'
  if (row.deliveryGuard === 'BLOCKED') return 'blocked'
  return row.status
}
