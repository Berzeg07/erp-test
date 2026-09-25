import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import bcrypt from 'bcryptjs'
import {
  LLM_TOKENS_PER_CALL,
  type DraftVersionPublic,
  type LeadCaseDetail,
  type LeadCaseList,
  type Metrics,
  type TenantBudget,
} from '@app/shared'
import { buildServer } from '../../app.js'
import { prisma } from '../../lib/prisma.js'
import { TENANT_ISOLATION } from '../../lib/tenant.js'
import { wipeLeadGraph } from '../../lib/wipe-lead-graph.js'
import { loadFixtureLeads } from '../imports/import.fixtures.js'

const hasDb = Boolean(process.env.DATABASE_URL)

describe.skipIf(!hasDb)('METR-1 metrics and kill-switch', () => {
  const email = `metrics-test-${Date.now()}@app.local`
  const password = 'testpass12'
  let token = ''
  const leads = loadFixtureLeads()

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(password, 10)
    await prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName: 'Metrics Tester',
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

  it('rejects metrics without JWT', async () => {
    const app = await withApp()
    const res = await app.inject({
      method: 'GET',
      url: '/metrics',
      headers: { 'x-tenant-id': 'athenai_demo' },
    })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('returns 404 TENANT_ISOLATION without tenant header', async () => {
    const app = await withApp()
    const res = await app.inject({
      method: 'GET',
      url: '/metrics',
      headers: authHeaders(),
    })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ error: TENANT_ISOLATION })
    await app.close()
  })

  it('returns synthetic funnel counts for the current tenant only', async () => {
    const app = await withApp()
    await importResolve(app, 'athenai_demo', ['a-dup-ext-1'])

    const metrics = await app.inject({
      method: 'GET',
      url: '/metrics',
      headers: authHeaders('athenai_demo'),
    })
    expect(metrics.statusCode).toBe(200)
    expect(metrics.json()).toMatchObject({
      synthetic: true,
      tenant: 'athenai_demo',
      imported: 1,
      uniqueLeads: 1,
      qualified: 1,
      killSwitchOn: false,
    } satisfies Partial<Metrics>)

    const neighbor = await app.inject({
      method: 'GET',
      url: '/metrics',
      headers: authHeaders('proshelf_demo'),
    })
    expect(neighbor.json()).toMatchObject({
      synthetic: true,
      tenant: 'proshelf_demo',
      imported: 0,
      uniqueLeads: 0,
      killSwitchOn: false,
    })
    await app.close()
  })

  it('manual kill-switch blocks send and LLM, leaves import and the neighbor alive', async () => {
    const app = await withApp()
    const listed = await importResolve(app, 'athenai_demo', ['a-dup-ext-1'])
    const caseId = listed.cases[0]?.id

    const drafted = await app.inject({
      method: 'POST',
      url: `/cases/${caseId}/drafts`,
      headers: authHeaders('athenai_demo'),
    })
    const versionId = (drafted.json() as DraftVersionPublic).versionId
    await app.inject({
      method: 'POST',
      url: `/drafts/${versionId}/approve`,
      headers: authHeaders('athenai_demo'),
    })

    const toggled = await app.inject({
      method: 'POST',
      url: '/kill-switch',
      headers: authHeaders('athenai_demo'),
      payload: { on: true, reason: 'manual' },
    })
    expect(toggled.statusCode).toBe(200)
    expect(toggled.json()).toMatchObject({
      killSwitchOn: true,
      killSwitchReason: 'manual',
      tenant: 'athenai_demo',
    } satisfies Partial<TenantBudget>)

    const sent = await app.inject({
      method: 'POST',
      url: `/drafts/${versionId}/send`,
      headers: authHeaders('athenai_demo'),
    })
    expect(sent.statusCode).toBe(409)
    expect(sent.json()).toEqual({ error: 'KILL_SWITCH_ACTIVE' })

    const qualified = await app.inject({
      method: 'POST',
      url: `/cases/${caseId}/qualify`,
      headers: authHeaders('athenai_demo'),
    })
    expect(qualified.statusCode).toBe(200)
    expect((qualified.json() as LeadCaseDetail).decision?.llmOutput).toMatchObject({
      kind: 'skipped',
      reason: 'kill_switch',
    })

    const imported = await app.inject({
      method: 'POST',
      url: '/imports',
      headers: authHeaders('athenai_demo'),
      payload: { leads: leads.filter((row) => row.id === 'a-reject-consumer') },
    })
    expect(imported.statusCode).toBe(200)

    const neighbor = await app.inject({
      method: 'GET',
      url: '/metrics',
      headers: authHeaders('proshelf_demo'),
    })
    expect(neighbor.json()).toMatchObject({ tenant: 'proshelf_demo', killSwitchOn: false })

    const off = await app.inject({
      method: 'POST',
      url: '/kill-switch',
      headers: authHeaders('athenai_demo'),
      payload: { on: false },
    })
    expect(off.json()).toMatchObject({ killSwitchOn: false, killSwitchReason: null })
    await app.close()
  })

  it('budget kill-switch shows on metrics, blocks send, and does not trip the neighbor', async () => {
    await prisma.tenant.update({
      where: { slug: 'athenai_demo' },
      data: { llmTokenBudget: LLM_TOKENS_PER_CALL },
    })

    const app = await withApp()
    const listed = await importResolve(app, 'athenai_demo', ['a-dup-ext-1'])
    const caseId = listed.cases[0]?.id

    const metrics = await app.inject({
      method: 'GET',
      url: '/metrics',
      headers: authHeaders('athenai_demo'),
    })
    expect(metrics.json()).toMatchObject({
      killSwitchOn: true,
      killSwitchReason: 'budget_exceeded',
      uniqueLeads: 1,
    })

    const drafted = await app.inject({
      method: 'POST',
      url: `/cases/${caseId}/drafts`,
      headers: authHeaders('athenai_demo'),
    })
    const versionId = (drafted.json() as DraftVersionPublic).versionId
    await app.inject({
      method: 'POST',
      url: `/drafts/${versionId}/approve`,
      headers: authHeaders('athenai_demo'),
    })
    const sent = await app.inject({
      method: 'POST',
      url: `/drafts/${versionId}/send`,
      headers: authHeaders('athenai_demo'),
    })
    expect(sent.statusCode).toBe(409)
    expect(sent.json()).toEqual({ error: 'BUDGET_EXCEEDED' })

    const neighbor = await app.inject({
      method: 'GET',
      url: '/metrics',
      headers: authHeaders('proshelf_demo'),
    })
    expect(neighbor.json()).toMatchObject({ killSwitchOn: false, imported: 0 })

    const imported = await app.inject({
      method: 'POST',
      url: '/imports',
      headers: authHeaders('athenai_demo'),
      payload: { leads: leads.filter((row) => row.id === 'a-reject-consumer') },
    })
    expect(imported.statusCode).toBe(200)

    const cannotOff = await app.inject({
      method: 'POST',
      url: '/kill-switch',
      headers: authHeaders('athenai_demo'),
      payload: { on: false },
    })
    expect(cannotOff.json()).toMatchObject({ killSwitchOn: true, killSwitchReason: 'budget_exceeded' })
    await app.close()
  })
})
