import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import bcrypt from 'bcryptjs'
import type { LeadCaseDetail, LeadCaseList, RulesApplyResult } from '@app/shared'
import { buildServer } from '../../app.js'
import { prisma } from '../../lib/prisma.js'
import { TENANT_ISOLATION } from '../../lib/tenant.js'
import { wipeLeadGraph } from '../../lib/wipe-lead-graph.js'
import { loadFixtureLeads } from '../imports/import.fixtures.js'

const hasDb = Boolean(process.env.DATABASE_URL)

describe.skipIf(!hasDb)('RULE-1 rules-v1 qualification', () => {
  const email = `rules-test-${Date.now()}@app.local`
  const password = 'testpass12'
  let token = ''
  const leads = loadFixtureLeads()

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(password, 10)
    await prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName: 'Rules Tester',
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
    const payloadLeads = leads.filter((row) => ids.includes(row.id))
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
    const listed = await app.inject({
      method: 'GET',
      url: '/cases',
      headers: authHeaders(tenant),
    })
    expect(listed.statusCode).toBe(200)
    return listed.json() as LeadCaseList
  }

  it('rejects apply-rules without JWT', async () => {
    const app = await withApp()
    const res = await app.inject({
      method: 'POST',
      url: '/cases/apply-rules',
      headers: { 'x-tenant-id': 'athenai_demo' },
    })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('returns 404 TENANT_ISOLATION without tenant header', async () => {
    const app = await withApp()
    const res = await app.inject({
      method: 'POST',
      url: '/cases/apply-rules',
      headers: authHeaders(),
    })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ error: TENANT_ISOLATION })
    await app.close()
  })

  it('qualifies a complete consent case and stores DecisionRecord without LLM', async () => {
    const app = await withApp()
    const listed = await importResolve(app, 'athenai_demo', ['a-dup-ext-1', 'a-dup-ext-1b'])
    expect(listed.cases).toHaveLength(1)
    expect(listed.cases[0]).toMatchObject({
      status: 'QUALIFY',
      deliveryGuard: 'CLEAR',
      policyVersion: 'rules-v1',
    })
    expect(listed.cases[0]?.score).toBeGreaterThan(0)

    const detail = await app.inject({
      method: 'GET',
      url: `/cases/${listed.cases[0]?.id}`,
      headers: authHeaders('athenai_demo'),
    })
    expect(detail.statusCode).toBe(200)
    const body = detail.json() as LeadCaseDetail
    expect(body.decision).toMatchObject({
      policyVersion: 'rules-v1',
      status: 'QUALIFY',
      llmOutput: null,
    })
    expect(body.decision?.reasons).toContain('rules_v1_qualify')
    await app.close()
  })

  it('rejects a complete off-ICP record without blocking contact', async () => {
    const app = await withApp()
    const listed = await importResolve(app, 'athenai_demo', ['a-reject-consumer'])
    expect(listed.cases[0]).toMatchObject({
      status: 'REJECT',
      deliveryGuard: 'CLEAR',
    })
    expect(listed.cases[0]?.reasons).toContain('not_icp')
    await app.close()
  })

  it('does not qualify an incomplete record', async () => {
    const app = await withApp()
    const listed = await importResolve(app, 'athenai_demo', ['a-incomplete-empty'])
    expect(listed.cases[0]?.status).toBe('MANUAL_REVIEW')
    expect(listed.cases[0]?.status).not.toBe('QUALIFY')
    await app.close()
  })

  it('keeps source conflict on review and blocks outbound', async () => {
    const app = await withApp()
    const listed = await importResolve(app, 'athenai_demo', ['a-conflict-src-1', 'a-conflict-src-2'])
    expect(listed.cases).toHaveLength(2)
    expect(listed.cases.every((row) => row.status === 'MANUAL_REVIEW')).toBe(true)
    expect(listed.cases.every((row) => row.deliveryGuard === 'BLOCKED')).toBe(true)
    expect(listed.cases.every((row) => row.conflicts.includes('company_multiple_contacts'))).toBe(true)
    await app.close()
  })

  it('does not raise opt-out to QUALIFY', async () => {
    const app = await withApp()
    const listed = await importResolve(app, 'athenai_demo', ['a-optout-1'])
    expect(listed.cases[0]).toMatchObject({
      status: 'MANUAL_REVIEW',
      deliveryGuard: 'BLOCKED',
      deliveryGuardReason: 'opt_out',
    })
    await app.close()
  })

  it('qualifies one case via POST /cases/:id/qualify and 404s a foreign tenant', async () => {
    const app = await withApp()
    const listed = await importResolve(app, 'athenai_demo', ['a-basis-li'])
    const caseId = listed.cases[0]?.id
    expect(caseId).toBeTruthy()

    const qualified = await app.inject({
      method: 'POST',
      url: `/cases/${caseId}/qualify`,
      headers: authHeaders('athenai_demo'),
    })
    expect(qualified.statusCode).toBe(200)
    const body = qualified.json() as LeadCaseDetail
    expect(body.status).toBe('QUALIFY')
    expect(body.decision?.llmOutput).toBeNull()

    const leaked = await app.inject({
      method: 'POST',
      url: `/cases/${caseId}/qualify`,
      headers: authHeaders('proshelf_demo'),
    })
    expect(leaked.statusCode).toBe(404)
    expect(leaked.json()).toEqual({ error: TENANT_ISOLATION })

    const badId = await app.inject({
      method: 'POST',
      url: '/cases/not-a-uuid/qualify',
      headers: authHeaders('athenai_demo'),
    })
    expect(badId.statusCode).toBe(400)

    const applied = await app.inject({
      method: 'POST',
      url: '/cases/apply-rules',
      headers: authHeaders('athenai_demo'),
    })
    expect(applied.statusCode).toBe(200)
    const summary = applied.json() as RulesApplyResult
    expect(summary.policyVersion).toBe('rules-v1')
    expect(summary.qualified + summary.rejected + summary.review).toBe(1)
    expect(await prisma.decisionRecord.count({ where: { leadCaseId: caseId } })).toBe(1)
    await app.close()
  })
})
