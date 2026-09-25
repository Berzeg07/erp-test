import {
  RULES_POLICY_VERSION,
  RawLeadRecordSchema,
  RulesApplyResultSchema,
  evaluateRulesV1,
  type RulesApplyResult,
} from '@app/shared'
import { Prisma } from '@prisma/client'
import type { RequestTenant } from '../../lib/tenant.js'
import { prisma } from '../../lib/prisma.js'

function asStringArray(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function addUnique(list: string[], items: string[]) {
  const next = [...list]
  for (const item of items) {
    if (!next.includes(item)) next.push(item)
  }
  return next
}

type CaseRow = Prisma.LeadCaseGetPayload<{
  include: { person: true; rawRecords: true }
}>

function hasCompanyFromPayloads(payloads: Array<{ companyName?: string; domain?: string }>) {
  return payloads.some((row) => Boolean(row.companyName?.trim() || row.domain?.trim()))
}

export async function applyRulesToCase(item: CaseRow): Promise<ReturnType<typeof evaluateRulesV1>> {
  const payloads = item.rawRecords.flatMap((raw) => {
    const parsed = RawLeadRecordSchema.safeParse(raw.payload)
    if (!parsed.success) return []
    return [parsed.data]
  })

  const output = evaluateRulesV1({
    deliveryGuard: item.deliveryGuard,
    deliveryGuardReason: item.deliveryGuardReason,
    processingBasis: item.processingBasis,
    hasEmail: Boolean(item.person.emailNormalized || payloads.some((row) => row.email?.trim())),
    hasCompany: hasCompanyFromPayloads(payloads),
    tags: [...new Set(payloads.flatMap((row) => row.tags))],
    sourcePurpose: item.sourcePurpose || payloads.find((row) => row.sourcePurpose.trim())?.sourcePurpose || '',
    conflicts: asStringArray(item.conflicts),
    mergeBy: item.mergeBy,
  })

  const reasons = addUnique(asStringArray(item.reasons), output.reasons)

  await prisma.leadCase.update({
    where: { id: item.id },
    data: {
      status: output.status,
      deliveryGuard: output.deliveryGuard,
      deliveryGuardReason: output.deliveryGuardReason,
      score: output.score,
      confidence: output.confidence,
      policyVersion: output.policyVersion,
      reasons: reasons as Prisma.InputJsonValue,
    },
  })

  const evidenceRefs = item.processingBasisEvidenceRefs
  const record = {
    tenantId: item.tenantId,
    policyVersion: output.policyVersion,
    status: output.status,
    deliveryGuard: output.deliveryGuard,
    deliveryGuardReason: output.deliveryGuardReason,
    score: output.score,
    confidence: output.confidence,
    reasons: output.reasons as Prisma.InputJsonValue,
    evidenceRefs: evidenceRefs as Prisma.InputJsonValue,
    ruleOutput: output as unknown as Prisma.InputJsonValue,
    llmOutput: Prisma.JsonNull,
  }

  await prisma.decisionRecord.upsert({
    where: { leadCaseId: item.id },
    create: { leadCaseId: item.id, ...record },
    update: record,
  })

  return output
}

export async function applyRules(tenant: RequestTenant): Promise<RulesApplyResult> {
  const cases = await prisma.leadCase.findMany({
    where: { tenantId: tenant.id },
    include: { person: true, rawRecords: true },
    orderBy: { createdAt: 'asc' },
  })

  let qualified = 0
  let rejected = 0
  let review = 0

  for (const item of cases) {
    const output = await applyRulesToCase(item)
    if (output.status === 'QUALIFY') qualified += 1
    else if (output.status === 'REJECT') rejected += 1
    else review += 1
  }

  return RulesApplyResultSchema.parse({
    synthetic: true,
    tenant: tenant.slug,
    policyVersion: RULES_POLICY_VERSION,
    qualified,
    rejected,
    review,
  })
}

export async function applyRulesForCaseId(tenant: RequestTenant, caseId: string) {
  const item = await prisma.leadCase.findFirst({
    where: { id: caseId, tenantId: tenant.id },
    include: { person: true, rawRecords: true },
  })
  if (!item) return null
  await applyRulesToCase(item)
  return item.id
}
