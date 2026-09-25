import { z } from 'zod'
import {
  DeliveryGuardSchema,
  LeadCaseStatusSchema,
  ProcessingBasisSchema,
  RawLeadRecordSchema,
  TenantSlugSchema,
} from './fixtures.js'
import { DecisionRecordPublicSchema } from './rules.js'

export const MergeBySchema = z.enum(['external_id', 'domain', 'company_name', 'none'])
export type MergeBy = z.infer<typeof MergeBySchema>

export const DedupConflictSchema = z.enum([
  'person_multiple_companies',
  'company_multiple_contacts',
  'name_only_overlap',
])
export type DedupConflict = z.infer<typeof DedupConflictSchema>

export const DedupResolveResultSchema = z.object({
  synthetic: z.literal(true),
  tenant: TenantSlugSchema,
  cases: z.number().int().nonnegative(),
  persons: z.number().int().nonnegative(),
  companies: z.number().int().nonnegative(),
  attachedRaw: z.number().int().nonnegative(),
})
export type DedupResolveResult = z.infer<typeof DedupResolveResultSchema>

export const CasePersonSchema = z.object({
  id: z.string().uuid(),
  emailNormalized: z.string().nullable(),
  displayName: z.string().nullable(),
})
export type CasePerson = z.infer<typeof CasePersonSchema>

export const CaseCompanySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  domains: z.array(z.string()),
})
export type CaseCompany = z.infer<typeof CaseCompanySchema>

export const LeadCaseSummarySchema = z.object({
  id: z.string().uuid(),
  status: LeadCaseStatusSchema,
  deliveryGuard: DeliveryGuardSchema,
  deliveryGuardReason: z.string().nullable(),
  processingBasis: ProcessingBasisSchema,
  processingBasisEvidenceRefs: z.array(
    z.object({
      rawId: z.string(),
      field: z.string(),
      source: z.string().optional(),
    }),
  ),
  sourcePurpose: z.string(),
  score: z.number().int(),
  confidence: z.number(),
  policyVersion: z.literal('rules-v1'),
  mergeBy: MergeBySchema,
  conflicts: z.array(z.string()),
  reasons: z.array(z.string()),
  person: CasePersonSchema,
  company: CaseCompanySchema,
  rawCount: z.number().int().nonnegative(),
})
export type LeadCaseSummary = z.infer<typeof LeadCaseSummarySchema>

export const LeadCaseListSchema = z.object({
  synthetic: z.literal(true),
  tenant: TenantSlugSchema,
  cases: z.array(LeadCaseSummarySchema),
})
export type LeadCaseList = z.infer<typeof LeadCaseListSchema>

export const LeadCaseDetailSchema = LeadCaseSummarySchema.extend({
  decision: DecisionRecordPublicSchema.nullable(),
  rawRecords: z.array(
    z.object({
      id: z.string().uuid(),
      source: z.string(),
      externalId: z.string(),
      fixtureId: z.string().nullable(),
      payload: RawLeadRecordSchema,
    }),
  ),
})
export type LeadCaseDetail = z.infer<typeof LeadCaseDetailSchema>
