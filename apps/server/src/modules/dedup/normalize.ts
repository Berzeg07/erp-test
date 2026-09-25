export function normalizeEmail(value: string | undefined): string | null {
  const trimmed = value?.trim().toLowerCase() ?? ''
  if (!trimmed || !trimmed.includes('@')) return null
  return trimmed
}

export function normalizeDomain(value: string | undefined): string | null {
  let text = value?.trim().toLowerCase() ?? ''
  text = text.replace(/^https?:\/\//, '')
  text = text.replace(/^www\./, '')
  text = text.replace(/\/.*$/, '')
  text = text.replace(/\.$/, '')
  return text || null
}

const LEGAL_SUFFIX =
  /\b(ltd|llc|inc|corp|co|gmbh|limited|incorporated|company)\b/g

export function normalizeCompanyName(value: string | undefined): string | null {
  const text = (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[.,'"()]/g, ' ')
    .replace(LEGAL_SUFFIX, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text || null
}

export const MERGE_BY_RANK: Record<string, number> = {
  none: 0,
  company_name: 1,
  domain: 2,
  external_id: 3,
}

export function strongerMergeBy(current: string, next: string): string {
  return (MERGE_BY_RANK[next] ?? 0) > (MERGE_BY_RANK[current] ?? 0) ? next : current
}
