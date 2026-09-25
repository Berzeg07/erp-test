import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import bcrypt from 'bcryptjs'
import type { LeadCaseList, PolicyApplyResult } from '@app/shared'
import { buildServer } from '../../app.js'
import { prisma } from '../../lib/prisma.js'
import { TENANT_ISOLATION } from '../../lib/tenant.js'
import { wipeLeadGraph } from '../../lib/wipe-lead-graph.js'
import { loadFixtureLeads } from '../imports/import.fixtures.js'

const hasDb = Boolean(process.env.DATABASE_URL)

describe.skipIf(!hasDb)('POLICY-1 delivery guard', () => {
  const email = `policy-test-${Date.now()}@app.local`
  const password = 'testpass12'
  let token = ''
  const leads = loadFixtureLeads()

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(password, 10)
    await prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName: 'Policy Tester',
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

  it('returns 404 TENANT_ISOLATION without header on apply-policy', async () => {
    const app = await withApp()
    const res = await app.inject({
      method: 'POST',
      url: '/cases/apply-policy',
      headers: authHeaders(),
    })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ error: TENANT_ISOLATION })
    await app.close()
  })

  it('blocks opt-out as MANUAL_REVIEW + BLOCKED', async () => {
    const app = await withApp()
    const listed = await importResolve(app, 'athenai_demo', ['a-optout-1'])
    expect(listed.cases).toHaveLength(1)
    expect(listed.cases[0]).toMatchObject({
      status: 'MANUAL_REVIEW',
      deliveryGuard: 'BLOCKED',
      deliveryGuardReason: 'opt_out',
      processingBasis: 'PROHIBITED',
    })
    expect(listed.cases[0]?.processingBasisEvidenceRefs.length).toBeGreaterThan(0)
    await app.close()
  })

  it('blocks suppression list hits for this tenant only', async () => {
    const app = await withApp()
    const loaded = await app.inject({
      method: 'POST',
      url: '/suppression/from-fixtures',
      headers: authHeaders(),
    })
    expect(loaded.statusCode).toBe(200)

    const listed = await importResolve(app, 'athenai_demo', ['a-suppress-1'])
    expect(listed.cases[0]).toMatchObject({
      status: 'MANUAL_REVIEW',
      deliveryGuard: 'BLOCKED',
      deliveryGuardReason: 'suppression',
    })

    const other = await importResolve(app, 'proshelf_demo', ['p-iso-ivan'])
    expect(other.cases[0]?.deliveryGuard).toBe('CLEAR')
    expect(other.cases[0]?.deliveryGuardReason).toBeNull()
    await app.close()
  })

  it('blocks prompt injection in untrusted comment fields', async () => {
    const app = await withApp()
    const listed = await importResolve(app, 'athenai_demo', ['a-inject-1'])
    expect(listed.cases[0]).toMatchObject({
      status: 'MANUAL_REVIEW',
      deliveryGuard: 'BLOCKED',
      deliveryGuardReason: 'prompt_injection',
    })
    await app.close()
  })

  it('blocks UNKNOWN processing_basis', async () => {
    const app = await withApp()
    const listed = await importResolve(app, 'athenai_demo', ['a-basis-unknown'])
    expect(listed.cases[0]).toMatchObject({
      status: 'MANUAL_REVIEW',
      deliveryGuard: 'BLOCKED',
      deliveryGuardReason: 'unknown_processing_basis',
      processingBasis: 'UNKNOWN',
    })
    await app.close()
  })

  it('keeps a documented-consent case CLEAR (no QUALIFY yet)', async () => {
    const app = await withApp()
    const listed = await importResolve(app, 'athenai_demo', ['a-dup-ext-1'])
    expect(listed.cases[0]).toMatchObject({
      status: 'MANUAL_REVIEW',
      deliveryGuard: 'CLEAR',
      deliveryGuardReason: null,
      processingBasis: 'CONSENT',
    })
    await app.close()
  })

  it('re-applies policy after suppression load', async () => {
    const app = await withApp()
    await importResolve(app, 'athenai_demo', ['a-suppress-1'])
    const before = await app.inject({
      method: 'GET',
      url: '/cases',
      headers: authHeaders('athenai_demo'),
    })
    expect((before.json() as LeadCaseList).cases[0]?.deliveryGuard).toBe('CLEAR')

    await app.inject({
      method: 'POST',
      url: '/suppression/from-fixtures',
      headers: authHeaders(),
    })
    const applied = await app.inject({
      method: 'POST',
      url: '/cases/apply-policy',
      headers: authHeaders('athenai_demo'),
    })
    expect(applied.statusCode).toBe(200)
    expect((applied.json() as PolicyApplyResult).blocked).toBe(1)

    const after = await app.inject({
      method: 'GET',
      url: '/cases',
      headers: authHeaders('athenai_demo'),
    })
    expect((after.json() as LeadCaseList).cases[0]?.deliveryGuardReason).toBe('suppression')
    await app.close()
  })
})
