import { Prisma } from '@prisma/client'
import {
  CRM_MAX_ATTEMPTS,
  CRM_TASK_TYPE,
  CrmCompanyListSchema,
  CrmContactListSchema,
  CrmDealListSchema,
  CrmFaultSchema,
  CrmSnapshotSchema,
  CrmTaskListSchema,
  DlqListSchema,
  TenantSlugSchema,
  type CrmCompanyList,
  type CrmContactList,
  type CrmDealList,
  type CrmFault,
  type CrmSnapshot,
  type CrmTaskList,
  type DlqList,
} from '@app/shared'
import type { FastifyRequest } from 'fastify'
import type { RequestTenant } from '../../lib/tenant.js'
import { prisma } from '../../lib/prisma.js'

export const CRM_FAULT_HEADER = 'x-crm-fault'

export class CrmError extends Error {
  constructor(
    readonly code: 'CRM_429' | 'CRM_5XX',
    readonly statusCode: number,
  ) {
    super(code)
    this.name = 'CrmError'
  }
}

export function readCrmFault(request: FastifyRequest): CrmFault | null {
  const header = request.headers[CRM_FAULT_HEADER]
  const fromHeader = Array.isArray(header) ? header[0] : header
  const query = request.query as Record<string, unknown>
  const fromQuery = typeof query[CRM_FAULT_HEADER] === 'string' ? query[CRM_FAULT_HEADER] : typeof query.fault === 'string' ? query.fault : undefined
  const parsed = CrmFaultSchema.safeParse(fromHeader ?? fromQuery)
  return parsed.success ? parsed.data : null
}

function snapshotFrom(
  tenantSlug: string,
  leadCaseId: string,
  ids: { companyId: string; contactId: string; dealId: string; taskId: string },
  idempotent: boolean,
): CrmSnapshot {
  return CrmSnapshotSchema.parse({
    synthetic: true,
    tenant: TenantSlugSchema.parse(tenantSlug),
    leadCaseId,
    ...ids,
    idempotent,
  })
}

