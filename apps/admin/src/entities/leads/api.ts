import type {
  CrmSnapshot,
  DedupResolveResult,
  DlqList,
  DraftList,
  DraftVersionPublic,
  ImportResult,
  InboundReplyPublic,
  LeadCaseDetail,
  LeadCaseList,
  ManagerTaskPublic,
  Metrics,
  OutboxSendResult,
  PaymentEventPublic,
  PlannedReply,
  TenantBudget,
} from '@app/shared'
import { CRM_FAULT_HEADER, FixtureBundleSchema } from '@app/shared'
import fixtureBundle from '../../../../../fixtures/leads.json'
import { ApiError, apiFetch } from '@/shared/api/http'
import { readTenantSlug } from '@/shared/config/tenant'

const fixtureLeads = FixtureBundleSchema.parse(fixtureBundle).leads

export function fetchMetrics(): Promise<Metrics> {
  return apiFetch<Metrics>('/metrics')
}

export function setKillSwitch(on: boolean, reason?: string): Promise<TenantBudget> {
  return apiFetch<TenantBudget>('/kill-switch', {
    method: 'POST',
    body: JSON.stringify(reason ? { on, reason } : { on }),
  })
}

export function resetDemo(): Promise<Metrics> {
  return apiFetch<Metrics>('/demo/reset', { method: 'POST' })
}

export function importCsvText(csv: string): Promise<ImportResult> {
  return apiFetch<ImportResult>('/imports', {
    method: 'POST',
    body: JSON.stringify({ csv }),
  })
}

export function resolveCases(): Promise<DedupResolveResult> {
  return apiFetch<DedupResolveResult>('/cases/resolve', { method: 'POST' })
}

export async function importFixturePipeline(): Promise<{
  imported: ImportResult
  resolved: DedupResolveResult
}> {
  const leads = fixtureLeads.filter((row) => row.tenantSlug === readTenantSlug())
  const imported = await apiFetch<ImportResult>('/imports', {
    method: 'POST',
    body: JSON.stringify({ leads }),
  })
  const resolved = await resolveCases()
  return { imported, resolved }
}

export async function importCsvPipeline(csv: string): Promise<{
  imported: ImportResult
  resolved: DedupResolveResult
}> {
  const imported = await importCsvText(csv)
  const resolved = await resolveCases()
  return { imported, resolved }
}

export function listCases(): Promise<LeadCaseList> {
  return apiFetch<LeadCaseList>('/cases')
}

export function getCase(id: string): Promise<LeadCaseDetail> {
  return apiFetch<LeadCaseDetail>(`/cases/${id}`)
}

export function qualifyCase(id: string): Promise<LeadCaseDetail> {
  return apiFetch<LeadCaseDetail>(`/cases/${id}/qualify`, { method: 'POST' })
}

export function createDraft(leadCaseId: string): Promise<DraftVersionPublic> {
  return apiFetch<DraftVersionPublic>(`/cases/${leadCaseId}/drafts`, { method: 'POST' })
}

export function listDrafts(leadCaseId: string): Promise<DraftList> {
  return apiFetch<DraftList>(`/cases/${leadCaseId}/drafts`)
}

export function patchDraft(versionId: string, text: string): Promise<DraftVersionPublic> {
  return apiFetch<DraftVersionPublic>(`/drafts/${versionId}`, {
    method: 'PATCH',
    body: JSON.stringify({ text }),
  })
}

export function approveDraft(versionId: string): Promise<DraftVersionPublic> {
  return apiFetch<DraftVersionPublic>(`/drafts/${versionId}/approve`, { method: 'POST' })
}

export function sendDraft(versionId: string): Promise<OutboxSendResult> {
  return apiFetch<OutboxSendResult>(`/drafts/${versionId}/send`, { method: 'POST' })
}

export function postReply(leadCaseId: string, type: PlannedReply): Promise<InboundReplyPublic> {
  return apiFetch<InboundReplyPublic>('/replies', {
    method: 'POST',
    body: JSON.stringify({ leadCaseId, type }),
  })
}

export function listTasks(): Promise<{ tasks: ManagerTaskPublic[] }> {
  return apiFetch('/tasks')
}

export function listPayments(): Promise<{ payments: PaymentEventPublic[] }> {
  return apiFetch('/events/payments')
}

export function crmSyncUrl(fault?: '429' | '500'): string {
  return fault ? `/crm/sync?fault=${fault}` : '/crm/sync'
}

export function isSimulatedCrmFault(error: unknown): error is ApiError {
  return error instanceof ApiError && (error.code === 'CRM_5XX' || error.code === 'CRM_429')
}

export function syncCrm(leadCaseId: string): Promise<CrmSnapshot> {
  return apiFetch<CrmSnapshot>(crmSyncUrl(), {
    method: 'POST',
    body: JSON.stringify({ leadCaseId }),
  })
}

export function syncCrmFault(leadCaseId: string, fault: '429' | '500'): Promise<CrmSnapshot> {
  return apiFetch<CrmSnapshot>(crmSyncUrl(fault), {
    method: 'POST',
    headers: { [CRM_FAULT_HEADER]: fault },
    body: JSON.stringify({ leadCaseId }),
  })
}

export function listDlq(): Promise<DlqList> {
  return apiFetch<DlqList>('/dlq')
}

export function reprocessDlq(id: string): Promise<CrmSnapshot> {
  return apiFetch<CrmSnapshot>(`/dlq/${id}/reprocess`, { method: 'POST' })
}
