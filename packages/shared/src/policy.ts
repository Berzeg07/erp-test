import { z } from 'zod'
import { TenantSlugSchema } from './fixtures.js'

export const DeliveryGuardReasonSchema = z.enum([
  'opt_out',
  'suppression',
  'prompt_injection',
  'unknown_processing_basis',
  'forbidden_source',
])
export type DeliveryGuardReason = z.infer<typeof DeliveryGuardReasonSchema>

export const ProcessingBasisEvidenceRefSchema = z.object({
  rawId: z.string(),
  field: z.string(),
  source: z.string().optional(),
})
export type ProcessingBasisEvidenceRef = z.infer<typeof ProcessingBasisEvidenceRefSchema>

export const SuppressionEntrySchema = z.object({
  tenantSlug: TenantSlugSchema,
  email: z.string().min(3),
  reason: z.enum(['suppression', 'opt_out']),
})
export type SuppressionEntry = z.infer<typeof SuppressionEntrySchema>

export const SuppressionListSchema = z.object({
  synthetic: z.literal(true),
  tenant: TenantSlugSchema,
  entries: z.array(
    z.object({
      emailNormalized: z.string(),
      reason: z.string(),
    }),
  ),
})
export type SuppressionList = z.infer<typeof SuppressionListSchema>

export const PolicyApplyResultSchema = z.object({
  synthetic: z.literal(true),
  tenant: TenantSlugSchema,
  blocked: z.number().int().nonnegative(),
  clear: z.number().int().nonnegative(),
})
export type PolicyApplyResult = z.infer<typeof PolicyApplyResultSchema>

export const FixtureSuppressionBundleSchema = z.object({
  synthetic: z.literal(true),
  version: z.string(),
  entries: z.array(SuppressionEntrySchema),
})
export type FixtureSuppressionBundle = z.infer<typeof FixtureSuppressionBundleSchema>
