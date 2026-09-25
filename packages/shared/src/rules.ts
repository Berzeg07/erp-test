import { z } from 'zod'
import {
  DeliveryGuardSchema,
  LeadCaseStatusSchema,
  ProcessingBasisSchema,
  TenantSlugSchema,
  type DeliveryGuard,
  type LeadCaseStatus,
  type ProcessingBasis,
} from './fixtures.js'

export const RULES_POLICY_VERSION = 'rules-v1' as const

export const RulesInputSchema = z.object({
  deliveryGuard: DeliveryGuardSchema,
  deliveryGuardReason: z.string().nullable(),
  processingBasis: ProcessingBasisSchema,
  hasEmail: z.boolean(),
  hasCompany: z.boolean(),
  tags: z.array(z.string()),
  sourcePurpose: z.string(),
  conflicts: z.array(z.string()),
  mergeBy: z.string(),
})
export type RulesInput = z.infer<typeof RulesInputSchema>

export const RulesOutputSchema = z.object({
  policyVersion: z.literal(RULES_POLICY_VERSION),
  status: LeadCaseStatusSchema,
  deliveryGuard: DeliveryGuardSchema,
  deliveryGuardReason: z.string().nullable(),
  score: z.number().int().min(0).max(100),
  confidence: z.number().min(0).max(1),
  reasons: z.array(z.string()),
  llmOutput: z.null(),
})
export type RulesOutput = z.infer<typeof RulesOutputSchema>

export const DecisionRecordPublicSchema = z.object({
  id: z.string().uuid(),
  policyVersion: z.literal(RULES_POLICY_VERSION),
  status: LeadCaseStatusSchema,
  deliveryGuard: DeliveryGuardSchema,
  deliveryGuardReason: z.string().nullable(),
  score: z.number().int(),
  confidence: z.number(),
  reasons: z.array(z.string()),
  llmOutput: z.null(),
})
export type DecisionRecordPublic = z.infer<typeof DecisionRecordPublicSchema>

export const RulesApplyResultSchema = z.object({
  synthetic: z.literal(true),
  tenant: TenantSlugSchema,
  policyVersion: z.literal(RULES_POLICY_VERSION),
  qualified: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  review: z.number().int().nonnegative(),
})
export type RulesApplyResult = z.infer<typeof RulesApplyResultSchema>

const BLOCKING_CONFLICTS: ReadonlySet<string> = new Set([
  'person_multiple_companies',
  'company_multiple_contacts',
])

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function basisAllowed(basis: ProcessingBasis) {
  return basis === 'CONSENT' || basis === 'DOCUMENTED_LEGITIMATE_INTEREST'
}

function isOffIcp(tags: string[], sourcePurpose: string) {
  return tags.includes('reject_icp') || sourcePurpose === 'wrong_icp'
}

export function evaluateRulesV1(input: RulesInput): RulesOutput {
  const parsed = RulesInputSchema.parse(input)
  const blockingConflicts = parsed.conflicts.filter((item) => BLOCKING_CONFLICTS.has(item))
  const incomplete = !parsed.hasEmail && !parsed.hasCompany
  const weakMerge = parsed.conflicts.includes('name_only_overlap')
  const allowed = basisAllowed(parsed.processingBasis)

  let status: LeadCaseStatus = 'QUALIFY'
  let deliveryGuard: DeliveryGuard = parsed.deliveryGuard
  let deliveryGuardReason = parsed.deliveryGuardReason
  const reasons: string[] = []

  if (parsed.deliveryGuard === 'BLOCKED') {
    status = 'MANUAL_REVIEW'
    reasons.push(`blocked:${parsed.deliveryGuardReason ?? 'unspecified'}`)
  } else if (blockingConflicts.length > 0) {
    status = 'MANUAL_REVIEW'
    deliveryGuard = 'BLOCKED'
    deliveryGuardReason = null
    for (const conflict of blockingConflicts) reasons.push(`conflict:${conflict}`)
  } else if (incomplete) {
    status = 'MANUAL_REVIEW'
    reasons.push('incomplete_record')
  } else if (isOffIcp(parsed.tags, parsed.sourcePurpose)) {
    status = 'REJECT'
    reasons.push('not_icp')
  } else if (weakMerge) {
    status = 'MANUAL_REVIEW'
    reasons.push('low_merge_confidence')
  } else if (!allowed) {
    status = 'MANUAL_REVIEW'
    reasons.push('basis_not_allowed')
  } else {
    reasons.push('rules_v1_qualify')
  }

  let score = 40
  if (parsed.hasEmail) score += 20
  if (parsed.hasCompany) score += 15
  if (parsed.mergeBy === 'external_id') score += 15
  else if (parsed.mergeBy === 'domain') score += 10
  if (allowed) score += 10
  if (status === 'REJECT') score = 20
  if (status === 'MANUAL_REVIEW') score = Math.min(score, 45)
  if (deliveryGuard === 'BLOCKED') score = Math.min(score, 25)

  let confidence = 0.5
  if (deliveryGuard === 'BLOCKED') confidence = 0.9
  else if (status === 'REJECT') confidence = 0.84
  else if (status === 'QUALIFY') {
    if (parsed.mergeBy === 'external_id') confidence = 0.86
    else if (parsed.mergeBy === 'domain') confidence = 0.8
    else confidence = 0.74
  } else if (incomplete) confidence = 0.28
  else if (blockingConflicts.length > 0) confidence = 0.4
  else if (weakMerge) confidence = 0.42

  return RulesOutputSchema.parse({
    policyVersion: RULES_POLICY_VERSION,
    status,
    deliveryGuard,
    deliveryGuardReason,
    score: clampScore(score),
    confidence,
    reasons,
    llmOutput: null,
  })
}
