import {
  RULES_POLICY_VERSION,
  RawLeadRecordSchema,
  RulesApplyResultSchema,
  evaluateRulesV1,
  type LlmMockFault,
  type RulesApplyResult,
} from '@app/shared'
import { Prisma } from '@prisma/client'
import type { RequestTenant } from '../../lib/tenant.js'
import { prisma } from '../../lib/prisma.js'
import { applyLlmToCase } from '../llm/llm.service.js'

export type ApplyRulesOptions = {
  llmFault?: LlmMockFault
}

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
  }

  await prisma.decisionRecord.upsert({
    where: { leadCaseId: item.id },
    create: { leadCaseId: item.id, ...record, llmOutput: Prisma.JsonNull },
    update: record,
  })

  return output
}

export async function applyRules(tenant: RequestTenant, options?: ApplyRulesOptions): Promise<RulesApplyResult> {
  const cases = await prisma.leadCase.findMany({
    where: { tenantId: tenant.id },
    include: { person: true, rawRecords: true },
    orderBy: { createdAt: 'asc' },
  })

  for (const item of cases) {
    await applyRulesToCase(item)
    await applyLlmToCase(tenant, item.id, options)
  }

  const refreshed = await prisma.leadCase.findMany({
    where: { tenantId: tenant.id },
    select: { status: true },
  })

  return RulesApplyResultSchema.parse({
    synthetic: true,
    tenant: tenant.slug,
    policyVersion: RULES_POLICY_VERSION,
    qualified: refreshed.filter((row) => row.status === 'QUALIFY').length,
    rejected: refreshed.filter((row) => row.status === 'REJECT').length,
    review: refreshed.filter((row) => row.status === 'MANUAL_REVIEW').length,
  })
}

export async function applyRulesForCaseId(tenant: RequestTenant, caseId: string, options?: ApplyRulesOptions) {
  const item = await prisma.leadCase.findFirst({
    where: { id: caseId, tenantId: tenant.id },
    include: { person: true, rawRecords: true },
  })
  if (!item) return null
  await applyRulesToCase(item)
  await applyLlmToCase(tenant, item.id, options)
  return item.id
}
