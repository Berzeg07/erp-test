import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import bcrypt from 'bcryptjs'
import {
  DEFAULT_LLM_TOKEN_BUDGET,
  LLM_TOKENS_PER_CALL,
  type LeadCaseDetail,
  type LeadCaseList,
  type TenantBudget,
} from '@app/shared'
import { buildServer } from '../../app.js'
import { prisma } from '../../lib/prisma.js'
import { TENANT_ISOLATION } from '../../lib/tenant.js'
import { wipeLeadGraph } from '../../lib/wipe-lead-graph.js'
import { loadFixtureLeads } from '../imports/import.fixtures.js'

const hasDb = Boolean(process.env.DATABASE_URL)

describe.skipIf(!hasDb)('LLM-1 mock adapter, schema and token budget', () => {
  const email = `llm-test-${Date.now()}@app.local`
  const password = 'testpass12'
  let token = ''
  const leads = loadFixtureLeads()

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(password, 10)
    await prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName: 'LLM Tester',
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

  async function importLeads(app: Awaited<ReturnType<typeof withApp>>, tenant: string, ids: string[]) {
    const imported = await app.inject({
      method: 'POST',
      url: '/imports',
      headers: authHeaders(tenant),
      payload: { leads: leads.filter((row) => ids.includes(row.id)) },
    })
    expect(imported.statusCode).toBe(200)
  }

  async function resolveCases(
    app: Awaited<ReturnType<typeof withApp>>,
    tenant: string,
    extra?: Record<string, string>,
  ) {
    const resolved = await app.inject({
      method: 'POST',
      url: '/cases/resolve',
      headers: authHeaders(tenant, extra),
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

  async function getBudget(app: Awaited<ReturnType<typeof withApp>>, tenant: string, slug = tenant) {
    return app.inject({
      method: 'GET',
      url: `/tenants/${slug}/budget`,
      headers: authHeaders(tenant),
    })
  }

  it('rejects budget without JWT', async () => {
    const app = await withApp()
    const res = await app.inject({
      method: 'GET',
      url: '/tenants/athenai_demo/budget',
      headers: { 'x-tenant-id': 'athenai_demo' },
    })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('returns 404 TENANT_ISOLATION for a foreign budget slug', async () => {
    const app = await withApp()
    const res = await getBudget(app, 'athenai_demo', 'proshelf_demo')
    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ error: TENANT_ISOLATION })
    await app.close()
  })

  it('stores mock advice on a CLEAR qualify case and charges tokens', async () => {
    const app = await withApp()
    await importLeads(app, 'athenai_demo', ['a-dup-ext-1', 'a-dup-ext-1b'])
    const listed = await resolveCases(app, 'athenai_demo')
    expect(listed.cases[0]?.status).toBe('QUALIFY')

    const detail = await app.inject({
      method: 'GET',
      url: `/cases/${listed.cases[0]?.id}`,
      headers: authHeaders('athenai_demo'),
    })
    const body = detail.json() as LeadCaseDetail
    expect(body.decision?.llmOutput).toMatchObject({
      kind: 'advice',
      advice: 'qualify',
      tokensCharged: LLM_TOKENS_PER_CALL,
      locked: {
        tenant: 'athenai_demo',
        channel: 'mock_email',
        cta: 'book_a_15min_demo',
      },
    })

    const budget = (await getBudget(app, 'athenai_demo')).json() as TenantBudget
    expect(budget).toMatchObject({
      synthetic: true,
      tenant: 'athenai_demo',
      tokenBudget: DEFAULT_LLM_TOKEN_BUDGET,
      tokenSpent: LLM_TOKENS_PER_CALL,
      killSwitchOn: false,
    })
    await app.close()
  })

  it.each([
    ['invalid_json', 'invalid_json', 'llm_invalid'],
    ['timeout', 'timeout', 'llm_timeout'],
    ['429', 'rate_limited', 'llm_rate_limited'],
    ['injection', 'injection', 'llm_injection'],
  ] as const)('fault %s keeps the card off QUALIFY', async (fault, error, reason) => {
    const app = await withApp()
    await importLeads(app, 'athenai_demo', ['a-dup-ext-1'])
    const listed = await resolveCases(app, 'athenai_demo', { 'x-llm-fault': fault })
    expect(listed.cases[0]?.status).toBe('MANUAL_REVIEW')
    expect(listed.cases[0]?.status).not.toBe('QUALIFY')
    expect(listed.cases[0]?.reasons).toContain(reason)

    const detail = await app.inject({
      method: 'GET',
      url: `/cases/${listed.cases[0]?.id}`,
      headers: authHeaders('athenai_demo'),
    })
    const body = detail.json() as LeadCaseDetail
    expect(body.decision?.llmOutput).toMatchObject({
      kind: 'error',
      error,
      locked: { tenant: 'athenai_demo', channel: 'mock_email' },
    })
    expect(body.processingBasis).toBe('CONSENT')
    await app.close()
  })

  it('does not let an injection payload change tenant, channel, CTA or processing_basis', async () => {
    const app = await withApp()
    await importLeads(app, 'athenai_demo', ['a-basis-li'])
    const listed = await resolveCases(app, 'athenai_demo', { 'x-llm-fault': 'injection' })
    const detail = await app.inject({
      method: 'GET',
      url: `/cases/${listed.cases[0]?.id}`,
      headers: authHeaders('athenai_demo'),
    })
    const body = detail.json() as LeadCaseDetail
    expect(body.status).toBe('MANUAL_REVIEW')
    expect(body.processingBasis).toBe('DOCUMENTED_LEGITIMATE_INTEREST')
    expect(body.decision?.llmOutput).toMatchObject({
      kind: 'error',
      error: 'injection',
      locked: {
        tenant: 'athenai_demo',
        channel: 'mock_email',
        cta: 'book_a_15min_demo',
      },
    })
    const budget = (await getBudget(app, 'athenai_demo')).json() as TenantBudget
    expect(budget.tokenBudget).toBe(DEFAULT_LLM_TOKEN_BUDGET)
    expect(budget.killSwitchOn).toBe(false)
    await app.close()
  })

  it('skips LLM on BLOCKED cards without spending tokens', async () => {
    const app = await withApp()
    await importLeads(app, 'athenai_demo', ['a-optout-1'])
    const listed = await resolveCases(app, 'athenai_demo')
    expect(listed.cases[0]).toMatchObject({
      status: 'MANUAL_REVIEW',
      deliveryGuard: 'BLOCKED',
    })

    const detail = await app.inject({
      method: 'GET',
      url: `/cases/${listed.cases[0]?.id}`,
      headers: authHeaders('athenai_demo'),
    })
    expect((detail.json() as LeadCaseDetail).decision?.llmOutput).toMatchObject({
      kind: 'skipped',
      reason: 'delivery_blocked',
      tokensCharged: 0,
    })
    const budget = (await getBudget(app, 'athenai_demo')).json() as TenantBudget
    expect(budget.tokenSpent).toBe(0)
    await app.close()
  })

  it('trips budget kill-switch, blocks further LLM calls, leaves the neighbor and import alive', async () => {
    await prisma.tenant.update({
      where: { slug: 'athenai_demo' },
      data: { llmTokenBudget: LLM_TOKENS_PER_CALL },
    })

    const app = await withApp()
    await importLeads(app, 'athenai_demo', ['a-dup-ext-1'])
    await resolveCases(app, 'athenai_demo')

    const afterFirst = (await getBudget(app, 'athenai_demo')).json() as TenantBudget
    expect(afterFirst.tokenSpent).toBe(LLM_TOKENS_PER_CALL)
    expect(afterFirst.killSwitchOn).toBe(true)
    expect(afterFirst.killSwitchReason).toBe('budget_exceeded')

    await importLeads(app, 'athenai_demo', ['a-basis-li'])
    const listed = await resolveCases(app, 'athenai_demo')
    const second = listed.cases.find((row) => row.processingBasis === 'DOCUMENTED_LEGITIMATE_INTEREST')
    expect(second).toBeTruthy()

    const detail = await app.inject({
      method: 'GET',
      url: `/cases/${second?.id}`,
      headers: authHeaders('athenai_demo'),
    })
    expect((detail.json() as LeadCaseDetail).decision?.llmOutput).toMatchObject({
      kind: 'skipped',
      reason: 'budget_exceeded',
      tokensCharged: 0,
    })

    const afterSecond = (await getBudget(app, 'athenai_demo')).json() as TenantBudget
    expect(afterSecond.tokenSpent).toBe(LLM_TOKENS_PER_CALL)

    const neighbor = await getBudget(app, 'proshelf_demo')
    expect(neighbor.statusCode).toBe(200)
    expect(neighbor.json()).toMatchObject({
      tenant: 'proshelf_demo',
      tokenSpent: 0,
      killSwitchOn: false,
    })

    const imported = await app.inject({
      method: 'POST',
      url: '/imports',
      headers: authHeaders('athenai_demo'),
      payload: { leads: leads.filter((row) => row.id === 'a-reject-consumer') },
    })
    expect(imported.statusCode).toBe(200)
    await app.close()
  })
})
