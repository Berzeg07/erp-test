import { z } from 'zod'
import { MOCK_EMAIL_CHANNEL } from './llm.js'
import { TenantSlugSchema } from './fixtures.js'

export const OutboxStatusSchema = z.literal('MOCK_SENT')
export type OutboxStatus = z.infer<typeof OutboxStatusSchema>

export const OutboxSendResultSchema = z.object({
  synthetic: z.literal(true),
  tenant: TenantSlugSchema,
  outboxId: z.string().uuid(),
  leadCaseId: z.string().uuid(),
  draftVersionId: z.string().uuid(),
  status: OutboxStatusSchema,
  channel: z.literal(MOCK_EMAIL_CHANNEL),
  toEmail: z.string().nullable(),
  idempotent: z.boolean(),
  sentAt: z.string().datetime(),
})
export type OutboxSendResult = z.infer<typeof OutboxSendResultSchema>

export const OutboxListSchema = z.object({
  synthetic: z.literal(true),
  tenant: TenantSlugSchema,
  messages: z.array(OutboxSendResultSchema.omit({ idempotent: true })),
})
export type OutboxList = z.infer<typeof OutboxListSchema>
