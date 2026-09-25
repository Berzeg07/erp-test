import { z } from 'zod'

export const TenantSlugSchema = z.enum(['athenai_demo', 'proshelf_demo'])
export type TenantSlug = z.infer<typeof TenantSlugSchema>

export const LeadSourceSchema = z.enum(['webinar_csv', 'partner_json', 'mock_api'])
export type LeadSource = z.infer<typeof LeadSourceSchema>

export const BusinessSegmentSchema = z.enum(['saas', 'manufacturing', 'agency'])
export type BusinessSegment = z.infer<typeof BusinessSegmentSchema>

export const ProcessingBasisSchema = z.enum([
  'CONSENT',
  'DOCUMENTED_LEGITIMATE_INTEREST',
  'UNKNOWN',
  'PROHIBITED',
])
export type ProcessingBasis = z.infer<typeof ProcessingBasisSchema>

export const PlannedReplySchema = z.enum([
  'positive',
  'negative',
  'neutral',
  'question',
  'opt_out',
  'out_of_office',
  'uncertain',
])
export type PlannedReply = z.infer<typeof PlannedReplySchema>

export const LeadCaseStatusSchema = z.enum(['QUALIFY', 'REJECT', 'MANUAL_REVIEW'])
export type LeadCaseStatus = z.infer<typeof LeadCaseStatusSchema>
export const DeliveryGuardSchema = z.enum(['CLEAR', 'BLOCKED'])
export type DeliveryGuard = z.infer<typeof DeliveryGuardSchema>

export const RawLeadRecordSchema = z.object({
  id: z.string().min(1),
  tenantSlug: TenantSlugSchema,
  source: LeadSourceSchema,
  externalId: z.string().min(1),
  companyName: z.string().optional(),
  domain: z.string().optional(),
  contactName: z.string().optional(),
  email: z.string().optional(),
  segment: BusinessSegmentSchema.optional(),
  comment: z.string().optional(),
  processingBasis: ProcessingBasisSchema,
  sourcePurpose: z.string().min(1),
  optOut: z.boolean(),
  plannedReply: PlannedReplySchema.optional(),
  tags: z.array(z.string()),
})
export type RawLeadRecord = z.infer<typeof RawLeadRecordSchema>

export const ExpectedOutcomeSchema = z.object({
  recordId: z.string().min(1),
  tenantSlug: TenantSlugSchema,
  mergeGroup: z.string().min(1),
  mergeBy: z.enum(['external_id', 'domain', 'company_name', 'none']),
  status: LeadCaseStatusSchema,
  deliveryGuard: DeliveryGuardSchema,
  deliveryGuardReason: z.string().nullable(),
  notes: z.string().min(1),
})
export type ExpectedOutcome = z.infer<typeof ExpectedOutcomeSchema>

export const FixtureBundleSchema = z.object({
  synthetic: z.literal(true),
  version: z.string(),
  leads: z.array(RawLeadRecordSchema).min(60),
})
export type FixtureBundle = z.infer<typeof FixtureBundleSchema>

export const ExpectedOutcomesBundleSchema = z.object({
  synthetic: z.literal(true),
  version: z.string(),
  policyVersion: z.literal('rules-v1'),
  outcomes: z.array(ExpectedOutcomeSchema).min(60),
})
export type ExpectedOutcomesBundle = z.infer<typeof ExpectedOutcomesBundleSchema>
