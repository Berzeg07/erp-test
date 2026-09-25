import { z } from 'zod'
import { TenantSlugSchema } from './fixtures.js'

export const CRM_MAX_ATTEMPTS = 3
export const CRM_TASK_TYPE = 'follow_up' as const
export const CRM_FAULT_HEADER = 'x-crm-fault'

export const CrmFaultSchema = z.enum(['429', '500'])
export type CrmFault = z.infer<typeof CrmFaultSchema>

export const CrmSyncBodySchema = z.object({
  leadCaseId: z.string().uuid(),
})
export type CrmSyncBody = z.infer<typeof CrmSyncBodySchema>

export const CrmSnapshotSchema = z.object({
  synthetic: z.literal(true),
  tenant: TenantSlugSchema,
  leadCaseId: z.string().uuid(),
  companyId: z.string().uuid(),
  contactId: z.string().uuid(),
  dealId: z.string().uuid(),
  taskId: z.string().uuid(),
  idempotent: z.boolean(),
})
export type CrmSnapshot = z.infer<typeof CrmSnapshotSchema>

export const CrmCompanyPublicSchema = z.object({
  id: z.string().uuid(),
  domain: z.string(),
  name: z.string(),
})
export type CrmCompanyPublic = z.infer<typeof CrmCompanyPublicSchema>

export const CrmContactPublicSchema = z.object({
  id: z.string().uuid(),
  emailNormalized: z.string(),
  displayName: z.string().nullable(),
})
export type CrmContactPublic = z.infer<typeof CrmContactPublicSchema>

export const CrmDealPublicSchema = z.object({
  id: z.string().uuid(),
  leadCaseId: z.string().uuid(),
  companyId: z.string().uuid(),
  contactId: z.string().uuid(),
})
export type CrmDealPublic = z.infer<typeof CrmDealPublicSchema>

export const CrmTaskPublicSchema = z.object({
  id: z.string().uuid(),
  leadCaseId: z.string().uuid(),
  type: z.literal(CRM_TASK_TYPE),
})
export type CrmTaskPublic = z.infer<typeof CrmTaskPublicSchema>

export const CrmCompanyListSchema = z.object({
  synthetic: z.literal(true),
  tenant: TenantSlugSchema,
  companies: z.array(CrmCompanyPublicSchema),
})
export type CrmCompanyList = z.infer<typeof CrmCompanyListSchema>

export const CrmContactListSchema = z.object({
  synthetic: z.literal(true),
  tenant: TenantSlugSchema,
  contacts: z.array(CrmContactPublicSchema),
})
export type CrmContactList = z.infer<typeof CrmContactListSchema>

export const CrmDealListSchema = z.object({
  synthetic: z.literal(true),
  tenant: TenantSlugSchema,
  deals: z.array(CrmDealPublicSchema),
})
export type CrmDealList = z.infer<typeof CrmDealListSchema>

export const CrmTaskListSchema = z.object({
  synthetic: z.literal(true),
  tenant: TenantSlugSchema,
  tasks: z.array(CrmTaskPublicSchema),
})
export type CrmTaskList = z.infer<typeof CrmTaskListSchema>

export const DlqItemPublicSchema = z.object({
  id: z.string().uuid(),
  leadCaseId: z.string().uuid(),
  fault: CrmFaultSchema,
  attempts: z.number().int().positive(),
  resolvedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
})
export type DlqItemPublic = z.infer<typeof DlqItemPublicSchema>

export const DlqListSchema = z.object({
  synthetic: z.literal(true),
  tenant: TenantSlugSchema,
  items: z.array(DlqItemPublicSchema),
})
export type DlqList = z.infer<typeof DlqListSchema>
