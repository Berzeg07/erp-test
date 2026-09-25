import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import bcrypt from 'bcryptjs'
import type {
  CrmCompanyList,
  CrmDealList,
  CrmSnapshot,
  DlqList,
  LeadCaseList,
} from '@app/shared'
import { CRM_MAX_ATTEMPTS } from '@app/shared'
import { buildServer } from '../../app.js'
import { prisma } from '../../lib/prisma.js'
import { TENANT_ISOLATION } from '../../lib/tenant.js'
import { wipeLeadGraph } from '../../lib/wipe-lead-graph.js'
import { loadFixtureLeads } from '../imports/import.fixtures.js'

const hasDb = Boolean(process.env.DATABASE_URL)

describe.skipIf(!hasDb)('CRM-1 mock upsert, faults and DLQ', () => {
  const email = `crm-test-${Date.now()}@app.local`
  const password = 'testpass12'
  let token = ''
  const leads = loadFixtureLeads()

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(password, 10)
    await prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName: 'CRM Tester',
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
    await prisma.suppressionEntry.deleteMany()
  })

  afterAll(async () => {
    await wipeLeadGraph().catch(() => undefined)
    await prisma.suppressionEntry.deleteMany().catch(() => undefined)
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

  async function importIra(app: Awaited<ReturnType<typeof withApp>>) {
    const imported = await app.inject({
      method: 'POST',
      url: '/imports',
      headers: authHeaders('athenai_demo'),
      payload: { leads: leads.filter((row) => row.id === 'a-dup-ext-1') },
    })
    expect(imported.statusCode).toBe(200)
    const resolved = await app.inject({
      method: 'POST',
      url: '/cases/resolve',
      headers: authHeaders('athenai_demo'),
    })
    expect(resolved.statusCode).toBe(200)
    const listed = await app.inject({
      method: 'GET',
      url: '/cases',
      headers: authHeaders('athenai_demo'),
    })
    const body = listed.json() as LeadCaseList
    expect(body.cases[0]?.id).toBeTruthy()
    return body.cases[0]!.id
  }

  it('rejects sync without JWT', async () => {
    const app = await withApp()
    const res = await app.inject({
      method: 'POST',
      url: '/crm/sync',
      headers: { 'x-tenant-id': 'athenai_demo' },
      payload: { leadCaseId: '00000000-0000-4000-8000-000000000001' },
    })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('returns 404 TENANT_ISOLATION without tenant header', async () => {
    const app = await withApp()
    const res = await app.inject({
      method: 'POST',
      url: '/crm/sync',
      headers: authHeaders(),
      payload: { leadCaseId: '00000000-0000-4000-8000-000000000001' },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ error: TENANT_ISOLATION })
    await app.close()
  })

  it('upserts four entities and keeps the same ids on repeat', async () => {
    const app = await withApp()
    const caseId = await importIra(app)

    const first = await app.inject({
      method: 'POST',
      url: '/crm/sync',
      headers: authHeaders('athenai_demo'),
      payload: { leadCaseId: caseId },
    })
    expect(first.statusCode).toBe(200)
    const snapshot = first.json() as CrmSnapshot
    expect(snapshot.idempotent).toBe(false)
    expect(snapshot.leadCaseId).toBe(caseId)

    const second = await app.inject({
      method: 'POST',
      url: '/crm/sync',
      headers: authHeaders('athenai_demo'),
      payload: { leadCaseId: caseId },
    })
    expect(second.statusCode).toBe(200)
    const again = second.json() as CrmSnapshot
    expect(again.companyId).toBe(snapshot.companyId)
    expect(again.contactId).toBe(snapshot.contactId)
    expect(again.dealId).toBe(snapshot.dealId)
    expect(again.taskId).toBe(snapshot.taskId)
    expect(again.idempotent).toBe(true)

    const companies = await app.inject({
      method: 'GET',
      url: '/crm/companies',
      headers: authHeaders('athenai_demo'),
    })
    expect((companies.json() as CrmCompanyList).companies).toHaveLength(1)

    const deals = await app.inject({
      method: 'GET',
      url: '/crm/deals',
      headers: authHeaders('athenai_demo'),
    })
    expect((deals.json() as CrmDealList).deals.map((row) => row.id)).toEqual([snapshot.dealId])

    const leaked = await app.inject({
      method: 'GET',
      url: '/crm/deals',
      headers: authHeaders('proshelf_demo'),
    })
    expect((leaked.json() as CrmDealList).deals).toHaveLength(0)
    await app.close()
  })

  it('parks a 429 after retries in DLQ without writing CRM rows', async () => {
    const app = await withApp()
    const caseId = await importIra(app)

    const failed = await app.inject({
      method: 'POST',
      url: '/crm/sync',
      headers: authHeaders('athenai_demo', { 'x-crm-fault': '429' }),
      payload: { leadCaseId: caseId },
    })
    expect(failed.statusCode).toBe(429)
    expect(failed.json()).toEqual({ error: 'CRM_429' })

    const companies = await app.inject({
      method: 'GET',
      url: '/crm/companies',
      headers: authHeaders('athenai_demo'),
    })
    expect((companies.json() as CrmCompanyList).companies).toHaveLength(0)

    const dlq = await app.inject({
      method: 'GET',
      url: '/dlq',
      headers: authHeaders('athenai_demo'),
    })
    const items = (dlq.json() as DlqList).items
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ leadCaseId: caseId, fault: '429', attempts: CRM_MAX_ATTEMPTS, resolvedAt: null })
    await app.close()
  })

  it('parks a 5xx fault in DLQ', async () => {
    const app = await withApp()
    const caseId = await importIra(app)

    const failed = await app.inject({
      method: 'POST',
      url: '/crm/sync',
      headers: authHeaders('athenai_demo', { 'x-crm-fault': '500' }),
      payload: { leadCaseId: caseId },
    })
    expect(failed.statusCode).toBe(502)
    expect(failed.json()).toEqual({ error: 'CRM_5XX' })

    const dlq = await app.inject({
      method: 'GET',
      url: '/dlq',
      headers: authHeaders('athenai_demo'),
    })
    expect((dlq.json() as DlqList).items[0]?.fault).toBe('500')
    await app.close()
  })

  it('reprocesses a DLQ item to the same deal id and clears the queue', async () => {
    const app = await withApp()
    const caseId = await importIra(app)

    await app.inject({
      method: 'POST',
      url: '/crm/sync',
      headers: authHeaders('athenai_demo', { 'x-crm-fault': '500' }),
      payload: { leadCaseId: caseId },
    })
    const queued = await app.inject({
      method: 'GET',
      url: '/dlq',
      headers: authHeaders('athenai_demo'),
    })
    const dlqId = (queued.json() as DlqList).items[0]?.id
    expect(dlqId).toBeTruthy()

    const leaked = await app.inject({
      method: 'POST',
      url: `/dlq/${dlqId}/reprocess`,
      headers: authHeaders('proshelf_demo'),
    })
    expect(leaked.statusCode).toBe(404)
    expect(leaked.json()).toEqual({ error: TENANT_ISOLATION })

    const first = await app.inject({
      method: 'POST',
      url: `/dlq/${dlqId}/reprocess`,
      headers: authHeaders('athenai_demo'),
    })
    expect(first.statusCode).toBe(200)
    const snapshot = first.json() as CrmSnapshot
    expect(snapshot.dealId).toBeTruthy()

    const second = await app.inject({
      method: 'POST',
      url: `/dlq/${dlqId}/reprocess`,
      headers: authHeaders('athenai_demo'),
    })
    expect((second.json() as CrmSnapshot).dealId).toBe(snapshot.dealId)
    expect((second.json() as CrmSnapshot).idempotent).toBe(true)

    const empty = await app.inject({
      method: 'GET',
      url: '/dlq',
      headers: authHeaders('athenai_demo'),
    })
    expect((empty.json() as DlqList).items).toHaveLength(0)

    const deals = await app.inject({
      method: 'GET',
      url: '/crm/deals',
      headers: authHeaders('athenai_demo'),
    })
    expect((deals.json() as CrmDealList).deals).toHaveLength(1)
    expect((deals.json() as CrmDealList).deals[0]?.id).toBe(snapshot.dealId)
    await app.close()
  })
})
