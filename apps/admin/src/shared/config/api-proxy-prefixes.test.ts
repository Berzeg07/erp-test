import { describe, expect, it } from 'vitest'
import { WEB_API_PROXY_PREFIXES } from '../../../vite.api-prefixes'

describe('admin API proxy prefixes', () => {
  it('proxies authentication requests', () => {
    expect(WEB_API_PROXY_PREFIXES).toContain('/auth')
  })

  it('proxies OpenAPI UI', () => {
    expect(WEB_API_PROXY_PREFIXES).toContain('/docs')
  })

  it('proxies tenant routes', () => {
    expect(WEB_API_PROXY_PREFIXES).toContain('/tenants')
  })

  it('proxies import and mock-source routes', () => {
    expect(WEB_API_PROXY_PREFIXES).toContain('/imports')
    expect(WEB_API_PROXY_PREFIXES).toContain('/mock-source')
  })

  it('proxies case routes', () => {
    expect(WEB_API_PROXY_PREFIXES).toContain('/cases')
  })

  it('proxies draft routes', () => {
    expect(WEB_API_PROXY_PREFIXES).toContain('/drafts')
  })

  it('proxies outbox routes', () => {
    expect(WEB_API_PROXY_PREFIXES).toContain('/outbox')
  })

  it('proxies suppression routes', () => {
    expect(WEB_API_PROXY_PREFIXES).toContain('/suppression')
  })
})
