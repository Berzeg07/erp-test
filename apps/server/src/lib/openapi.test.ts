import { describe, expect, it } from 'vitest'
import { buildServer } from '../app.js'
import { routeDocs } from './openapi.js'

const documented: Array<{ method: string; path: string; doc: keyof typeof routeDocs }> = [
  { method: 'get', path: '/health', doc: 'health' },
  { method: 'post', path: '/auth/login', doc: 'authLogin' },
  { method: 'post', path: '/auth/refresh', doc: 'authRefresh' },
  { method: 'post', path: '/auth/logout', doc: 'authLogout' },
  { method: 'get', path: '/auth/me', doc: 'authMe' },
  { method: 'get', path: '/tenants', doc: 'tenantsList' },
  { method: 'get', path: '/tenants/current', doc: 'tenantsCurrent' },
  { method: 'get', path: '/tenants/{slug}', doc: 'tenantsBySlug' },
  { method: 'get', path: '/tenants/{slug}/budget', doc: 'tenantsBudget' },
  { method: 'post', path: '/imports', doc: 'importsPost' },
  { method: 'get', path: '/mock-source/leads', doc: 'mockSourceGet' },
  { method: 'post', path: '/imports/from-mock-source', doc: 'importsFromMock' },
  { method: 'get', path: '/imports/raw', doc: 'importsRawList' },
  { method: 'post', path: '/cases/resolve', doc: 'casesResolve' },
  { method: 'get', path: '/cases', doc: 'casesList' },
  { method: 'get', path: '/cases/{id}', doc: 'casesById' },
  { method: 'post', path: '/suppression/from-fixtures', doc: 'suppressionFromFixtures' },
  { method: 'get', path: '/suppression', doc: 'suppressionList' },
  { method: 'post', path: '/cases/apply-policy', doc: 'casesApplyPolicy' },
  { method: 'post', path: '/cases/apply-rules', doc: 'casesApplyRules' },
  { method: 'post', path: '/cases/{id}/qualify', doc: 'casesQualify' },
  { method: 'post', path: '/cases/{id}/drafts', doc: 'casesCreateDraft' },
  { method: 'get', path: '/cases/{id}/drafts', doc: 'casesListDrafts' },
  { method: 'patch', path: '/drafts/{versionId}', doc: 'draftsPatch' },
  { method: 'post', path: '/drafts/{versionId}/approve', doc: 'draftsApprove' },
  { method: 'post', path: '/drafts/{versionId}/send', doc: 'draftsSend' },
  { method: 'get', path: '/outbox', doc: 'outboxList' },
  { method: 'post', path: '/replies/from-fixtures', doc: 'repliesFromFixtures' },
  { method: 'post', path: '/replies', doc: 'repliesPost' },
  { method: 'get', path: '/replies', doc: 'repliesList' },
  { method: 'get', path: '/tasks', doc: 'tasksList' },
  { method: 'post', path: '/events/payments', doc: 'eventsPaymentsPost' },
  { method: 'get', path: '/events/payments', doc: 'eventsPaymentsList' },
  { method: 'post', path: '/events/meetings', doc: 'eventsMeetingsPost' },
  { method: 'get', path: '/events/meetings', doc: 'eventsMeetingsList' },
  { method: 'post', path: '/crm/sync', doc: 'crmSync' },
  { method: 'get', path: '/crm/companies', doc: 'crmCompanies' },
  { method: 'get', path: '/crm/contacts', doc: 'crmContacts' },
  { method: 'get', path: '/crm/deals', doc: 'crmDeals' },
  { method: 'get', path: '/crm/tasks', doc: 'crmTasks' },
  { method: 'get', path: '/dlq', doc: 'dlqList' },
  { method: 'post', path: '/dlq/{id}/reprocess', doc: 'dlqReprocess' },
  { method: 'get', path: '/metrics', doc: 'metricsGet' },
  { method: 'post', path: '/kill-switch', doc: 'killSwitchPost' },
  { method: 'post', path: '/demo/reset', doc: 'demoReset' },
]

describe('OpenAPI operation docs', () => {
  it('exposes a description on every domain route in /docs/json', async () => {
    const app = await buildServer({ logger: false })
    const spec = await app.inject({ method: 'GET', url: '/docs/json' })
    expect(spec.statusCode).toBe(200)
    const body = spec.json() as {
      info?: { description?: string }
      components?: { schemas?: Record<string, { description?: string }> }
      paths?: Record<string, Record<string, { summary?: string; description?: string }>>
    }

    expect(body.info?.description).toContain('## Три разные оси на сырье')
    expect(body.info?.description).toContain('| `CONSENT` |')
    expect(body.info?.description).toContain('| Ira Sokolova / Nimbus Apps |')
    expect(body.info?.description).toContain('### `deliveryGuard`')
    expect(body.info?.description).toContain('| `QUALIFY` |')
    expect(body.info?.description).toContain('| `REJECT` |')
    expect(body.info?.description).toContain('| `MANUAL_REVIEW` |')
    expect(body.info?.description).toContain('## Mock-LLM')
    expect(body.info?.description).toContain('x-llm-fault')
    expect(body.info?.description).toContain('decision.llmOutput')
    expect(body.components?.schemas?.ProcessingBasis?.description).toContain('CONSENT')
    expect(body.components?.schemas?.OptOut?.description).toContain('optOut')
    expect(body.components?.schemas?.PromptInjection?.description).toContain('prompt_injection')
    expect(body.components?.schemas?.LlmOutput?.description).toContain('advice')
    expect(body.components?.schemas?.LlmFault?.description).toContain('x-llm-fault')
    expect(body.components?.schemas?.TenantBudget?.description).toContain('tokenSpent')
    expect(body.info?.description).toContain('## Draft')
    expect(body.components?.schemas?.DraftVersion?.description).toContain('versionId')
    expect(body.info?.description).toContain('## Outbox')
    expect(body.components?.schemas?.OutboxMessage?.description).toContain('MOCK_SENT')
    expect(body.info?.description).toContain('## Ответы')
    expect(body.components?.schemas?.InboundReply?.description).toContain('positive')
    expect(body.components?.schemas?.PaymentEvent?.description).toContain('events/payments')
    expect(body.info?.description).toContain('## Mock CRM')
    expect(body.components?.schemas?.CrmSnapshot?.description).toContain('dealId')
    expect(body.components?.schemas?.DlqItem?.description).toContain('x-crm-fault')
    expect(body.info?.description).toContain('## Метрики и рубильник')
    expect(body.components?.schemas?.Metrics?.description).toContain('synthetic=true')

    for (const item of documented) {
      const operation = body.paths?.[item.path]?.[item.method]
      expect(operation, `${item.method.toUpperCase()} ${item.path}`).toBeTruthy()
      expect(operation?.summary).toBe(routeDocs[item.doc].summary)
      expect(operation?.description).toBe(routeDocs[item.doc].description)
      expect(operation?.description?.length).toBeGreaterThan(40)
    }

    await app.close()
  })
})
