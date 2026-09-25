import { describe, expect, it } from 'vitest'
import { ApiError, applyTenantHeader } from '@/shared/api/http'
import { DEFAULT_TENANT_SLUG, DEMO_TENANTS } from './tenant'

describe('demo tenant header', () => {
  it('defaults to athenai_demo', () => {
    expect(DEFAULT_TENANT_SLUG).toBe('athenai_demo')
    expect(DEMO_TENANTS.map((row) => row.slug)).toEqual(['athenai_demo', 'proshelf_demo'])
  })

  it('sets X-Tenant-Id when missing', () => {
    const headers = new Headers()
    applyTenantHeader(headers)
    expect(headers.get('X-Tenant-Id')).toBe(DEFAULT_TENANT_SLUG)
  })

  it('does not override an explicit tenant header', () => {
    const headers = new Headers({ 'X-Tenant-Id': 'proshelf_demo' })
    applyTenantHeader(headers)
    expect(headers.get('X-Tenant-Id')).toBe('proshelf_demo')
  })

  it('puts HTTP status and code on the card', () => {
    expect(new ApiError('APPROVAL_REQUIRED', 409).message).toBe('409 APPROVAL_REQUIRED')
    expect(new ApiError('KILL_SWITCH_ACTIVE', 409).message).toBe('409 KILL_SWITCH_ACTIVE')
  })
})
