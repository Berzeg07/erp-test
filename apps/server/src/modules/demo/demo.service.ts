import { DEFAULT_LLM_TOKEN_BUDGET, MetricsSchema, type Metrics } from '@app/shared'
import type { RequestTenant } from '../../lib/tenant.js'
import { prisma } from '../../lib/prisma.js'
import { getMetrics } from '../metrics/metrics.service.js'

export async function resetTenantDemo(tenant: RequestTenant): Promise<Metrics> {
  const tenantId = tenant.id

  await prisma.dlqItem.deleteMany({ where: { tenantId } })
  await prisma.crmOutbox.deleteMany({ where: { tenantId } })
  await prisma.crmTask.deleteMany({ where: { tenantId } })
  await prisma.crmDeal.deleteMany({ where: { tenantId } })
  await prisma.crmContact.deleteMany({ where: { tenantId } })
  await prisma.crmCompany.deleteMany({ where: { tenantId } })
  await prisma.paymentEvent.deleteMany({ where: { tenantId } })
  await prisma.meetingEvent.deleteMany({ where: { tenantId } })
  await prisma.managerTask.deleteMany({ where: { tenantId } })
  await prisma.inboundReply.deleteMany({ where: { tenantId } })
  await prisma.outboxMessage.deleteMany({ where: { tenantId } })
  await prisma.approval.deleteMany({ where: { tenantId } })
  await prisma.draftVersion.deleteMany({ where: { tenantId } })
  await prisma.draft.deleteMany({ where: { tenantId } })
  await prisma.decisionRecord.deleteMany({ where: { tenantId } })
  await prisma.leadCase.deleteMany({ where: { tenantId } })
  await prisma.companyContact.deleteMany({ where: { tenantId } })
  await prisma.companyDomain.deleteMany({ where: { tenantId } })
  await prisma.companyExternalId.deleteMany({ where: { tenantId } })
  await prisma.company.deleteMany({ where: { tenantId } })
  await prisma.person.deleteMany({ where: { tenantId } })
  await prisma.rawLeadRecord.deleteMany({ where: { tenantId } })

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      llmTokenBudget: DEFAULT_LLM_TOKEN_BUDGET,
      llmTokenSpent: 0,
      killSwitchOn: false,
      killSwitchReason: null,
    },
  })

  return MetricsSchema.parse(await getMetrics(tenant))
}
