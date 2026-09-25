import { Prisma } from '@prisma/client'
import {
  InboundReplyPublicSchema,
  MeetingEventPublicSchema,
  MeetingListSchema,
  PaymentEventPublicSchema,
  PaymentListSchema,
  RawLeadRecordSchema,
  ReplyImportResultSchema,
  ReplyListSchema,
  TaskListSchema,
  TenantSlugSchema,
  taskTypeForReply,
  type InboundReplyPublic,
  type MeetingEventPublic,
  type MeetingList,
  type PaymentEventPublic,
  type PaymentList,
  type ReplyImportResult,
  type ReplyList,
  type ReplyType,
  type TaskList,
} from '@app/shared'
import type { RequestTenant } from '../../lib/tenant.js'
import { prisma } from '../../lib/prisma.js'
import { normalizeEmail } from '../dedup/normalize.js'

function toReply(row: { id: string; leadCaseId: string; type: string; createdAt: Date }, tenantSlug: string, taskId: string | null, idempotent: boolean): InboundReplyPublic {
  return InboundReplyPublicSchema.parse({
    synthetic: true,
    tenant: TenantSlugSchema.parse(tenantSlug),
    replyId: row.id,
    leadCaseId: row.leadCaseId,
    type: row.type,
    taskId,
    idempotent,
    createdAt: row.createdAt.toISOString(),
  })
}

async function taskIdFor(tenantId: string, leadCaseId: string, type: ReplyType): Promise<string | null> {
  const taskType = taskTypeForReply(type)
  if (!taskType) return null
  const task = await prisma.managerTask.findUnique({
    where: { tenantId_type_leadCaseId: { tenantId, type: taskType, leadCaseId } },
    select: { id: true },
  })
  return task?.id ?? null
}

async function applyOptOut(tenantId: string, leadCaseId: string, emailNormalized: string | null) {
  if (emailNormalized) {
    const email = normalizeEmail(emailNormalized) ?? emailNormalized
    await prisma.suppressionEntry.upsert({
      where: { tenantId_emailNormalized: { tenantId, emailNormalized: email } },
      create: { tenantId, emailNormalized: email, reason: 'opt_out' },
      update: { reason: 'opt_out' },
    })
  }

  await prisma.leadCase.update({
    where: { id: leadCaseId },
    data: {
      status: 'MANUAL_REVIEW',
      deliveryGuard: 'BLOCKED',
      deliveryGuardReason: 'opt_out',
    },
  })
  await prisma.decisionRecord.updateMany({
    where: { leadCaseId, tenantId },
    data: {
      status: 'MANUAL_REVIEW',
      deliveryGuard: 'BLOCKED',
      deliveryGuardReason: 'opt_out',
    },
  })
}

async function ensureTask(tenantId: string, leadCaseId: string, replyId: string, type: ReplyType): Promise<string | null> {
  const taskType = taskTypeForReply(type)
  if (!taskType) return null

  const existing = await prisma.managerTask.findUnique({
    where: { tenantId_type_leadCaseId: { tenantId, type: taskType, leadCaseId } },
  })
  if (existing) return existing.id

  try {
    const created = await prisma.managerTask.create({
      data: { tenantId, leadCaseId, replyId, type: taskType, status: 'open' },
    })
    return created.id
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return taskIdFor(tenantId, leadCaseId, type)
    }
    throw error
  }
}

