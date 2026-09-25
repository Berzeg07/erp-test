import { describe, expect, it } from 'vitest'
import { WEB_API_PROXY_PREFIXES } from '../../../vite.api-prefixes'

describe('admin API proxy prefixes', () => {
  it('proxies authentication requests', () => {
    expect(WEB_API_PROXY_PREFIXES).toContain('/auth')
  })

  it('proxies OpenAPI UI', () => {
    expect(WEB_API_PROXY_PREFIXES).toContain('/docs')
  })
})
