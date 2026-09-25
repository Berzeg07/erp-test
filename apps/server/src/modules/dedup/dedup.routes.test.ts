import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import bcrypt from 'bcryptjs'
import type { DedupResolveResult, LeadCaseDetail, LeadCaseList } from '@app/shared'
import { buildServer } from '../../app.js'
import { prisma } from '../../lib/prisma.js'
import { wipeLeadGraph } from '../../lib/wipe-lead-graph.js'
import { TENANT_ISOLATION } from '../../lib/tenant.js'
import { loadFixtureLeads } from '../imports/import.fixtures.js'

const hasDb = Boolean(process.env.DATABASE_URL)

describe.skipIf(!hasDb)('DEDUP-1 lead resolution', () => {
  const email = `dedup-test-${Date.now()}@app.local`
  const password = 'testpass12'
  let token = ''
  const leads = loadFixtureLeads()

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(password, 10)
    await prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName: 'Dedup Tester',
        role: 'admin',
      },
    })
    await prisma.tenant.upsert({
      where: { slug: 'athenai_demo' },
      update: { name: 'AthenAI Demo' },
      create: { slug: 'athenai_demo', name: 'AthenAI Demo' },
    })
    await prisma.tenant.upsert({
      where: { slug: 'proshelf_demo' },
      update: { name: 'Proshelf Demo' },
      create: { slug: 'proshelf_demo', name: 'Proshelf Demo' },
    })

    const app = await buildServer({ logger: false })
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password },
    })
    token = (login.json() as { token: string }).token
    await app.close()
  })

  beforeEach(async () => {
    await wipeLeadGraph()
  })

  afterAll(async () => {
    await wipeLeadGraph().catch(() => undefined)
    await prisma.user.deleteMany({ where: { email } }).catch(() => undefined)
    await prisma.$disconnect()
  })

  async function withApp() {
    return buildServer({ logger: false })
  }

  function authHeaders(tenant?: string) {
    return {
      authorization: `Bearer ${token}`,
      ...(tenant ? { 'x-tenant-id': tenant } : {}),
    }
  }

  function byTag(tag: string) {
    return leads.filter((row) => row.tenantSlug === 'athenai_demo' && row.tags.includes(tag))
  }

  async function importAndResolve(
    app: Awaited<ReturnType<typeof withApp>>,
    tenant: string,
    payloadLeads: unknown[],
  ) {
    const imported = await app.inject({
      method: 'POST',
      url: '/imports',
      headers: authHeaders(tenant),
      payload: { leads: payloadLeads },
    })
    expect(imported.statusCode).toBe(200)
    const resolved = await app.inject({
      method: 'POST',
      url: '/cases/resolve',
      headers: authHeaders(tenant),
    })
    expect(resolved.statusCode).toBe(200)
    return resolved.json() as DedupResolveResult
  }

  async function listCases(app: Awaited<ReturnType<typeof withApp>>, tenant: string) {
    const res = await app.inject({
      method: 'GET',
      url: '/cases',
      headers: authHeaders(tenant),
    })
    expect(res.statusCode).toBe(200)
    return res.json() as LeadCaseList
  }

  it('rejects resolve without JWT', async () => {
    const app = await withApp()
    const res = await app.inject({
      method: 'POST',
      url: '/cases/resolve',
      headers: { 'x-tenant-id': 'athenai_demo' },
    })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('returns 404 TENANT_ISOLATION without header', async () => {
    const app = await withApp()
    const res = await app.inject({
      method: 'POST',
      url: '/cases/resolve',
      headers: authHeaders(),
    })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ error: TENANT_ISOLATION })
    await app.close()
  })

  it('merges the same external id into one case and keeps both raw rows', async () => {
    const app = await withApp()
    const result = await importAndResolve(app, 'athenai_demo', byTag('duplicate_external_id'))
    expect(result.cases).toBe(1)
    expect(result.attachedRaw).toBe(2)

    const listed = await listCases(app, 'athenai_demo')
    expect(listed.cases).toHaveLength(1)
    expect(listed.cases[0]?.mergeBy).toBe('external_id')
    expect(listed.cases[0]?.rawCount).toBe(2)
    expect(listed.cases[0]?.person.emailNormalized).toBe('ira@nimbus-apps.example')

    const detail = await app.inject({
      method: 'GET',
      url: `/cases/${listed.cases[0]?.id}`,
      headers: authHeaders('athenai_demo'),
    })
    expect(detail.statusCode).toBe(200)
    const body = detail.json() as LeadCaseDetail
    expect(body.rawRecords.map((row) => row.source).sort()).toEqual(['partner_json', 'webinar_csv'])
    expect(body.rawRecords.every((row) => row.externalId === 'WEB-100')).toBe(true)

    await app.close()
  })

  it('merges the same domain into one company/case', async () => {
    const app = await withApp()
    await importAndResolve(app, 'athenai_demo', byTag('duplicate_domain'))
    const listed = await listCases(app, 'athenai_demo')
    expect(listed.cases).toHaveLength(1)
    expect(listed.cases[0]?.mergeBy).toBe('domain')
    expect(listed.cases[0]?.company.domains).toEqual(['helix-plants.example'])
    expect(listed.cases[0]?.rawCount).toBe(2)
    await app.close()
  })

  it('does not merge companies by name alone', async () => {
    const app = await withApp()
    await importAndResolve(app, 'athenai_demo', byTag('weak_name_match'))
    const listed = await listCases(app, 'athenai_demo')
    expect(listed.cases).toHaveLength(2)
    const companyIds = new Set(listed.cases.map((row) => row.company.id))
    expect(companyIds.size).toBe(2)
    expect(listed.cases.every((row) => row.mergeBy === 'none')).toBe(true)
    expect(listed.cases.every((row) => row.conflicts.includes('name_only_overlap'))).toBe(true)
    await app.close()
  })

  it('creates two cases for one email at two companies', async () => {
    const app = await withApp()
    await importAndResolve(app, 'athenai_demo', byTag('email_two_companies'))
    const listed = await listCases(app, 'athenai_demo')
    expect(listed.cases).toHaveLength(2)
    expect(new Set(listed.cases.map((row) => row.person.id)).size).toBe(1)
    expect(new Set(listed.cases.map((row) => row.company.id)).size).toBe(2)
    expect(listed.cases.every((row) => row.person.emailNormalized === 'mila.dual@mail.example')).toBe(true)
    expect(listed.cases.every((row) => row.conflicts.includes('person_multiple_companies'))).toBe(true)
    await app.close()
  })

  it('does not merge two domains without shared external id evidence', async () => {
    const app = await withApp()
    await importAndResolve(app, 'athenai_demo', byTag('unconfirmed_domains'))
    const listed = await listCases(app, 'athenai_demo')
    expect(listed.cases).toHaveLength(2)
    expect(new Set(listed.cases.map((row) => row.company.id)).size).toBe(2)
    const domains = listed.cases.flatMap((row) => row.company.domains).sort()
    expect(domains).toEqual(['proshelf-corp.example', 'proshelf-shop.example'])
    expect(listed.cases.every((row) => row.conflicts.includes('name_only_overlap'))).toBe(true)
    await app.close()
  })

  it('does not glue the same email across tenants', async () => {
    const app = await withApp()
    const athenai = leads.filter((row) => row.id === 'a-iso-ivan')
    const proshelf = leads.filter((row) => row.id === 'p-iso-ivan')
    await importAndResolve(app, 'athenai_demo', athenai)
    await importAndResolve(app, 'proshelf_demo', proshelf)

    const aCases = await listCases(app, 'athenai_demo')
    const pCases = await listCases(app, 'proshelf_demo')
    expect(aCases.cases).toHaveLength(1)
    expect(pCases.cases).toHaveLength(1)
    expect(aCases.cases[0]?.person.id).not.toBe(pCases.cases[0]?.person.id)
    expect(aCases.cases[0]?.company.id).not.toBe(pCases.cases[0]?.company.id)
    expect(JSON.stringify(aCases)).not.toContain('proshelf_demo')
    expect(JSON.stringify(pCases)).not.toContain('athenai_demo')

    const leaked = await app.inject({
      method: 'GET',
      url: `/cases/${aCases.cases[0]?.id}`,
      headers: authHeaders('proshelf_demo'),
    })
    expect(leaked.statusCode).toBe(404)
    expect(leaked.json()).toEqual({ error: TENANT_ISOLATION })

    await app.close()
  })

  it('does not duplicate cases on repeat resolve', async () => {
    const app = await withApp()
    await importAndResolve(app, 'athenai_demo', byTag('duplicate_external_id'))
    const second = await app.inject({
      method: 'POST',
      url: '/cases/resolve',
      headers: authHeaders('athenai_demo'),
    })
    expect(second.statusCode).toBe(200)
    expect((second.json() as DedupResolveResult).cases).toBe(1)
    const listed = await listCases(app, 'athenai_demo')
    expect(listed.cases).toHaveLength(1)
    expect(listed.cases[0]?.rawCount).toBe(2)
    await app.close()
  })
})
