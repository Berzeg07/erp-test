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
})
