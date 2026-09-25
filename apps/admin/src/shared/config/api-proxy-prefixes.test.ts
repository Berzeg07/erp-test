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

  it('proxies reply, task and event routes', () => {
    expect(WEB_API_PROXY_PREFIXES).toContain('/replies')
    expect(WEB_API_PROXY_PREFIXES).toContain('/tasks')
    expect(WEB_API_PROXY_PREFIXES).toContain('/events')
  })

  it('proxies mock CRM and DLQ routes', () => {
    expect(WEB_API_PROXY_PREFIXES).toContain('/crm')
    expect(WEB_API_PROXY_PREFIXES).toContain('/dlq')
  })

  it('proxies metrics and kill-switch routes', () => {
    expect(WEB_API_PROXY_PREFIXES).toContain('/metrics')
    expect(WEB_API_PROXY_PREFIXES).toContain('/kill-switch')
  })

  it('proxies suppression routes', () => {
    expect(WEB_API_PROXY_PREFIXES).toContain('/suppression')
  })

  it('proxies demo reset', () => {
    expect(WEB_API_PROXY_PREFIXES).toContain('/demo')
  })
})
