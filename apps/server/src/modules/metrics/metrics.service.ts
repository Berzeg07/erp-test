import {
  MetricsSchema,
  SYNTHETIC_COST_PER_HUMAN_MINUTE,
  TenantBudgetSchema,
  TenantSlugSchema,
  humanMinutesFromCounts,
  ratio,
  type Metrics,
  type TenantBudget,
} from '@app/shared'
import type { RequestTenant } from '../../lib/tenant.js'
import { prisma } from '../../lib/prisma.js'
import { getTenantBudget } from '../llm/llm.service.js'

export async function getMetrics(tenant: RequestTenant): Promise<Metrics> {
  const [
    imported,
    uniqueLeads,
    qualified,
    manualReview,
    blocked,
    drafts,
    approvals,
    mockSent,
    replies,
    meetings,
    payments,
    tenantRow,
  ] = await Promise.all([
    prisma.rawLeadRecord.count({ where: { tenantId: tenant.id } }),
    prisma.leadCase.count({ where: { tenantId: tenant.id } }),
    prisma.leadCase.count({ where: { tenantId: tenant.id, status: 'QUALIFY' } }),
    prisma.leadCase.count({ where: { tenantId: tenant.id, status: 'MANUAL_REVIEW' } }),
    prisma.leadCase.count({ where: { tenantId: tenant.id, deliveryGuard: 'BLOCKED' } }),
    prisma.draft.count({ where: { tenantId: tenant.id } }),
    prisma.approval.count({ where: { tenantId: tenant.id } }),
    prisma.outboxMessage.count({ where: { tenantId: tenant.id, status: 'MOCK_SENT' } }),
    prisma.inboundReply.count({ where: { tenantId: tenant.id } }),
    prisma.meetingEvent.count({ where: { tenantId: tenant.id } }),
    prisma.paymentEvent.count({ where: { tenantId: tenant.id } }),
    prisma.tenant.findUniqueOrThrow({
      where: { id: tenant.id },
      select: { killSwitchOn: true, killSwitchReason: true },
    }),
  ])

  const humanMinutes = humanMinutesFromCounts(approvals, manualReview)
  const expenses = humanMinutes * SYNTHETIC_COST_PER_HUMAN_MINUTE

  return MetricsSchema.parse({
    synthetic: true,
    tenant: TenantSlugSchema.parse(tenant.slug),
    imported,
    uniqueLeads,
    qualified,
    manualReview,
    blocked,
    drafts,
    approvals,
    mockSent,
    replies,
    meetings,
    payments,
    expenses,
    humanMinutes,
    costPerLead: ratio(expenses, uniqueLeads),
    costPerMeeting: ratio(expenses, meetings),
    cac: ratio(expenses, payments),
    killSwitchOn: tenantRow.killSwitchOn,
    killSwitchReason: tenantRow.killSwitchReason,
  })
}

export async function setKillSwitch(tenant: RequestTenant, on: boolean, reason?: string): Promise<TenantBudget> {
  const row = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenant.id },
    select: { llmTokenBudget: true, llmTokenSpent: true, killSwitchOn: true, killSwitchReason: true },
  })

  if (!on && row.llmTokenSpent >= row.llmTokenBudget) {
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { killSwitchOn: true, killSwitchReason: 'budget_exceeded' },
    })
    return TenantBudgetSchema.parse(await getTenantBudget(tenant))
  }

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: on
      ? { killSwitchOn: true, killSwitchReason: reason ?? 'manual' }
      : { killSwitchOn: false, killSwitchReason: null },
  })
  return TenantBudgetSchema.parse(await getTenantBudget(tenant))
}
