import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import bcrypt from 'bcryptjs'
import { MOCK_EMAIL_CHANNEL, type DraftVersionPublic, type LeadCaseList, type OutboxList, type OutboxSendResult } from '@app/shared'
import { buildServer } from '../../app.js'
import { prisma } from '../../lib/prisma.js'
import { TENANT_ISOLATION } from '../../lib/tenant.js'
import { wipeLeadGraph } from '../../lib/wipe-lead-graph.js'
import { loadFixtureLeads } from '../imports/import.fixtures.js'

const hasDb = Boolean(process.env.DATABASE_URL)

describe.skipIf(!hasDb)('OUT-1 mock-send outbox', () => {
  const email = `outbox-test-${Date.now()}@app.local`
  const password = 'testpass12'
  let token = ''
  const leads = loadFixtureLeads()

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(password, 10)
    await prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName: 'Outbox Tester',
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

  async function draftIra(app: Awaited<ReturnType<typeof withApp>>) {
    const listed = await importResolve(app, 'athenai_demo', ['a-dup-ext-1'])
    const caseId = listed.cases[0]?.id
    expect(listed.cases[0]).toMatchObject({ status: 'QUALIFY', deliveryGuard: 'CLEAR' })
    const created = await app.inject({
      method: 'POST',
      url: `/cases/${caseId}/drafts`,
      headers: authHeaders('athenai_demo'),
    })
    expect(created.statusCode).toBe(200)
    return { caseId: caseId!, version: created.json() as DraftVersionPublic }
  }

  async function approve(app: Awaited<ReturnType<typeof withApp>>, versionId: string) {
    const res = await app.inject({
      method: 'POST',
      url: `/drafts/${versionId}/approve`,
      headers: authHeaders('athenai_demo'),
    })
    expect(res.statusCode).toBe(200)
    return res.json() as DraftVersionPublic
  }

  it('rejects send without JWT', async () => {
    const app = await withApp()
    const res = await app.inject({
      method: 'POST',
      url: '/drafts/00000000-0000-4000-8000-000000000001/send',
      headers: { 'x-tenant-id': 'athenai_demo' },
    })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('returns 404 TENANT_ISOLATION without tenant header', async () => {
    const app = await withApp()
    const res = await app.inject({
      method: 'POST',
      url: '/drafts/00000000-0000-4000-8000-000000000001/send',
      headers: authHeaders(),
    })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ error: TENANT_ISOLATION })
    await app.close()
  })

  it('returns 409 APPROVAL_REQUIRED when the version is not approved', async () => {
    const app = await withApp()
    const { version } = await draftIra(app)
    const res = await app.inject({
      method: 'POST',
      url: `/drafts/${version.versionId}/send`,
      headers: authHeaders('athenai_demo'),
    })
    expect(res.statusCode).toBe(409)
    expect(res.json()).toEqual({ error: 'APPROVAL_REQUIRED' })

    const listed = await app.inject({
      method: 'GET',
      url: '/outbox',
      headers: authHeaders('athenai_demo'),
    })
    expect(listed.statusCode).toBe(200)
    expect((listed.json() as OutboxList).messages).toHaveLength(0)
    await app.close()
  })

  it('returns 409 APPROVAL_STALE when sending an older version after PATCH', async () => {
    const app = await withApp()
    const { version } = await draftIra(app)
    await approve(app, version.versionId)

    const patched = await app.inject({
      method: 'PATCH',
      url: `/drafts/${version.versionId}`,
      headers: authHeaders('athenai_demo'),
      payload: { text: 'Operator-edited follow-up after approval.' },
    })
    expect(patched.statusCode).toBe(200)
    const v2 = patched.json() as DraftVersionPublic

    const stale = await app.inject({
      method: 'POST',
      url: `/drafts/${version.versionId}/send`,
      headers: authHeaders('athenai_demo'),
    })
    expect(stale.statusCode).toBe(409)
    expect(stale.json()).toEqual({ error: 'APPROVAL_STALE' })

    const unapproved = await app.inject({
      method: 'POST',
      url: `/drafts/${v2.versionId}/send`,
      headers: authHeaders('athenai_demo'),
    })
    expect(unapproved.statusCode).toBe(409)
    expect(unapproved.json()).toEqual({ error: 'APPROVAL_REQUIRED' })
    await app.close()
  })

  it('returns 409 DELIVERY_BLOCKED if the guard flips after approval', async () => {
    const app = await withApp()
    const { caseId, version } = await draftIra(app)
    await approve(app, version.versionId)
    await prisma.leadCase.update({
      where: { id: caseId },
      data: { deliveryGuard: 'BLOCKED', deliveryGuardReason: 'opt_out' },
    })

    const res = await app.inject({
      method: 'POST',
      url: `/drafts/${version.versionId}/send`,
      headers: authHeaders('athenai_demo'),
    })
    expect(res.statusCode).toBe(409)
    expect(res.json()).toEqual({ error: 'DELIVERY_BLOCKED' })
    await app.close()
  })

  it('returns 409 KILL_SWITCH_ACTIVE and BUDGET_EXCEEDED without writing outbox', async () => {
    const app = await withApp()
    const { version } = await draftIra(app)
    await approve(app, version.versionId)

    await prisma.tenant.update({
      where: { slug: 'athenai_demo' },
      data: { killSwitchOn: true, killSwitchReason: 'manual' },
    })
    const killed = await app.inject({
      method: 'POST',
      url: `/drafts/${version.versionId}/send`,
      headers: authHeaders('athenai_demo'),
    })
    expect(killed.statusCode).toBe(409)
    expect(killed.json()).toEqual({ error: 'KILL_SWITCH_ACTIVE' })

    await prisma.tenant.update({
      where: { slug: 'athenai_demo' },
      data: { killSwitchOn: true, killSwitchReason: 'budget_exceeded' },
    })
    const budget = await app.inject({
      method: 'POST',
      url: `/drafts/${version.versionId}/send`,
      headers: authHeaders('athenai_demo'),
    })
    expect(budget.statusCode).toBe(409)
    expect(budget.json()).toEqual({ error: 'BUDGET_EXCEEDED' })

    const listed = await app.inject({
      method: 'GET',
      url: '/outbox',
      headers: authHeaders('athenai_demo'),
    })
    expect((listed.json() as OutboxList).messages).toHaveLength(0)
    await app.close()
  })

  it('writes MOCK_SENT once and repeats the same outboxId', async () => {
    const app = await withApp()
    const { caseId, version } = await draftIra(app)
    await approve(app, version.versionId)

    const first = await app.inject({
      method: 'POST',
      url: `/drafts/${version.versionId}/send`,
      headers: authHeaders('athenai_demo'),
    })
    expect(first.statusCode).toBe(200)
    const sent = first.json() as OutboxSendResult
    expect(sent).toMatchObject({
      synthetic: true,
      tenant: 'athenai_demo',
      leadCaseId: caseId,
      draftVersionId: version.versionId,
      status: 'MOCK_SENT',
      channel: MOCK_EMAIL_CHANNEL,
      idempotent: false,
    })
    expect(sent.toEmail).toBeTruthy()

    const leaked = await app.inject({
      method: 'POST',
      url: `/drafts/${version.versionId}/send`,
      headers: authHeaders('proshelf_demo'),
    })
    expect(leaked.statusCode).toBe(404)
    expect(leaked.json()).toEqual({ error: TENANT_ISOLATION })

    const second = await app.inject({
      method: 'POST',
      url: `/drafts/${version.versionId}/send`,
      headers: authHeaders('athenai_demo'),
    })
    expect(second.statusCode).toBe(200)
    const again = second.json() as OutboxSendResult
    expect(again.outboxId).toBe(sent.outboxId)
    expect(again.idempotent).toBe(true)
    expect(again.sentAt).toBe(sent.sentAt)

    await prisma.leadCase.update({
      where: { id: caseId },
      data: { deliveryGuard: 'BLOCKED' },
    })
    const afterBlock = await app.inject({
      method: 'POST',
      url: `/drafts/${version.versionId}/send`,
      headers: authHeaders('athenai_demo'),
    })
    expect(afterBlock.statusCode).toBe(200)
    expect((afterBlock.json() as OutboxSendResult).outboxId).toBe(sent.outboxId)

    const listed = await app.inject({
      method: 'GET',
      url: '/outbox',
      headers: authHeaders('athenai_demo'),
    })
    expect(listed.statusCode).toBe(200)
    const box = listed.json() as OutboxList
    expect(box.synthetic).toBe(true)
    expect(box.messages).toHaveLength(1)
    expect(box.messages[0]?.outboxId).toBe(sent.outboxId)
    expect(box.messages[0]).not.toHaveProperty('idempotent')

    const neighbor = await app.inject({
      method: 'GET',
      url: '/outbox',
      headers: authHeaders('proshelf_demo'),
    })
    expect(neighbor.statusCode).toBe(200)
    expect((neighbor.json() as OutboxList).messages).toHaveLength(0)
    await app.close()
  })
})
