import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import bcrypt from 'bcryptjs'
import {
  CRM_MAX_ATTEMPTS,
  LLM_TOKENS_PER_CALL,
  type CrmCompanyList,
  type CrmSnapshot,
  type DlqList,
  type DraftVersionPublic,
  type ImportResult,
  type LeadCaseDetail,
  type LeadCaseList,
  type OutboxSendResult,
  type PaymentList,
  type RawLeadList,
} from '@app/shared'
import { buildServer } from '../../app.js'
import { prisma } from '../../lib/prisma.js'
import { TENANT_ISOLATION } from '../../lib/tenant.js'
import { wipeLeadGraph } from '../../lib/wipe-lead-graph.js'
import { loadFixtureLeads } from '../imports/import.fixtures.js'

const hasDb = Boolean(process.env.DATABASE_URL)

describe.skipIf(!hasDb)('TEST-1 HR matrix (TZ 18 + optional)', () => {
  const email = `matrix-test-${Date.now()}@app.local`
  const password = 'testpass12'
  let token = ''
  const leads = loadFixtureLeads()

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(password, 10)
    await prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName: 'Matrix Tester',
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

  async function importResolve(
    app: Awaited<ReturnType<typeof withApp>>,
    tenant: string,
    ids: string[],
    extra?: Record<string, string>,
  ) {
    const imported = await app.inject({
      method: 'POST',
      url: '/imports',
      headers: authHeaders(tenant, extra),
      payload: { leads: leads.filter((row) => ids.includes(row.id)) },
    })
    expect(imported.statusCode).toBe(200)
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

  async function draftAndApprove(app: Awaited<ReturnType<typeof withApp>>, caseId: string) {
    const created = await app.inject({
      method: 'POST',
      url: `/cases/${caseId}/drafts`,
      headers: authHeaders('athenai_demo'),
    })
    expect(created.statusCode).toBe(200)
    const version = created.json() as DraftVersionPublic
    const approved = await app.inject({
      method: 'POST',
      url: `/drafts/${version.versionId}/approve`,
      headers: authHeaders('athenai_demo'),
    })
    expect(approved.statusCode).toBe(200)
    return version
  }

  it('1. повторный импорт', async () => {
    const app = await withApp()
    const payload = { leads: leads.filter((row) => row.id === 'a-dup-ext-1') }
    const first = await app.inject({
      method: 'POST',
      url: '/imports',
      headers: authHeaders('athenai_demo'),
      payload,
    })
    expect((first.json() as ImportResult).created).toBe(1)
    const second = await app.inject({
      method: 'POST',
      url: '/imports',
      headers: authHeaders('athenai_demo'),
      payload,
    })
    expect((second.json() as ImportResult)).toMatchObject({ created: 0, updated: 1, accepted: 1 })
    const raw = await app.inject({
      method: 'GET',
      url: '/imports/raw',
      headers: authHeaders('athenai_demo'),
    })
    expect((raw.json() as RawLeadList).records).toHaveLength(1)
    await app.close()
  })

  it('2. разные типы дублей', async () => {
    const app = await withApp()
    const byExt = await importResolve(app, 'athenai_demo', ['a-dup-ext-1', 'a-dup-ext-1b'])
    expect(byExt.cases).toHaveLength(1)
    expect(byExt.cases[0]?.mergeBy).toBe('external_id')
    expect(byExt.cases[0]?.rawCount).toBe(2)

    await wipeLeadGraph()
    const byDomain = await importResolve(app, 'athenai_demo', ['a-dup-domain-1', 'a-dup-domain-2'])
    expect(byDomain.cases).toHaveLength(1)
    expect(byDomain.cases[0]?.mergeBy).toBe('domain')

    await wipeLeadGraph()
    const byName = await importResolve(app, 'athenai_demo', ['a-dup-name-1', 'a-dup-name-2'])
    expect(byName.cases.length).toBeGreaterThanOrEqual(2)
    expect(byName.cases.every((row) => row.mergeBy !== 'company_name')).toBe(true)
    await app.close()
  })

  it('3. конфликт источников', async () => {
    const app = await withApp()
    const listed = await importResolve(app, 'athenai_demo', ['a-conflict-src-1', 'a-conflict-src-2'])
    expect(listed.cases).toHaveLength(2)
    expect(listed.cases.every((row) => row.status === 'MANUAL_REVIEW')).toBe(true)
    expect(listed.cases.every((row) => row.deliveryGuard === 'BLOCKED')).toBe(true)
    expect(listed.cases.every((row) => row.conflicts.includes('company_multiple_contacts'))).toBe(true)
    await app.close()
  })

  it('4. неполная запись', async () => {
    const app = await withApp()
    const listed = await importResolve(app, 'athenai_demo', ['a-incomplete-empty'])
    expect(listed.cases[0]?.status).toBe('MANUAL_REVIEW')
    expect(listed.cases[0]?.status).not.toBe('QUALIFY')
    await app.close()
  })

  it('5. opt-out', async () => {
    const app = await withApp()
    const listed = await importResolve(app, 'athenai_demo', ['a-optout-1'])
    expect(listed.cases[0]).toMatchObject({
      status: 'MANUAL_REVIEW',
      deliveryGuard: 'BLOCKED',
      deliveryGuardReason: 'opt_out',
    })
    await app.close()
  })

  it('6. prompt injection', async () => {
    const app = await withApp()
    const listed = await importResolve(app, 'athenai_demo', ['a-inject-1'])
    expect(listed.cases[0]).toMatchObject({
      status: 'MANUAL_REVIEW',
      deliveryGuard: 'BLOCKED',
      deliveryGuardReason: 'prompt_injection',
    })
    const drafted = await app.inject({
      method: 'POST',
      url: `/cases/${listed.cases[0]?.id}/drafts`,
      headers: authHeaders('athenai_demo'),
    })
    expect(drafted.statusCode).toBe(409)
    expect(drafted.json()).toEqual({ error: 'DELIVERY_BLOCKED' })
    await app.close()
  })

  it('7. невалидный LLM-output', async () => {
    const app = await withApp()
    const listed = await importResolve(app, 'athenai_demo', ['a-dup-ext-1'], { 'x-llm-fault': 'invalid_json' })
    expect(listed.cases[0]?.status).toBe('MANUAL_REVIEW')
    const detail = await app.inject({
      method: 'GET',
      url: `/cases/${listed.cases[0]?.id}`,
      headers: authHeaders('athenai_demo'),
    })
    const body = detail.json() as LeadCaseDetail
    expect(body.decision?.llmOutput).toMatchObject({ kind: 'error', error: 'invalid_json' })
    expect(body.processingBasis).toBe('CONSENT')
    await app.close()
  })

  it('8. нет approval', async () => {
    const app = await withApp()
    const listed = await importResolve(app, 'athenai_demo', ['a-dup-ext-1'])
    const created = await app.inject({
      method: 'POST',
      url: `/cases/${listed.cases[0]?.id}/drafts`,
      headers: authHeaders('athenai_demo'),
    })
    const versionId = (created.json() as DraftVersionPublic).versionId
    const sent = await app.inject({
      method: 'POST',
      url: `/drafts/${versionId}/send`,
      headers: authHeaders('athenai_demo'),
    })
    expect(sent.statusCode).toBe(409)
    expect(sent.json()).toEqual({ error: 'APPROVAL_REQUIRED' })
    await app.close()
  })

  it('9. изменение draft после approval', async () => {
    const app = await withApp()
    const listed = await importResolve(app, 'athenai_demo', ['a-dup-ext-1'])
    const v1 = await draftAndApprove(app, listed.cases[0]!.id)
    const patched = await app.inject({
      method: 'PATCH',
      url: `/drafts/${v1.versionId}`,
      headers: authHeaders('athenai_demo'),
      payload: { text: 'Edited after approval' },
    })
    const v2 = patched.json() as DraftVersionPublic
    expect(v2.versionId).not.toBe(v1.versionId)
    expect(v2.approved).toBe(false)
    const stale = await app.inject({
      method: 'POST',
      url: `/drafts/${v1.versionId}/send`,
      headers: authHeaders('athenai_demo'),
    })
    expect(stale.statusCode).toBe(409)
    expect(stale.json()).toEqual({ error: 'APPROVAL_STALE' })
    await app.close()
  })

  it('10. повторный mock-send', async () => {
    const app = await withApp()
    const listed = await importResolve(app, 'athenai_demo', ['a-dup-ext-1'])
    const v1 = await draftAndApprove(app, listed.cases[0]!.id)
    const first = await app.inject({
      method: 'POST',
      url: `/drafts/${v1.versionId}/send`,
      headers: authHeaders('athenai_demo'),
    })
    const second = await app.inject({
      method: 'POST',
      url: `/drafts/${v1.versionId}/send`,
      headers: authHeaders('athenai_demo'),
    })
    const a = first.json() as OutboxSendResult
    const b = second.json() as OutboxSendResult
    expect(a.status).toBe('MOCK_SENT')
    expect(b.outboxId).toBe(a.outboxId)
    expect(b.idempotent).toBe(true)
    await app.close()
  })

  it('11. CRM 429', async () => {
    const app = await withApp()
    const listed = await importResolve(app, 'athenai_demo', ['a-dup-ext-1'])
    const failed = await app.inject({
      method: 'POST',
      url: '/crm/sync',
      headers: authHeaders('athenai_demo', { 'x-crm-fault': '429' }),
      payload: { leadCaseId: listed.cases[0]?.id },
    })
    expect(failed.statusCode).toBe(429)
    expect(failed.json()).toEqual({ error: 'CRM_429' })
    const companies = await app.inject({
      method: 'GET',
      url: '/crm/companies',
      headers: authHeaders('athenai_demo'),
    })
    expect((companies.json() as CrmCompanyList).companies).toHaveLength(0)
    const dlq = await app.inject({
      method: 'GET',
      url: '/dlq',
      headers: authHeaders('athenai_demo'),
    })
    expect((dlq.json() as DlqList).items[0]).toMatchObject({
      fault: '429',
      attempts: CRM_MAX_ATTEMPTS,
    })
    await app.close()
  })

  it('12. CRM 5xx', async () => {
    const app = await withApp()
    const listed = await importResolve(app, 'athenai_demo', ['a-dup-ext-1'])
    const failed = await app.inject({
      method: 'POST',
      url: '/crm/sync',
      headers: authHeaders('athenai_demo', { 'x-crm-fault': '500' }),
      payload: { leadCaseId: listed.cases[0]?.id },
    })
    expect(failed.statusCode).toBe(502)
    expect(failed.json()).toEqual({ error: 'CRM_5XX' })
    await app.close()
  })

  it('13. DLQ / reprocess', async () => {
    const app = await withApp()
    const listed = await importResolve(app, 'athenai_demo', ['a-dup-ext-1'])
    const caseId = listed.cases[0]!.id
    await app.inject({
      method: 'POST',
      url: '/crm/sync',
      headers: authHeaders('athenai_demo', { 'x-crm-fault': '500' }),
      payload: { leadCaseId: caseId },
    })
    const queued = await app.inject({
      method: 'GET',
      url: '/dlq',
      headers: authHeaders('athenai_demo'),
    })
    const dlqId = (queued.json() as DlqList).items[0]?.id
    const first = await app.inject({
      method: 'POST',
      url: `/dlq/${dlqId}/reprocess`,
      headers: authHeaders('athenai_demo'),
    })
    const snapshot = first.json() as CrmSnapshot
    const second = await app.inject({
      method: 'POST',
      url: `/dlq/${dlqId}/reprocess`,
      headers: authHeaders('athenai_demo'),
    })
    expect((second.json() as CrmSnapshot).dealId).toBe(snapshot.dealId)
    const empty = await app.inject({
      method: 'GET',
      url: '/dlq',
      headers: authHeaders('athenai_demo'),
    })
    expect((empty.json() as DlqList).items.filter((row) => !row.resolvedAt)).toHaveLength(0)
    await app.close()
  })

  it('14. tenant isolation', async () => {
    const app = await withApp()
    await importResolve(app, 'athenai_demo', ['a-iso-ivan'])
    await importResolve(app, 'proshelf_demo', ['p-iso-ivan'])
    const leaked = await app.inject({
      method: 'GET',
      url: '/cases',
      headers: authHeaders('proshelf_demo'),
    })
    const neighbor = leaked.json() as LeadCaseList
    expect(neighbor.tenant).toBe('proshelf_demo')
    expect(JSON.stringify(neighbor)).not.toContain('athenai_demo')
    expect(neighbor.cases).toHaveLength(1)

    const missing = await app.inject({
      method: 'GET',
      url: '/cases',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(missing.statusCode).toBe(404)
    expect(missing.json()).toEqual({ error: TENANT_ISOLATION })
    await app.close()
  })

  it('15. suppression list', async () => {
    const app = await withApp()
    const loaded = await app.inject({
      method: 'POST',
      url: '/suppression/from-fixtures',
      headers: authHeaders('athenai_demo'),
    })
    expect(loaded.statusCode).toBe(200)
    const listed = await importResolve(app, 'athenai_demo', ['a-suppress-1'])
    expect(listed.cases[0]).toMatchObject({
      deliveryGuard: 'BLOCKED',
      deliveryGuardReason: 'suppression',
    })
    const other = await importResolve(app, 'proshelf_demo', ['p-iso-ivan'])
    expect(other.cases[0]?.deliveryGuard).toBe('CLEAR')
    await app.close()
  })

  it('16. payment только отдельным событием', async () => {
    const app = await withApp()
    const listed = await importResolve(app, 'athenai_demo', ['a-reply-positive'])
    await app.inject({
      method: 'POST',
      url: '/replies',
      headers: authHeaders('athenai_demo'),
      payload: { leadCaseId: listed.cases[0]?.id, type: 'positive' },
    })
    const before = await app.inject({
      method: 'GET',
      url: '/events/payments',
      headers: authHeaders('athenai_demo'),
    })
    expect((before.json() as PaymentList).payments).toHaveLength(0)
    const paid = await app.inject({
      method: 'POST',
      url: '/events/payments',
      headers: authHeaders('athenai_demo'),
      payload: { leadCaseId: listed.cases[0]?.id },
    })
    expect(paid.statusCode).toBe(200)
    const after = await app.inject({
      method: 'GET',
      url: '/events/payments',
      headers: authHeaders('athenai_demo'),
    })
    expect((after.json() as PaymentList).payments).toHaveLength(1)
    await app.close()
  })

  it('17. budget kill-switch', async () => {
    await prisma.tenant.update({
      where: { slug: 'athenai_demo' },
      data: { llmTokenBudget: LLM_TOKENS_PER_CALL },
    })
    const app = await withApp()
    const listed = await importResolve(app, 'athenai_demo', ['a-dup-ext-1'])
    const version = await draftAndApprove(app, listed.cases[0]!.id)
    const sent = await app.inject({
      method: 'POST',
      url: `/drafts/${version.versionId}/send`,
      headers: authHeaders('athenai_demo'),
    })
    expect(sent.statusCode).toBe(409)
    expect(sent.json()).toEqual({ error: 'BUDGET_EXCEEDED' })
    const neighbor = await app.inject({
      method: 'GET',
      url: '/metrics',
      headers: authHeaders('proshelf_demo'),
    })
    expect(neighbor.json()).toMatchObject({ killSwitchOn: false })
    const imported = await app.inject({
      method: 'POST',
      url: '/imports',
      headers: authHeaders('athenai_demo'),
      payload: { leads: leads.filter((row) => row.id === 'a-fill-1') },
    })
    expect(imported.statusCode).toBe(200)
    await app.close()
  })

  it('18. processing_basis UNKNOWN → review+blocked', async () => {
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

  it('optional: два домена без evidence не склеиваются', async () => {
    const app = await withApp()
    const listed = await importResolve(app, 'athenai_demo', ['a-two-domains-1', 'a-two-domains-2'])
    expect(listed.cases.length).toBeGreaterThanOrEqual(2)
    await app.close()
  })

  it('optional: email в двух компаниях → два кейса', async () => {
    const app = await withApp()
    const listed = await importResolve(app, 'athenai_demo', ['a-two-co-1', 'a-two-co-2'])
    expect(listed.cases).toHaveLength(2)
    expect(listed.cases.every((row) => row.conflicts.includes('person_multiple_companies'))).toBe(true)
    await app.close()
  })

  it('optional: LLM не ставит CONSENT', async () => {
    const app = await withApp()
    const listed = await importResolve(app, 'athenai_demo', ['a-basis-li'], { 'x-llm-fault': 'injection' })
    const detail = await app.inject({
      method: 'GET',
      url: `/cases/${listed.cases[0]?.id}`,
      headers: authHeaders('athenai_demo'),
    })
    const body = detail.json() as LeadCaseDetail
    expect(body.processingBasis).toBe('DOCUMENTED_LEGITIMATE_INTEREST')
    expect(body.processingBasis).not.toBe('CONSENT')
    expect(body.decision?.llmOutput).toMatchObject({ kind: 'error', error: 'injection' })
    await app.close()
  })
})
