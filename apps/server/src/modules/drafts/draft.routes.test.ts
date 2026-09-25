import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import bcrypt from 'bcryptjs'
import {
  MOCK_EMAIL_CHANNEL,
  POLICY_FIXED_CTA,
  type DraftList,
  type DraftVersionPublic,
  type LeadCaseList,
} from '@app/shared'
import { buildServer } from '../../app.js'
import { prisma } from '../../lib/prisma.js'
import { TENANT_ISOLATION } from '../../lib/tenant.js'
import { wipeLeadGraph } from '../../lib/wipe-lead-graph.js'
import { loadFixtureLeads } from '../imports/import.fixtures.js'

const hasDb = Boolean(process.env.DATABASE_URL)

describe.skipIf(!hasDb)('DRAFT-1 evidence draft and version approval', () => {
  const email = `draft-test-${Date.now()}@app.local`
  const password = 'testpass12'
  let token = ''
  const leads = loadFixtureLeads()

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(password, 10)
    await prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName: 'Draft Tester',
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

  function authHeaders(tenant?: string) {
    return {
      authorization: `Bearer ${token}`,
      ...(tenant ? { 'x-tenant-id': tenant } : {}),
    }
  }

  async function importResolve(app: Awaited<ReturnType<typeof withApp>>, tenant: string, ids: string[]) {
    const imported = await app.inject({
      method: 'POST',
      url: '/imports',
      headers: authHeaders(tenant),
      payload: { leads: leads.filter((row) => ids.includes(row.id)) },
    })
    expect(imported.statusCode).toBe(200)
    const resolved = await app.inject({
      method: 'POST',
      url: '/cases/resolve',
      headers: authHeaders(tenant),
    })
    expect(resolved.statusCode).toBe(200)
    const listed = await app.inject({
      method: 'GET',
      url: '/cases',
      headers: authHeaders(tenant),
    })
    expect(listed.statusCode).toBe(200)
    return listed.json() as LeadCaseList
  }

  it('rejects draft without JWT', async () => {
    const app = await withApp()
    const res = await app.inject({
      method: 'POST',
      url: '/cases/00000000-0000-4000-8000-000000000001/drafts',
      headers: { 'x-tenant-id': 'athenai_demo' },
    })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('returns 404 TENANT_ISOLATION without tenant header', async () => {
    const app = await withApp()
    const res = await app.inject({
      method: 'POST',
      url: '/cases/00000000-0000-4000-8000-000000000001/drafts',
      headers: authHeaders(),
    })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ error: TENANT_ISOLATION })
    await app.close()
  })

  it('builds an evidence-only draft for a QUALIFY + CLEAR case without approval', async () => {
    const app = await withApp()
    const listed = await importResolve(app, 'athenai_demo', ['a-dup-ext-1', 'a-dup-ext-1b'])
    const caseId = listed.cases[0]?.id
    expect(listed.cases[0]).toMatchObject({ status: 'QUALIFY', deliveryGuard: 'CLEAR' })

    const created = await app.inject({
      method: 'POST',
      url: `/cases/${caseId}/drafts`,
      headers: authHeaders('athenai_demo'),
    })
    expect(created.statusCode).toBe(200)
    const body = created.json() as DraftVersionPublic
    expect(body.approved).toBe(false)
    expect(body.approvedAt).toBeNull()
    expect(body.versionNumber).toBe(1)
    expect(body.channel).toBe(MOCK_EMAIL_CHANNEL)
    expect(body.cta).toBe(POLICY_FIXED_CTA)
    expect(body.body).toContain('Ira Sokolova')
    expect(body.body).toContain('Nimbus Apps')
    expect(body.body).toContain('CONSENT')
    expect(body.body).not.toContain('Attended pricing webinar')
    expect(body.body).not.toContain('according to rules-v1')

    const leaked = await app.inject({
      method: 'POST',
      url: `/cases/${caseId}/drafts`,
      headers: authHeaders('proshelf_demo'),
    })
    expect(leaked.statusCode).toBe(404)
    expect(leaked.json()).toEqual({ error: TENANT_ISOLATION })
    await app.close()
  })

  it('returns 409 DELIVERY_BLOCKED when the guard is red', async () => {
    const app = await withApp()
    const listed = await importResolve(app, 'athenai_demo', ['a-optout-1'])
    const res = await app.inject({
      method: 'POST',
      url: `/cases/${listed.cases[0]?.id}/drafts`,
      headers: authHeaders('athenai_demo'),
    })
    expect(res.statusCode).toBe(409)
    expect(res.json()).toEqual({ error: 'DELIVERY_BLOCKED' })
    await app.close()
  })

  it('returns 409 NOT_QUALIFIED for a clean off-ICP reject', async () => {
    const app = await withApp()
    const listed = await importResolve(app, 'athenai_demo', ['a-reject-consumer'])
    const res = await app.inject({
      method: 'POST',
      url: `/cases/${listed.cases[0]?.id}/drafts`,
      headers: authHeaders('athenai_demo'),
    })
    expect(res.statusCode).toBe(409)
    expect(res.json()).toEqual({ error: 'NOT_QUALIFIED' })
    await app.close()
  })

  it('approves a versionId and treats a later PATCH as a new unapproved version', async () => {
    const app = await withApp()
    const listed = await importResolve(app, 'athenai_demo', ['a-dup-ext-1'])
    const caseId = listed.cases[0]?.id

    const created = await app.inject({
      method: 'POST',
      url: `/cases/${caseId}/drafts`,
      headers: authHeaders('athenai_demo'),
    })
    const v1 = created.json() as DraftVersionPublic
    expect(v1.approved).toBe(false)

    const approved = await app.inject({
      method: 'POST',
      url: `/drafts/${v1.versionId}/approve`,
      headers: authHeaders('athenai_demo'),
    })
    expect(approved.statusCode).toBe(200)
    expect((approved.json() as DraftVersionPublic).approved).toBe(true)

    const patched = await app.inject({
      method: 'PATCH',
      url: `/drafts/${v1.versionId}`,
      headers: authHeaders('athenai_demo'),
      payload: { text: 'Operator-edited follow-up for Nimbus Apps Ltd.' },
    })
    expect(patched.statusCode).toBe(200)
    const v2 = patched.json() as DraftVersionPublic
    expect(v2.versionId).not.toBe(v1.versionId)
    expect(v2.versionNumber).toBeGreaterThan(v1.versionNumber)
    expect(v2.approved).toBe(false)
    expect(v2.body).toBe('Operator-edited follow-up for Nimbus Apps Ltd.')
    expect(v2.cta).toBe(POLICY_FIXED_CTA)

    const versions = await app.inject({
      method: 'GET',
      url: `/cases/${caseId}/drafts`,
      headers: authHeaders('athenai_demo'),
    })
    expect(versions.statusCode).toBe(200)
    const list = versions.json() as DraftList
    expect(list.versions).toHaveLength(2)
    expect(list.versions.find((row) => row.versionId === v1.versionId)?.approved).toBe(true)
    expect(list.versions.find((row) => row.versionId === v2.versionId)?.approved).toBe(false)

    const emptyPatch = await app.inject({
      method: 'PATCH',
      url: `/drafts/${v1.versionId}`,
      headers: authHeaders('athenai_demo'),
      payload: { text: '' },
    })
    expect(emptyPatch.statusCode).toBe(400)

    const leakedApprove = await app.inject({
      method: 'POST',
      url: `/drafts/${v1.versionId}/approve`,
      headers: authHeaders('proshelf_demo'),
    })
    expect(leakedApprove.statusCode).toBe(404)
    expect(leakedApprove.json()).toEqual({ error: TENANT_ISOLATION })
    await app.close()
  })
})
