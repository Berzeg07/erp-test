import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import bcrypt from 'bcryptjs'
import type { ImportResult, RawLeadList } from '@app/shared'
import { buildServer } from '../../app.js'
import { prisma } from '../../lib/prisma.js'
import { TENANT_ISOLATION } from '../../lib/tenant.js'
import { loadFixtureCsv, loadFixtureLeads } from './import.fixtures.js'

const hasDb = Boolean(process.env.DATABASE_URL)

describe.skipIf(!hasDb)('IMP-1 raw lead import', () => {
  const email = `import-test-${Date.now()}@app.local`
  const password = 'testpass12'
  let token = ''
  const leads = loadFixtureLeads()

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(password, 10)
    await prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName: 'Import Tester',
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
    await prisma.rawLeadRecord.deleteMany()
  })

  afterAll(async () => {
    await prisma.rawLeadRecord.deleteMany().catch(() => undefined)
    await prisma.user.deleteMany({ where: { email } }).catch(() => undefined)
    await prisma.$disconnect()
  })

  async function withApp() {
    return buildServer({ logger: false })
  }

  function authHeaders(tenant?: string, extra?: Record<string, string>) {
    return {
      authorization: `Bearer ${token}`,
      ...(tenant ? { 'x-tenant-id': tenant } : {}),
      ...extra,
    }
  }

  it('rejects import without JWT', async () => {
    const app = await withApp()
    const res = await app.inject({
      method: 'POST',
      url: '/imports',
      headers: { 'x-tenant-id': 'athenai_demo' },
      payload: { leads: [] },
    })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('returns 404 TENANT_ISOLATION without header', async () => {
    const app = await withApp()
    const res = await app.inject({
      method: 'POST',
      url: '/imports',
      headers: authHeaders(),
      payload: { leads: [] },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ error: TENANT_ISOLATION })
    await app.close()
  })

  it('rejects import without leads or csv', async () => {
    const app = await withApp()
    const res = await app.inject({
      method: 'POST',
      url: '/imports',
      headers: authHeaders('athenai_demo'),
      payload: {},
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: 'VALIDATION_ERROR' })
    await app.close()
  })

  it('imports JSON without duplicating on repeat and keeps two WEB-100 sources', async () => {
    const app = await withApp()
    const first = await app.inject({
      method: 'POST',
      url: '/imports',
      headers: authHeaders('athenai_demo'),
      payload: { leads },
    })
    expect(first.statusCode).toBe(200)
    const firstBody = first.json() as ImportResult
    const athenaiCount = leads.filter((row) => row.tenantSlug === 'athenai_demo').length
    const otherCount = leads.filter((row) => row.tenantSlug !== 'athenai_demo').length
    expect(firstBody).toMatchObject({
      synthetic: true,
      tenant: 'athenai_demo',
      accepted: athenaiCount,
      created: athenaiCount,
      updated: 0,
      skippedOtherTenant: otherCount,
      skippedInvalid: 0,
    })

    const second = await app.inject({
      method: 'POST',
      url: '/imports',
      headers: authHeaders('athenai_demo'),
      payload: { leads },
    })
    expect(second.statusCode).toBe(200)
    const secondBody = second.json() as ImportResult
    expect(secondBody.created).toBe(0)
    expect(secondBody.updated).toBe(athenaiCount)
    expect(secondBody.accepted).toBe(athenaiCount)

    const listed = await app.inject({
      method: 'GET',
      url: '/imports/raw',
      headers: authHeaders('athenai_demo'),
    })
    expect(listed.statusCode).toBe(200)
    const listBody = listed.json() as RawLeadList
    expect(listBody.records).toHaveLength(athenaiCount)
    expect(listBody.records.every((row) => row.payload.tenantSlug === 'athenai_demo')).toBe(true)

    const web100 = listBody.records.filter((row) => row.externalId === 'WEB-100')
    expect(web100.map((row) => row.source).sort()).toEqual(['partner_json', 'webinar_csv'])

    await app.close()
  })

  it('does not leak athenai raw rows to proshelf header', async () => {
    const app = await withApp()
    await app.inject({
      method: 'POST',
      url: '/imports',
      headers: authHeaders('athenai_demo'),
      payload: { leads },
    })

    const leaked = await app.inject({
      method: 'GET',
      url: '/imports/raw',
      headers: authHeaders('proshelf_demo'),
    })
    expect(leaked.statusCode).toBe(200)
    const body = leaked.json() as RawLeadList
    expect(body.tenant).toBe('proshelf_demo')
    expect(body.records).toEqual([])
    expect(JSON.stringify(body)).not.toContain('athenai_demo')
    expect(JSON.stringify(body)).not.toContain('Nimbus Apps')

    await app.close()
  })

  it('imports the fixture CSV the same as JSON for the current tenant', async () => {
    const app = await withApp()
    const csv = loadFixtureCsv()
    const res = await app.inject({
      method: 'POST',
      url: '/imports',
      headers: authHeaders('athenai_demo', { 'content-type': 'text/csv' }),
      payload: csv,
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as ImportResult
    const athenaiCount = leads.filter((row) => row.tenantSlug === 'athenai_demo').length
    expect(body.accepted).toBe(athenaiCount)
    expect(body.created).toBe(athenaiCount)
    expect(body.skippedInvalid).toBe(0)

    const jsonCsv = await app.inject({
      method: 'POST',
      url: '/imports',
      headers: authHeaders('proshelf_demo'),
      payload: { csv },
    })
    expect(jsonCsv.statusCode).toBe(200)
    const proshelfCount = leads.filter((row) => row.tenantSlug === 'proshelf_demo').length
    expect((jsonCsv.json() as ImportResult).created).toBe(proshelfCount)

    await app.close()
  })

  it('exposes mock-source only for the current tenant and imports it idempotently', async () => {
    const app = await withApp()
    const mock = await app.inject({
      method: 'GET',
      url: '/mock-source/leads',
      headers: authHeaders('athenai_demo'),
    })
    expect(mock.statusCode).toBe(200)
    const mockBody = mock.json() as { synthetic: true; tenant: string; leads: { tenantSlug: string; source: string }[] }
    expect(mockBody.synthetic).toBe(true)
    expect(mockBody.tenant).toBe('athenai_demo')
    expect(mockBody.leads.length).toBeGreaterThan(0)
    expect(mockBody.leads.every((row) => row.tenantSlug === 'athenai_demo' && row.source === 'mock_api')).toBe(true)
    expect(mockBody.leads.some((row) => row.tenantSlug === 'proshelf_demo')).toBe(false)

    const first = await app.inject({
      method: 'POST',
      url: '/imports/from-mock-source',
      headers: authHeaders('athenai_demo'),
    })
    const second = await app.inject({
      method: 'POST',
      url: '/imports/from-mock-source',
      headers: authHeaders('athenai_demo'),
    })
    expect(first.statusCode).toBe(200)
    expect(second.statusCode).toBe(200)
    const firstBody = first.json() as ImportResult
    const secondBody = second.json() as ImportResult
    expect(firstBody.created).toBe(mockBody.leads.length)
    expect(secondBody.created).toBe(0)
    expect(secondBody.updated).toBe(mockBody.leads.length)

    await app.close()
  })
})
