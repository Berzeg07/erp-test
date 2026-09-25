import { describe, expect, it } from 'vitest'
import { normalizeCompanyName, normalizeDomain, normalizeEmail, strongerMergeBy } from './normalize.js'

describe('lead field normalization', () => {
  it('lowercases email and rejects values without @', () => {
    expect(normalizeEmail('  Ira@Nimbus-Apps.example ')).toBe('ira@nimbus-apps.example')
    expect(normalizeEmail('not-an-email')).toBeNull()
    expect(normalizeEmail(undefined)).toBeNull()
  })

  it('strips protocol and www from domains', () => {
    expect(normalizeDomain('https://www.Helix-Plants.example/path')).toBe('helix-plants.example')
    expect(normalizeDomain('cedar-tools.example')).toBe('cedar-tools.example')
    expect(normalizeDomain('  ')).toBeNull()
  })

  it('drops legal suffixes so name-only overlap is visible without merging', () => {
    expect(normalizeCompanyName('Northwind Labs')).toBe('northwind labs')
    expect(normalizeCompanyName('northwind labs llc')).toBe('northwind labs')
    expect(normalizeCompanyName('Proshelf Demo Co')).toBe('proshelf demo')
    expect(normalizeCompanyName('Helix Plants Inc')).toBe('helix plants')
  })

  it('ranks external_id above domain', () => {
    expect(strongerMergeBy('domain', 'external_id')).toBe('external_id')
    expect(strongerMergeBy('none', 'domain')).toBe('domain')
    expect(strongerMergeBy('external_id', 'domain')).toBe('external_id')
  })
})