export async function applyReply(tenant: RequestTenant, leadCaseId: string, type: ReplyType): Promise<InboundReplyPublic | null> {
  const leadCase = await prisma.leadCase.findFirst({
    where: { id: leadCaseId, tenantId: tenant.id },
    include: { person: { select: { emailNormalized: true } } },
  })
  if (!leadCase) return null

  const existing = await prisma.inboundReply.findUnique({
    where: { tenantId_leadCaseId_type: { tenantId: tenant.id, leadCaseId, type } },
  })
  if (existing) {
    if (type === 'opt_out') {
      await applyOptOut(tenant.id, leadCaseId, leadCase.person.emailNormalized)
    }
    const taskId = await ensureTask(tenant.id, leadCaseId, existing.id, type)
    return toReply(existing, tenant.slug, taskId, true)
  }

  let row
  try {
    row = await prisma.inboundReply.create({
      data: { tenantId: tenant.id, leadCaseId, type },
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return applyReply(tenant, leadCaseId, type)
    }
    throw error
  }

  if (type === 'opt_out') {
    await applyOptOut(tenant.id, leadCaseId, leadCase.person.emailNormalized)
  }
  const taskId = await ensureTask(tenant.id, leadCaseId, row.id, type)
  return toReply(row, tenant.slug, taskId, false)
}

export async function importRepliesFromFixtures(tenant: RequestTenant): Promise<ReplyImportResult> {
  const cases = await prisma.leadCase.findMany({
    where: { tenantId: tenant.id },
    include: { rawRecords: true },
  })

  let applied = 0
  let tasks = 0
  for (const item of cases) {
    const type = item.rawRecords
      .map((raw) => RawLeadRecordSchema.safeParse(raw.payload))
      .flatMap((parsed) => (parsed.success && parsed.data.plannedReply ? [parsed.data.plannedReply] : []))[0]
    if (!type) continue
    const result = await applyReply(tenant, item.id, type)
    if (!result) continue
    if (!result.idempotent) applied += 1
    if (result.taskId && !result.idempotent) tasks += 1
  }

  return ReplyImportResultSchema.parse({
    synthetic: true,
    tenant: TenantSlugSchema.parse(tenant.slug),
    applied,
    tasks,
  })
}

export async function listReplies(tenant: RequestTenant): Promise<ReplyList> {
  const rows = await prisma.inboundReply.findMany({
    where: { tenantId: tenant.id },
    include: { tasks: { select: { id: true }, take: 1 } },
    orderBy: { createdAt: 'asc' },
  })
  return ReplyListSchema.parse({
    synthetic: true,
    tenant: TenantSlugSchema.parse(tenant.slug),
    replies: rows.map((row) => ({
      synthetic: true as const,
      tenant: TenantSlugSchema.parse(tenant.slug),
      replyId: row.id,
      leadCaseId: row.leadCaseId,
      type: row.type,
      taskId: row.tasks[0]?.id ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
  })
}

export async function listTasks(tenant: RequestTenant): Promise<TaskList> {
  const rows = await prisma.managerTask.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: 'asc' },
  })
  return TaskListSchema.parse({
    synthetic: true,
    tenant: TenantSlugSchema.parse(tenant.slug),
    tasks: rows.map((row) => ({
      id: row.id,
      leadCaseId: row.leadCaseId,
      replyId: row.replyId,
      type: row.type,
      status: 'open' as const,
      createdAt: row.createdAt.toISOString(),
    })),
  })
}

export async function recordPayment(tenant: RequestTenant, leadCaseId: string): Promise<PaymentEventPublic | null> {
  const leadCase = await prisma.leadCase.findFirst({ where: { id: leadCaseId, tenantId: tenant.id }, select: { id: true } })
  if (!leadCase) return null

  const existing = await prisma.paymentEvent.findUnique({
    where: { tenantId_leadCaseId: { tenantId: tenant.id, leadCaseId } },
  })
  if (existing) {
    return PaymentEventPublicSchema.parse({
      synthetic: true,
      tenant: TenantSlugSchema.parse(tenant.slug),
      paymentId: existing.id,
      leadCaseId: existing.leadCaseId,
      idempotent: true,
      createdAt: existing.createdAt.toISOString(),
    })
  }

  try {
    const created = await prisma.paymentEvent.create({ data: { tenantId: tenant.id, leadCaseId } })
    return PaymentEventPublicSchema.parse({
      synthetic: true,
      tenant: TenantSlugSchema.parse(tenant.slug),
      paymentId: created.id,
      leadCaseId: created.leadCaseId,
      idempotent: false,
      createdAt: created.createdAt.toISOString(),
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return recordPayment(tenant, leadCaseId)
    }
    throw error
  }
}

export async function listPayments(tenant: RequestTenant): Promise<PaymentList> {
  const rows = await prisma.paymentEvent.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: 'asc' },
  })
  return PaymentListSchema.parse({
    synthetic: true,
    tenant: TenantSlugSchema.parse(tenant.slug),
    payments: rows.map((row) => ({
      synthetic: true as const,
      tenant: TenantSlugSchema.parse(tenant.slug),
      paymentId: row.id,
      leadCaseId: row.leadCaseId,
      createdAt: row.createdAt.toISOString(),
    })),
  })
}

export async function recordMeeting(tenant: RequestTenant, leadCaseId: string): Promise<MeetingEventPublic | null> {
  const leadCase = await prisma.leadCase.findFirst({ where: { id: leadCaseId, tenantId: tenant.id }, select: { id: true } })
  if (!leadCase) return null

  const existing = await prisma.meetingEvent.findUnique({
    where: { tenantId_leadCaseId: { tenantId: tenant.id, leadCaseId } },
  })
  if (existing) {
    return MeetingEventPublicSchema.parse({
      synthetic: true,
      tenant: TenantSlugSchema.parse(tenant.slug),
      meetingId: existing.id,
      leadCaseId: existing.leadCaseId,
      idempotent: true,
      createdAt: existing.createdAt.toISOString(),
    })
  }

  try {
    const created = await prisma.meetingEvent.create({ data: { tenantId: tenant.id, leadCaseId } })
    return MeetingEventPublicSchema.parse({
      synthetic: true,
      tenant: TenantSlugSchema.parse(tenant.slug),
      meetingId: created.id,
      leadCaseId: created.leadCaseId,
      idempotent: false,
      createdAt: created.createdAt.toISOString(),
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return recordMeeting(tenant, leadCaseId)
    }
    throw error
  }
}

export async function listMeetings(tenant: RequestTenant): Promise<MeetingList> {
  const rows = await prisma.meetingEvent.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: 'asc' },
  })
  return MeetingListSchema.parse({
    synthetic: true,
    tenant: TenantSlugSchema.parse(tenant.slug),
    meetings: rows.map((row) => ({
      synthetic: true as const,
      tenant: TenantSlugSchema.parse(tenant.slug),
      meetingId: row.id,
      leadCaseId: row.leadCaseId,
      createdAt: row.createdAt.toISOString(),
    })),
  })
}
