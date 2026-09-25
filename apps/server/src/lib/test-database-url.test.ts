import { describe, expect, it } from 'vitest'
import { toTestDatabaseUrl } from './test-database-url.js'

describe('toTestDatabaseUrl', () => {
  it('switches public schema to test', () => {
    const url = toTestDatabaseUrl(
      'postgresql://app:app@localhost:5443/app?schema=public',
    )
    expect(new URL(url).searchParams.get('schema')).toBe('test')
    expect(new URL(url).pathname).toBe('/app')
  })

  it('adds schema=test when the param is missing', () => {
    const url = toTestDatabaseUrl('postgresql://app:app@localhost:5443/app')
    expect(new URL(url).searchParams.get('schema')).toBe('test')
  })

  it('keeps other query params', () => {
    const url = toTestDatabaseUrl(
      'postgresql://app:app@localhost:5443/app?schema=public&connection_limit=5',
    )
    const parsed = new URL(url)
    expect(parsed.searchParams.get('schema')).toBe('test')
    expect(parsed.searchParams.get('connection_limit')).toBe('5')
  })
})
