import { afterAll, describe, expect, it } from 'vitest'
import { buildServer } from '../../app.js'
import { prisma } from '../../lib/prisma.js'
import bcrypt from 'bcryptjs'

const hasDb = Boolean(process.env.DATABASE_URL)

describe.skipIf(!hasDb)('auth routes', () => {
  const email = `auth-test-${Date.now()}@app.local`
  const password = 'testpass12'

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } }).catch(() => undefined)
    await prisma.$disconnect()
  })

  it('logs in and returns /auth/me', async () => {
    const passwordHash = await bcrypt.hash(password, 10)
    await prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName: 'Test',
        role: 'admin',
      },
    })

    const app = await buildServer({ logger: false })

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password },
    })
    expect(login.statusCode).toBe(200)
    const session = login.json() as { token: string }
    expect(session.token).toBeTruthy()

    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${session.token}` },
    })
    expect(me.statusCode).toBe(200)
    expect(me.json()).toMatchObject({ email, role: 'admin' })

    const bad = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password: 'wrongpass1' },
    })
    expect(bad.statusCode).toBe(401)

    await app.close()
  })
})
