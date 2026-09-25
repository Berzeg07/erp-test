import { z } from 'zod'
import { MOCK_EMAIL_CHANNEL, POLICY_FIXED_CTA } from './llm.js'
import { ProcessingBasisSchema, TenantSlugSchema } from './fixtures.js'

export const DraftEvidenceRefSchema = z.object({
  rawId: z.string(),
  field: z.string(),
  source: z.string().optional(),
})
export type DraftEvidenceRef = z.infer<typeof DraftEvidenceRefSchema>

export const DraftComposeInputSchema = z.object({
  contactName: z.string().nullable(),
  email: z.string().nullable(),
  companyName: z.string().min(1),
  domains: z.array(z.string()),
  processingBasis: ProcessingBasisSchema,
  sourcePurpose: z.string(),
  evidenceRefs: z.array(DraftEvidenceRefSchema),
})
export type DraftComposeInput = z.infer<typeof DraftComposeInputSchema>

export const DraftPatchBodySchema = z.object({
  text: z.string().min(1).max(8000),
})
export type DraftPatchBody = z.infer<typeof DraftPatchBodySchema>

export const DraftVersionPublicSchema = z.object({
  synthetic: z.literal(true),
  tenant: TenantSlugSchema,
  leadCaseId: z.string().uuid(),
  draftId: z.string().uuid(),
  versionId: z.string().uuid(),
  versionNumber: z.number().int().positive(),
  subject: z.string(),
  body: z.string(),
  channel: z.literal(MOCK_EMAIL_CHANNEL),
  cta: z.literal(POLICY_FIXED_CTA),
  evidenceRefs: z.array(DraftEvidenceRefSchema),
  approved: z.boolean(),
  approvedAt: z.string().datetime().nullable(),
  approvedByUserId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
})
export type DraftVersionPublic = z.infer<typeof DraftVersionPublicSchema>

export const DraftListSchema = z.object({
  synthetic: z.literal(true),
  tenant: TenantSlugSchema,
  leadCaseId: z.string().uuid(),
  versions: z.array(DraftVersionPublicSchema),
})
export type DraftList = z.infer<typeof DraftListSchema>

export function composeDraftFromEvidence(input: DraftComposeInput): { subject: string; body: string } {
  const parsed = DraftComposeInputSchema.parse(input)
  const name = parsed.contactName?.trim() || 'there'
  const domain = parsed.domains[0] ? ` (${parsed.domains[0]})` : ''
  const emailLine = parsed.email ? `Contact: ${parsed.email}` : 'Contact: (none on card)'
  const refs =
    parsed.evidenceRefs.length > 0
      ? parsed.evidenceRefs.map((row) => `- ${row.field} from raw ${row.rawId}${row.source ? ` (${row.source})` : ''}`).join('\n')
      : '- (no processing-basis refs)'

  const subject = `Follow-up: ${parsed.companyName}`
  const body = [
    `Hello ${name},`,
    '',
    `This follow-up is for ${parsed.companyName}${domain}.`,
    emailLine,
    `Source purpose: ${parsed.sourcePurpose || '(none)'}`,
    `Processing basis: ${parsed.processingBasis}`,
    `Call to action: ${POLICY_FIXED_CTA}`,
    `Channel: ${MOCK_EMAIL_CHANNEL}`,
    '',
    'Evidence:',
    refs,
  ].join('\n')

  return { subject, body }
}
