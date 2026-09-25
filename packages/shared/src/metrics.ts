import { z } from 'zod'
import { TenantSlugSchema } from './fixtures.js'

export const HUMAN_MINUTES_PER_APPROVAL = 2
export const HUMAN_MINUTES_PER_REVIEW = 5
export const SYNTHETIC_COST_PER_HUMAN_MINUTE = 1

export const KillSwitchBodySchema = z.object({
  on: z.boolean(),
  reason: z.string().min(1).max(80).optional(),
})
export type KillSwitchBody = z.infer<typeof KillSwitchBodySchema>

export const MetricsSchema = z.object({
  synthetic: z.literal(true),
  tenant: TenantSlugSchema,
  imported: z.number().int().nonnegative(),
  uniqueLeads: z.number().int().nonnegative(),
  qualified: z.number().int().nonnegative(),
  manualReview: z.number().int().nonnegative(),
  blocked: z.number().int().nonnegative(),
  drafts: z.number().int().nonnegative(),
  approvals: z.number().int().nonnegative(),
  mockSent: z.number().int().nonnegative(),
  replies: z.number().int().nonnegative(),
  meetings: z.number().int().nonnegative(),
  payments: z.number().int().nonnegative(),
  expenses: z.number().nonnegative(),
  humanMinutes: z.number().nonnegative(),
  costPerLead: z.number().nonnegative(),
  costPerMeeting: z.number().nonnegative(),
  cac: z.number().nonnegative(),
  killSwitchOn: z.boolean(),
  killSwitchReason: z.string().nullable(),
})
export type Metrics = z.infer<typeof MetricsSchema>

export function humanMinutesFromCounts(approvals: number, manualReview: number) {
  return approvals * HUMAN_MINUTES_PER_APPROVAL + manualReview * HUMAN_MINUTES_PER_REVIEW
}

export function ratio(expenses: number, count: number) {
  if (count <= 0) return 0
  return expenses / count
}
