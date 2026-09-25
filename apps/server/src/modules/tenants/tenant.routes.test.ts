import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import bcrypt from 'bcryptjs'
import { buildServer } from '../../app.js'
import { prisma } from '../../lib/prisma.js'
import { TENANT_ISOLATION } from '../../lib/tenant.js'

const hasDb = Boolean(process.env.DATABASE_URL)

describe.skipIf(!hasDb)('tenant isolation', () => {
  const email = `tenant-test-${Date.now()}@app.local`
  const password = 'testpass12'
  let token = ''

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(password, 10)
    await prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName: 'Tenant Tester',
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

  afterAll(async () => {
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

  it('does not require tenant on health', async () => {
    const app = await withApp()
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('rejects domain route without JWT', async () => {
    const app = await withApp()
    const res = await app.inject({
      method: 'GET',
      url: '/tenants/current',
      headers: { 'x-tenant-id': 'athenai_demo' },
    })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('lists tenants for the operator without X-Tenant-Id', async () => {
    const app = await withApp()
    const res = await app.inject({
      method: 'GET',
      url: '/tenants',
      headers: authHeaders(),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { tenants: { slug: string }[] }
    expect(body.tenants.map((item) => item.slug).sort()).toEqual(['athenai_demo', 'proshelf_demo'])
    await app.close()
  })

  it('returns 404 TENANT_ISOLATION when header is missing', async () => {
    const app = await withApp()
    const res = await app.inject({
      method: 'GET',
      url: '/tenants/current',
      headers: authHeaders(),
    })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ error: TENANT_ISOLATION })
    await app.close()
  })

  it('returns 404 TENANT_ISOLATION for unknown tenant', async () => {
    const app = await withApp()
    const res = await app.inject({
      method: 'GET',
      url: '/tenants/current',
      headers: authHeaders('not_a_tenant'),
    })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ error: TENANT_ISOLATION })
    await app.close()
  })

  it('returns current tenant for a valid header', async () => {
    const app = await withApp()
    const res = await app.inject({
      method: 'GET',
      url: '/tenants/current',
      headers: authHeaders('athenai_demo'),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ slug: 'athenai_demo', name: 'AthenAI Demo' })
    await app.close()
  })

  it('does not return tenant A when header is tenant B', async () => {
    const app = await withApp()
    const res = await app.inject({
      method: 'GET',
      url: '/tenants/athenai_demo',
      headers: authHeaders('proshelf_demo'),
    })
    expect(res.statusCode).toBe(404)
    const body = res.json() as { error: string; slug?: string; name?: string }
    expect(body).toEqual({ error: TENANT_ISOLATION })
    expect(JSON.stringify(body)).not.toContain('athenai')
    expect(JSON.stringify(body)).not.toContain('AthenAI')
    await app.close()
  })

  it('returns tenant A only with matching header', async () => {
    const app = await withApp()
    const res = await app.inject({
      method: 'GET',
      url: '/tenants/athenai_demo',
      headers: authHeaders('athenai_demo'),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ slug: 'athenai_demo' })
    await app.close()
  })
})
