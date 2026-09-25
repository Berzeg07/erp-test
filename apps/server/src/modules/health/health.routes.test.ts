import { describe, expect, it } from 'vitest'
import { buildServer } from '../../app.js'

describe('health routes', () => {
  it('returns ok', async () => {
    const app = await buildServer({ logger: false })
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true, service: 'app-server' })
    await app.close()
  })

  it('serves OpenAPI at /docs', async () => {
    const app = await buildServer({ logger: false })
    const ui = await app.inject({ method: 'GET', url: '/docs' })
    expect(ui.statusCode).toBe(200)
    const spec = await app.inject({ method: 'GET', url: '/docs/json' })
    expect(spec.statusCode).toBe(200)
    const body = spec.json() as { info?: { title?: string } }
    expect(body.info?.title).toContain('Lead Engine')
    await app.close()
  })
})
