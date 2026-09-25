import {
  DraftListSchema,
  DraftVersionPublicSchema,
  MOCK_EMAIL_CHANNEL,
  POLICY_FIXED_CTA,
  TenantSlugSchema,
  composeDraftFromEvidence,
  type DraftEvidenceRef,
  type DraftList,
  type DraftVersionPublic,
} from '@app/shared'
import { Prisma } from '@prisma/client'
import type { RequestTenant } from '../../lib/tenant.js'
import { prisma } from '../../lib/prisma.js'

export class DraftError extends Error {
  constructor(
    readonly code: 'DELIVERY_BLOCKED' | 'NOT_QUALIFIED',
    readonly statusCode: number,
  ) {
    super(code)
    this.name = 'DraftError'
  }
}

function asEvidenceRefs(value: Prisma.JsonValue): DraftEvidenceRef[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const row = item as { rawId?: unknown; field?: unknown; source?: unknown }
    if (typeof row.rawId !== 'string' || typeof row.field !== 'string') return []
    return [
      {
        rawId: row.rawId,
        field: row.field,
        ...(typeof row.source === 'string' ? { source: row.source } : {}),
      },
    ]
  })
}

function toPublic(row: {
  id: string
  tenantSlug: string
  leadCaseId: string
  draftId: string
  versionNumber: number
  subject: string
  body: string
  channel: string
  cta: string
  evidenceRefs: Prisma.JsonValue
  createdAt: Date
  approval: { createdAt: Date; approvedByUserId: string } | null
}): DraftVersionPublic {
  return DraftVersionPublicSchema.parse({
    synthetic: true,
    tenant: TenantSlugSchema.parse(row.tenantSlug),
    leadCaseId: row.leadCaseId,
    draftId: row.draftId,
    versionId: row.id,
    versionNumber: row.versionNumber,
    subject: row.subject,
    body: row.body,
    channel: MOCK_EMAIL_CHANNEL,
    cta: POLICY_FIXED_CTA,
    evidenceRefs: asEvidenceRefs(row.evidenceRefs),
    approved: Boolean(row.approval),
    approvedAt: row.approval ? row.approval.createdAt.toISOString() : null,
    approvedByUserId: row.approval?.approvedByUserId ?? null,
    createdAt: row.createdAt.toISOString(),
  })
}

const versionInclude = { approval: true, draft: { select: { leadCaseId: true } } } as const

async function loadVersion(tenantId: string, versionId: string) {
  return prisma.draftVersion.findFirst({
    where: { id: versionId, tenantId },
    include: versionInclude,
  })
}

export async function createDraftFromEvidence(tenant: RequestTenant, caseId: string): Promise<DraftVersionPublic | null> {
  const item = await prisma.leadCase.findFirst({
    where: { id: caseId, tenantId: tenant.id },
    include: { person: true, company: { include: { domains: true } } },
  })
  if (!item) return null

  if (item.deliveryGuard === 'BLOCKED') {
    throw new DraftError('DELIVERY_BLOCKED', 409)
  }
  if (item.status !== 'QUALIFY') {
    throw new DraftError('NOT_QUALIFIED', 409)
  }

  const evidenceRefs = asEvidenceRefs(item.processingBasisEvidenceRefs)
  const composed = composeDraftFromEvidence({
    contactName: item.person.displayName,
    email: item.person.emailNormalized,
    companyName: item.company.name,
    domains: item.company.domains.map((row) => row.domain),
    processingBasis: item.processingBasis,
    sourcePurpose: item.sourcePurpose,
    evidenceRefs,
  })

  const draft = await prisma.draft.upsert({
    where: { leadCaseId: item.id },
    create: { tenantId: tenant.id, leadCaseId: item.id },
    update: {},
  })

  const last = await prisma.draftVersion.findFirst({
    where: { draftId: draft.id },
    orderBy: { versionNumber: 'desc' },
    select: { versionNumber: true },
  })

  const created = await prisma.draftVersion.create({
    data: {
      tenantId: tenant.id,
      draftId: draft.id,
      versionNumber: (last?.versionNumber ?? 0) + 1,
      subject: composed.subject,
      body: composed.body,
      channel: MOCK_EMAIL_CHANNEL,
      cta: POLICY_FIXED_CTA,
      evidenceRefs: evidenceRefs as Prisma.InputJsonValue,
    },
    include: versionInclude,
  })

  return toPublic({
    ...created,
    tenantSlug: tenant.slug,
    leadCaseId: created.draft.leadCaseId,
  })
}

export async function listDrafts(tenant: RequestTenant, caseId: string): Promise<DraftList | null> {
  const item = await prisma.leadCase.findFirst({
    where: { id: caseId, tenantId: tenant.id },
    select: { id: true },
  })
  if (!item) return null

  const draft = await prisma.draft.findUnique({
    where: { leadCaseId: item.id },
    include: {
      versions: { include: { approval: true }, orderBy: { versionNumber: 'asc' } },
    },
  })

  return DraftListSchema.parse({
    synthetic: true,
    tenant: TenantSlugSchema.parse(tenant.slug),
    leadCaseId: item.id,
    versions: (draft?.versions ?? []).map((row) =>
      toPublic({
        ...row,
        tenantSlug: tenant.slug,
        leadCaseId: item.id,
      }),
    ),
  })
}

export async function patchDraftVersion(
  tenant: RequestTenant,
  versionId: string,
  text: string,
): Promise<DraftVersionPublic | null> {
  const current = await loadVersion(tenant.id, versionId)
  if (!current) return null

  const last = await prisma.draftVersion.findFirst({
    where: { draftId: current.draftId },
    orderBy: { versionNumber: 'desc' },
    select: { versionNumber: true },
  })

  const created = await prisma.draftVersion.create({
    data: {
      tenantId: tenant.id,
      draftId: current.draftId,
      versionNumber: (last?.versionNumber ?? 0) + 1,
      subject: current.subject,
      body: text,
      channel: MOCK_EMAIL_CHANNEL,
      cta: POLICY_FIXED_CTA,
      evidenceRefs: current.evidenceRefs as Prisma.InputJsonValue,
    },
    include: versionInclude,
  })

  return toPublic({
    ...created,
    tenantSlug: tenant.slug,
    leadCaseId: created.draft.leadCaseId,
  })
}

export async function approveDraftVersion(
  tenant: RequestTenant,
  versionId: string,
  userId: string,
): Promise<DraftVersionPublic | null> {
  const current = await loadVersion(tenant.id, versionId)
  if (!current) return null

  if (!current.approval) {
    await prisma.approval.create({
      data: {
        tenantId: tenant.id,
        draftVersionId: current.id,
        approvedByUserId: userId,
      },
    })
  }

  const refreshed = await loadVersion(tenant.id, versionId)
  if (!refreshed) return null

  return toPublic({
    ...refreshed,
    tenantSlug: tenant.slug,
    leadCaseId: refreshed.draft.leadCaseId,
  })
}
