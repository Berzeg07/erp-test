import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import bcrypt from 'bcryptjs'
import type { Metrics } from '@app/shared'
import { buildServer } from '../../app.js'
import { prisma } from '../../lib/prisma.js'
import { TENANT_ISOLATION } from '../../lib/tenant.js'
import { wipeLeadGraph } from '../../lib/wipe-lead-graph.js'
import { loadFixtureLeads } from '../imports/import.fixtures.js'

const hasDb = Boolean(process.env.DATABASE_URL)

describe.skipIf(!hasDb)('demo reset for mute screencast', () => {
  const email = `demo-reset-${Date.now()}@app.local`
  const password = 'testpass12'
  let token = ''
  const leads = loadFixtureLeads()

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(password, 10)
    await prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName: 'Demo Reset Tester',
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

  async function importOne(
    app: Awaited<ReturnType<typeof withApp>>,
    tenant: 'athenai_demo' | 'proshelf_demo',
    id: string,
  ) {
    return app.inject({
      method: 'POST',
      url: '/imports',
      headers: authHeaders(tenant),
      payload: { leads: leads.filter((row) => row.id === id) },
    })
  }

  it('rejects reset without JWT', async () => {
    const app = await withApp()
    const res = await app.inject({
      method: 'POST',
      url: '/demo/reset',
      headers: { 'x-tenant-id': 'athenai_demo' },
    })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('rejects reset without tenant header', async () => {
    const app = await withApp()
    const res = await app.inject({
      method: 'POST',
      url: '/demo/reset',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ error: TENANT_ISOLATION })
    await app.close()
  })

  it('clears the current tenant to zeros and leaves the neighbor', async () => {
    const app = await withApp()
    const athenaiLead = leads.find((row) => row.tenantSlug === 'athenai_demo')
    const neighborLead = leads.find((row) => row.tenantSlug === 'proshelf_demo')
    expect(athenaiLead && neighborLead).toBeTruthy()

    expect((await importOne(app, 'athenai_demo', athenaiLead!.id)).statusCode).toBe(200)
    expect((await importOne(app, 'proshelf_demo', neighborLead!.id)).statusCode).toBe(200)

    await app.inject({
      method: 'POST',
      url: '/kill-switch',
      headers: authHeaders('athenai_demo'),
      payload: { on: true, reason: 'manual' },
    })

    const reset = await app.inject({
      method: 'POST',
      url: '/demo/reset',
      headers: authHeaders('athenai_demo'),
    })
    expect(reset.statusCode).toBe(200)
    const body = reset.json() as Metrics
    expect(body).toMatchObject({
      synthetic: true,
      tenant: 'athenai_demo',
      imported: 0,
      uniqueLeads: 0,
      blocked: 0,
      killSwitchOn: false,
      killSwitchReason: null,
    })

    const neighbor = await app.inject({
      method: 'GET',
      url: '/metrics',
      headers: authHeaders('proshelf_demo'),
    })
    expect(neighbor.json()).toMatchObject({
      tenant: 'proshelf_demo',
      imported: 1,
      killSwitchOn: false,
    })
    await app.close()
  })
})
