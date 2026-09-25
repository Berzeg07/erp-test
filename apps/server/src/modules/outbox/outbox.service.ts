import { Prisma } from '@prisma/client'
import {
  MOCK_EMAIL_CHANNEL,
  OutboxListSchema,
  OutboxSendResultSchema,
  TenantSlugSchema,
  type OutboxList,
  type OutboxSendResult,
} from '@app/shared'
import type { RequestTenant } from '../../lib/tenant.js'
import { prisma } from '../../lib/prisma.js'

export class OutboxError extends Error {
  constructor(
    readonly code:
      | 'APPROVAL_REQUIRED'
      | 'APPROVAL_STALE'
      | 'DELIVERY_BLOCKED'
      | 'NOT_QUALIFIED'
      | 'KILL_SWITCH_ACTIVE'
      | 'BUDGET_EXCEEDED',
    readonly statusCode: number = 409,
  ) {
    super(code)
    this.name = 'OutboxError'
  }
}

type OutboxRow = {
  id: string
  leadCaseId: string
  draftVersionId: string
  toEmail: string | null
  sentAt: Date
}

function toMessage(row: OutboxRow, tenantSlug: string) {
  return {
    synthetic: true as const,
    tenant: TenantSlugSchema.parse(tenantSlug),
    outboxId: row.id,
    leadCaseId: row.leadCaseId,
    draftVersionId: row.draftVersionId,
    status: 'MOCK_SENT' as const,
    channel: MOCK_EMAIL_CHANNEL,
    toEmail: row.toEmail,
    sentAt: row.sentAt.toISOString(),
  }
}

function toSendResult(row: OutboxRow, tenantSlug: string, idempotent: boolean): OutboxSendResult {
  return OutboxSendResultSchema.parse({
    ...toMessage(row, tenantSlug),
    idempotent,
  })
}

export async function sendDraftVersion(tenant: RequestTenant, versionId: string): Promise<OutboxSendResult | null> {
  const version = await prisma.draftVersion.findFirst({
    where: { id: versionId, tenantId: tenant.id },
    include: {
      approval: true,
      outbox: true,
      draft: {
        include: {
          leadCase: { include: { person: true } },
          versions: { select: { versionNumber: true }, orderBy: { versionNumber: 'desc' }, take: 1 },
        },
      },
    },
  })
  if (!version) return null

  if (version.outbox) {
    return toSendResult(version.outbox, tenant.slug, true)
  }

  const tenantRow = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenant.id },
    select: { killSwitchOn: true, killSwitchReason: true },
  })
  if (tenantRow.killSwitchOn) {
    if (tenantRow.killSwitchReason === 'budget_exceeded') {
      throw new OutboxError('BUDGET_EXCEEDED')
    }
    throw new OutboxError('KILL_SWITCH_ACTIVE')
  }

  const leadCase = version.draft.leadCase
  if (leadCase.deliveryGuard === 'BLOCKED') {
    throw new OutboxError('DELIVERY_BLOCKED')
  }
  if (leadCase.status !== 'QUALIFY') {
    throw new OutboxError('NOT_QUALIFIED')
  }

  const latestNumber = version.draft.versions[0]?.versionNumber ?? version.versionNumber
  if (version.versionNumber < latestNumber) {
    throw new OutboxError('APPROVAL_STALE')
  }
  if (!version.approval) {
    throw new OutboxError('APPROVAL_REQUIRED')
  }

  try {
    const created = await prisma.outboxMessage.create({
      data: {
        tenantId: tenant.id,
        leadCaseId: leadCase.id,
        draftVersionId: version.id,
        channel: MOCK_EMAIL_CHANNEL,
        toEmail: leadCase.person.emailNormalized,
        subject: version.subject,
        body: version.body,
        status: 'MOCK_SENT',
        sentAt: new Date(),
      },
    })
    return toSendResult(created, tenant.slug, false)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existing = await prisma.outboxMessage.findUnique({ where: { draftVersionId: version.id } })
      if (existing) {
        return toSendResult(existing, tenant.slug, true)
      }
    }
    throw error
  }
}

export async function listOutbox(tenant: RequestTenant): Promise<OutboxList> {
  const rows = await prisma.outboxMessage.findMany({
    where: { tenantId: tenant.id },
    orderBy: { sentAt: 'asc' },
  })

  return OutboxListSchema.parse({
    synthetic: true,
    tenant: TenantSlugSchema.parse(tenant.slug),
    messages: rows.map((row) => toMessage(row, tenant.slug)),
  })
}
