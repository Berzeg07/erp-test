import { z } from 'zod'

export const TenantPublicSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1),
  name: z.string().min(1),
})
export type TenantPublic = z.infer<typeof TenantPublicSchema>

export const TenantListSchema = z.object({
  tenants: z.array(TenantPublicSchema),
})
export type TenantList = z.infer<typeof TenantListSchema>
