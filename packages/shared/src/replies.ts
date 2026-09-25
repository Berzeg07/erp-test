import { z } from 'zod'
import { PlannedReplySchema, TenantSlugSchema } from './fixtures.js'

export const ReplyTypeSchema = PlannedReplySchema
export type ReplyType = z.infer<typeof ReplyTypeSchema>

export const ManagerTaskTypeSchema = z.enum(['question', 'opt_out', 'uncertain'])
export type ManagerTaskType = z.infer<typeof ManagerTaskTypeSchema>

export const TASK_TYPES_FOR_REPLY: ReadonlySet<ReplyType> = new Set(ManagerTaskTypeSchema.options)

export function taskTypeForReply(type: ReplyType): ManagerTaskType | null {
  return TASK_TYPES_FOR_REPLY.has(type) ? (type as ManagerTaskType) : null
}

export const ReplyBodySchema = z.object({
  leadCaseId: z.string().uuid(),
  type: ReplyTypeSchema,
})
export type ReplyBody = z.infer<typeof ReplyBodySchema>

export const EventBodySchema = z.object({
  leadCaseId: z.string().uuid(),
})
export type EventBody = z.infer<typeof EventBodySchema>

export const InboundReplyPublicSchema = z.object({
  synthetic: z.literal(true),
  tenant: TenantSlugSchema,
  replyId: z.string().uuid(),
  leadCaseId: z.string().uuid(),
  type: ReplyTypeSchema,
  taskId: z.string().uuid().nullable(),
  idempotent: z.boolean(),
  createdAt: z.string().datetime(),
})
export type InboundReplyPublic = z.infer<typeof InboundReplyPublicSchema>

export const ReplyListSchema = z.object({
  synthetic: z.literal(true),
  tenant: TenantSlugSchema,
  replies: z.array(InboundReplyPublicSchema.omit({ idempotent: true })),
})
export type ReplyList = z.infer<typeof ReplyListSchema>

export const ReplyImportResultSchema = z.object({
  synthetic: z.literal(true),
  tenant: TenantSlugSchema,
  applied: z.number().int().nonnegative(),
  tasks: z.number().int().nonnegative(),
})
export type ReplyImportResult = z.infer<typeof ReplyImportResultSchema>

export const ManagerTaskPublicSchema = z.object({
  id: z.string().uuid(),
  leadCaseId: z.string().uuid(),
  replyId: z.string().uuid().nullable(),
  type: ManagerTaskTypeSchema,
  status: z.literal('open'),
  createdAt: z.string().datetime(),
})
export type ManagerTaskPublic = z.infer<typeof ManagerTaskPublicSchema>

export const TaskListSchema = z.object({
  synthetic: z.literal(true),
  tenant: TenantSlugSchema,
  tasks: z.array(ManagerTaskPublicSchema),
})
export type TaskList = z.infer<typeof TaskListSchema>

export const PaymentEventPublicSchema = z.object({
  synthetic: z.literal(true),
  tenant: TenantSlugSchema,
  paymentId: z.string().uuid(),
  leadCaseId: z.string().uuid(),
  idempotent: z.boolean(),
  createdAt: z.string().datetime(),
})
export type PaymentEventPublic = z.infer<typeof PaymentEventPublicSchema>

export const PaymentListSchema = z.object({
  synthetic: z.literal(true),
  tenant: TenantSlugSchema,
  payments: z.array(PaymentEventPublicSchema.omit({ idempotent: true })),
})
export type PaymentList = z.infer<typeof PaymentListSchema>

export const MeetingEventPublicSchema = z.object({
  synthetic: z.literal(true),
  tenant: TenantSlugSchema,
  meetingId: z.string().uuid(),
  leadCaseId: z.string().uuid(),
  idempotent: z.boolean(),
  createdAt: z.string().datetime(),
})
export type MeetingEventPublic = z.infer<typeof MeetingEventPublicSchema>

export const MeetingListSchema = z.object({
  synthetic: z.literal(true),
  tenant: TenantSlugSchema,
  meetings: z.array(MeetingEventPublicSchema.omit({ idempotent: true })),
})
export type MeetingList = z.infer<typeof MeetingListSchema>
