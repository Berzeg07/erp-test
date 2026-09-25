import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import bcrypt from 'bcryptjs'
import type {
  InboundReplyPublic,
  LeadCaseDetail,
  LeadCaseList,
  MeetingEventPublic,
  PaymentEventPublic,
  PaymentList,
  ReplyImportResult,
  ReplyList,
  TaskList,
} from '@app/shared'
import { buildServer } from '../../app.js'
import { prisma } from '../../lib/prisma.js'
import { TENANT_ISOLATION } from '../../lib/tenant.js'
import { wipeLeadGraph } from '../../lib/wipe-lead-graph.js'
import { loadFixtureLeads } from '../imports/import.fixtures.js'

const hasDb = Boolean(process.env.DATABASE_URL)

const REPLY_FIXTURE_IDS = [
  'a-reply-positive',
  'a-reply-negative',
  'a-reply-neutral',
  'a-reply-question',
  'a-reply-optout',
  'a-reply-ooo',
  'a-reply-uncertain',
]

describe.skipIf(!hasDb)('REPLY-1 mock replies, tasks and events', () => {
  const email = `reply-test-${Date.now()}@app.local`
  const password = 'testpass12'
  let token = ''
  const leads = loadFixtureLeads()

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(password, 10)
    await prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName: 'Reply Tester',
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

  it('rejects replies without JWT', async () => {
    const app = await withApp()
    const res = await app.inject({
      method: 'POST',
      url: '/replies',
      headers: { 'x-tenant-id': 'athenai_demo' },
      payload: { leadCaseId: '00000000-0000-4000-8000-000000000001', type: 'positive' },
    })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('returns 404 TENANT_ISOLATION without tenant header', async () => {
    const app = await withApp()
    const res = await app.inject({
      method: 'POST',
      url: '/replies',
      headers: authHeaders(),
      payload: { leadCaseId: '00000000-0000-4000-8000-000000000001', type: 'positive' },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ error: TENANT_ISOLATION })
    await app.close()
  })

  it('imports six TZ reply types from fixtures and opens tasks for question/opt_out/uncertain', async () => {
    const app = await withApp()
    await importResolve(app, 'athenai_demo', REPLY_FIXTURE_IDS)

    const imported = await app.inject({
      method: 'POST',
      url: '/replies/from-fixtures',
      headers: authHeaders('athenai_demo'),
    })
    expect(imported.statusCode).toBe(200)
    const body = imported.json() as ReplyImportResult
    expect(body.applied).toBeGreaterThanOrEqual(6)
    expect(body.tasks).toBe(3)

    const listed = await app.inject({
      method: 'GET',
      url: '/replies',
      headers: authHeaders('athenai_demo'),
    })
    const types = new Set((listed.json() as ReplyList).replies.map((row) => row.type))
    for (const type of ['positive', 'negative', 'question', 'opt_out', 'out_of_office', 'uncertain']) {
      expect(types.has(type)).toBe(true)
    }

    const tasks = await app.inject({
      method: 'GET',
      url: '/tasks',
      headers: authHeaders('athenai_demo'),
    })
    expect(tasks.statusCode).toBe(200)
    const taskTypes = new Set((tasks.json() as TaskList).tasks.map((row) => row.type))
    expect(taskTypes).toEqual(new Set(['question', 'opt_out', 'uncertain']))

    const neighbor = await app.inject({
      method: 'GET',
      url: '/replies',
      headers: authHeaders('proshelf_demo'),
    })
    expect((neighbor.json() as ReplyList).replies).toHaveLength(0)

    const again = await app.inject({
      method: 'POST',
      url: '/replies/from-fixtures',
      headers: authHeaders('athenai_demo'),
    })
    expect((again.json() as ReplyImportResult).applied).toBe(0)
    await app.close()
  })

  it('opens a manager task for question without blocking the case', async () => {
    const app = await withApp()
    const listed = await importResolve(app, 'athenai_demo', ['a-dup-ext-1'])
    const caseId = listed.cases[0]?.id
    expect(listed.cases[0]).toMatchObject({ status: 'QUALIFY', deliveryGuard: 'CLEAR' })

    const res = await app.inject({
      method: 'POST',
      url: '/replies',
      headers: authHeaders('athenai_demo'),
      payload: { leadCaseId: caseId, type: 'question' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as InboundReplyPublic
    expect(body.type).toBe('question')
    expect(body.taskId).toBeTruthy()
    expect(body.idempotent).toBe(false)

    const card = await app.inject({
      method: 'GET',
      url: `/cases/${caseId}`,
      headers: authHeaders('athenai_demo'),
    })
    expect((card.json() as LeadCaseDetail).deliveryGuard).toBe('CLEAR')
    await app.close()
  })

  it('turns opt_out into suppression + BLOCKED and a manager task', async () => {
    const app = await withApp()
    const listed = await importResolve(app, 'athenai_demo', ['a-dup-ext-1'])
    const caseId = listed.cases[0]?.id
    const personEmail = listed.cases[0]?.person.emailNormalized
    expect(personEmail).toBeTruthy()

    const res = await app.inject({
      method: 'POST',
      url: '/replies',
      headers: authHeaders('athenai_demo'),
      payload: { leadCaseId: caseId, type: 'opt_out' },
    })
    expect(res.statusCode).toBe(200)
    expect((res.json() as InboundReplyPublic).taskId).toBeTruthy()

    const card = await app.inject({
      method: 'GET',
      url: `/cases/${caseId}`,
      headers: authHeaders('athenai_demo'),
    })
    expect(card.json()).toMatchObject({
      status: 'MANUAL_REVIEW',
      deliveryGuard: 'BLOCKED',
      deliveryGuardReason: 'opt_out',
    })

    const suppression = await app.inject({
      method: 'GET',
      url: '/suppression',
      headers: authHeaders('athenai_demo'),
    })
    expect(suppression.json()).toEqual(
      expect.objectContaining({
        entries: expect.arrayContaining([expect.objectContaining({ emailNormalized: personEmail, reason: 'opt_out' })]),
      }),
    )
    await app.close()
  })

  it('does not create a payment or meeting from a positive reply', async () => {
    const app = await withApp()
    const listed = await importResolve(app, 'athenai_demo', ['a-reply-positive'])
    const caseId = listed.cases[0]?.id

    const reply = await app.inject({
      method: 'POST',
      url: '/replies',
      headers: authHeaders('athenai_demo'),
      payload: { leadCaseId: caseId, type: 'positive' },
    })
    expect(reply.statusCode).toBe(200)
    expect((reply.json() as InboundReplyPublic).taskId).toBeNull()

    const paymentsBefore = await app.inject({
      method: 'GET',
      url: '/events/payments',
      headers: authHeaders('athenai_demo'),
    })
    expect((paymentsBefore.json() as PaymentList).payments).toHaveLength(0)

    const meetingsBefore = await app.inject({
      method: 'GET',
      url: '/events/meetings',
      headers: authHeaders('athenai_demo'),
    })
    expect(meetingsBefore.json()).toMatchObject({ meetings: [] })

    const paid = await app.inject({
      method: 'POST',
      url: '/events/payments',
      headers: authHeaders('athenai_demo'),
      payload: { leadCaseId: caseId },
    })
    expect(paid.statusCode).toBe(200)
    const payment = paid.json() as PaymentEventPublic
    expect(payment.idempotent).toBe(false)

    const met = await app.inject({
      method: 'POST',
      url: '/events/meetings',
      headers: authHeaders('athenai_demo'),
      payload: { leadCaseId: caseId },
    })
    expect(met.statusCode).toBe(200)
    expect((met.json() as MeetingEventPublic).idempotent).toBe(false)

    const paidAgain = await app.inject({
      method: 'POST',
      url: '/events/payments',
      headers: authHeaders('athenai_demo'),
      payload: { leadCaseId: caseId },
    })
    expect((paidAgain.json() as PaymentEventPublic).paymentId).toBe(payment.paymentId)
    expect((paidAgain.json() as PaymentEventPublic).idempotent).toBe(true)

    const leaked = await app.inject({
      method: 'POST',
      url: '/events/payments',
      headers: authHeaders('proshelf_demo'),
      payload: { leadCaseId: caseId },
    })
    expect(leaked.statusCode).toBe(404)
    expect(leaked.json()).toEqual({ error: TENANT_ISOLATION })
    await app.close()
  })
})