async function ensureOutbox(tenantId: string, leadCaseId: string) {
  const existing = await prisma.crmOutbox.findUnique({ where: { leadCaseId } })
  if (existing && existing.tenantId === tenantId) return existing
  try {
    return await prisma.crmOutbox.create({
      data: { tenantId, leadCaseId, status: 'pending', attempts: 0 },
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return prisma.crmOutbox.findUniqueOrThrow({ where: { leadCaseId } })
    }
    throw error
  }
}

async function parkInDlq(outboxId: string, tenantId: string, leadCaseId: string, fault: CrmFault) {
  await prisma.crmOutbox.update({
    where: { id: outboxId },
    data: { status: 'dlq', attempts: CRM_MAX_ATTEMPTS, lastFault: fault },
  })
  const open = await prisma.dlqItem.findFirst({
    where: { outboxId, resolvedAt: null },
  })
  if (open) {
    await prisma.dlqItem.update({
      where: { id: open.id },
      data: { fault, attempts: CRM_MAX_ATTEMPTS },
    })
    return
  }
  await prisma.dlqItem.create({
    data: {
      tenantId,
      outboxId,
      leadCaseId,
      fault,
      attempts: CRM_MAX_ATTEMPTS,
    },
  })
}

async function upsertEntities(tenantId: string, leadCaseId: string, domain: string, companyName: string, email: string, displayName: string | null) {
  const company = await prisma.crmCompany.upsert({
    where: { tenantId_domain: { tenantId, domain } },
    create: { tenantId, domain, name: companyName },
    update: { name: companyName },
  })
  const contact = await prisma.crmContact.upsert({
    where: { tenantId_emailNormalized: { tenantId, emailNormalized: email } },
    create: { tenantId, emailNormalized: email, displayName, companyId: company.id },
    update: { displayName, companyId: company.id },
  })
  const deal = await prisma.crmDeal.upsert({
    where: { tenantId_leadCaseId: { tenantId, leadCaseId } },
    create: { tenantId, leadCaseId, companyId: company.id, contactId: contact.id },
    update: { companyId: company.id, contactId: contact.id },
  })
  const task = await prisma.crmTask.upsert({
    where: { tenantId_type_leadCaseId: { tenantId, type: CRM_TASK_TYPE, leadCaseId } },
    create: { tenantId, leadCaseId, type: CRM_TASK_TYPE },
    update: {},
  })
  return { companyId: company.id, contactId: contact.id, dealId: deal.id, taskId: task.id }
}

async function deliver(tenant: RequestTenant, leadCaseId: string, fault: CrmFault | null): Promise<CrmSnapshot | null> {
  const leadCase = await prisma.leadCase.findFirst({
    where: { id: leadCaseId, tenantId: tenant.id },
    include: {
      person: true,
      company: { include: { domains: { take: 1, orderBy: { domain: 'asc' } } } },
    },
  })
  if (!leadCase) return null

  const outbox = await ensureOutbox(tenant.id, leadCaseId)
  if (outbox.companyId && outbox.contactId && outbox.dealId && outbox.taskId && outbox.status === 'delivered') {
    return snapshotFrom(tenant.slug, leadCaseId, {
      companyId: outbox.companyId,
      contactId: outbox.contactId,
      dealId: outbox.dealId,
      taskId: outbox.taskId,
    }, true)
  }

  if (fault) {
    await parkInDlq(outbox.id, tenant.id, leadCaseId, fault)
    throw new CrmError(fault === '429' ? 'CRM_429' : 'CRM_5XX', fault === '429' ? 429 : 502)
  }

  const domain = leadCase.company.domains[0]?.domain ?? `company:${leadCase.companyId}`
  const email = leadCase.person.emailNormalized ?? `person:${leadCase.personId}`
  const ids = await upsertEntities(tenant.id, leadCaseId, domain, leadCase.company.name, email, leadCase.person.displayName)

  await prisma.crmOutbox.update({
    where: { id: outbox.id },
    data: {
      status: 'delivered',
      attempts: outbox.attempts + 1,
      lastFault: null,
      ...ids,
    },
  })
  await prisma.dlqItem.updateMany({
    where: { outboxId: outbox.id, resolvedAt: null },
    data: { resolvedAt: new Date() },
  })

  return snapshotFrom(tenant.slug, leadCaseId, ids, false)
}

export async function syncLeadCase(tenant: RequestTenant, leadCaseId: string, fault: CrmFault | null) {
  return deliver(tenant, leadCaseId, fault)
}

export async function reprocessDlq(tenant: RequestTenant, dlqId: string, fault: CrmFault | null): Promise<CrmSnapshot | null> {
  const item = await prisma.dlqItem.findFirst({
    where: { id: dlqId, tenantId: tenant.id },
    include: { outbox: true },
  })
  if (!item) return null
  return deliver(tenant, item.leadCaseId, fault)
}

export async function listCrmCompanies(tenant: RequestTenant): Promise<CrmCompanyList> {
  const rows = await prisma.crmCompany.findMany({
    where: { tenantId: tenant.id },
    orderBy: { domain: 'asc' },
  })
  return CrmCompanyListSchema.parse({
    synthetic: true,
    tenant: TenantSlugSchema.parse(tenant.slug),
    companies: rows.map((row) => ({ id: row.id, domain: row.domain, name: row.name })),
  })
}

export async function listCrmContacts(tenant: RequestTenant): Promise<CrmContactList> {
  const rows = await prisma.crmContact.findMany({
    where: { tenantId: tenant.id },
    orderBy: { emailNormalized: 'asc' },
  })
  return CrmContactListSchema.parse({
    synthetic: true,
    tenant: TenantSlugSchema.parse(tenant.slug),
    contacts: rows.map((row) => ({
      id: row.id,
      emailNormalized: row.emailNormalized,
      displayName: row.displayName,
    })),
  })
}

export async function listCrmDeals(tenant: RequestTenant): Promise<CrmDealList> {
  const rows = await prisma.crmDeal.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: 'asc' },
  })
  return CrmDealListSchema.parse({
    synthetic: true,
    tenant: TenantSlugSchema.parse(tenant.slug),
    deals: rows.map((row) => ({
      id: row.id,
      leadCaseId: row.leadCaseId,
      companyId: row.companyId,
      contactId: row.contactId,
    })),
  })
}

export async function listCrmTasks(tenant: RequestTenant): Promise<CrmTaskList> {
  const rows = await prisma.crmTask.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: 'asc' },
  })
  return CrmTaskListSchema.parse({
    synthetic: true,
    tenant: TenantSlugSchema.parse(tenant.slug),
    tasks: rows.map((row) => ({ id: row.id, leadCaseId: row.leadCaseId, type: CRM_TASK_TYPE })),
  })
}

export async function listDlq(tenant: RequestTenant): Promise<DlqList> {
  const rows = await prisma.dlqItem.findMany({
    where: { tenantId: tenant.id, resolvedAt: null },
    orderBy: { createdAt: 'asc' },
  })
  return DlqListSchema.parse({
    synthetic: true,
    tenant: TenantSlugSchema.parse(tenant.slug),
    items: rows.map((row) => ({
      id: row.id,
      leadCaseId: row.leadCaseId,
      fault: CrmFaultSchema.parse(row.fault),
      attempts: row.attempts,
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
  })
}
