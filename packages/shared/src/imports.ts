import { z } from 'zod'
import { RawLeadRecordSchema, TenantSlugSchema } from './fixtures.js'

export const ImportResultSchema = z.object({
  synthetic: z.literal(true),
  tenant: TenantSlugSchema,
  accepted: z.number().int().nonnegative(),
  created: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  skippedOtherTenant: z.number().int().nonnegative(),
  skippedInvalid: z.number().int().nonnegative(),
})
export type ImportResult = z.infer<typeof ImportResultSchema>

export const ImportJsonBodySchema = z.object({
  leads: z.array(z.unknown()),
})
export type ImportJsonBody = z.infer<typeof ImportJsonBodySchema>

export const ImportCsvJsonBodySchema = z.object({
  csv: z.string().min(1),
})
export type ImportCsvJsonBody = z.infer<typeof ImportCsvJsonBodySchema>

export const MockSourceLeadsSchema = z.object({
  synthetic: z.literal(true),
  tenant: TenantSlugSchema,
  leads: z.array(RawLeadRecordSchema),
})
export type MockSourceLeads = z.infer<typeof MockSourceLeadsSchema>

export const RawLeadStoredSchema = z.object({
  id: z.string().uuid(),
  source: z.string(),
  externalId: z.string(),
  fixtureId: z.string().nullable(),
  payload: RawLeadRecordSchema,
})
export type RawLeadStored = z.infer<typeof RawLeadStoredSchema>

export const RawLeadListSchema = z.object({
  synthetic: z.literal(true),
  tenant: TenantSlugSchema,
  records: z.array(RawLeadStoredSchema),
})
export type RawLeadList = z.infer<typeof RawLeadListSchema>
