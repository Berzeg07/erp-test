import type { TenantSlug } from '@app/shared'

export const TENANT_SLUG_KEY = 'app_tenant_slug'
export const DEFAULT_TENANT_SLUG: TenantSlug = 'athenai_demo'
export const DEMO_TENANTS: { slug: TenantSlug; label: string }[] = [
  { slug: 'athenai_demo', label: 'athenai_demo' },
  { slug: 'proshelf_demo', label: 'proshelf_demo' },
]

function isTenantSlug(value: string): value is TenantSlug {
  return value === 'athenai_demo' || value === 'proshelf_demo'
}

export function readTenantSlug(): TenantSlug {
  if (typeof localStorage === 'undefined') return DEFAULT_TENANT_SLUG
  const stored = localStorage.getItem(TENANT_SLUG_KEY)
  return stored && isTenantSlug(stored) ? stored : DEFAULT_TENANT_SLUG
}

export function saveTenantSlug(slug: TenantSlug): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(TENANT_SLUG_KEY, slug)
}
