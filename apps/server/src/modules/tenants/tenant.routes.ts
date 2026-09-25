import type { FastifyInstance } from 'fastify'
import { TenantListSchema, TenantPublicSchema } from '@app/shared'
import { routeDocs, tenantHeaderSchema } from '../../lib/openapi.js'
import { prisma } from '../../lib/prisma.js'
import { assertSameTenant, resolveTenant } from '../../lib/tenant.js'

const tenantResponseSchema = {
  type: 'object',
  required: ['id', 'slug', 'name'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    slug: { type: 'string' },
    name: { type: 'string' },
  },
} as const

export async function tenantRoutes(app: FastifyInstance) {
  app.get(
    '/tenants',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['tenants'],
        ...routeDocs.tenantsList,
        security: [{ bearerAuth: [] }],
      },
    },
    async () => {
      const tenants = await prisma.tenant.findMany({
        select: { id: true, slug: true, name: true },
        orderBy: { slug: 'asc' },
      })
      return TenantListSchema.parse({ tenants })
    },
  )

  app.register(async (scoped) => {
    scoped.addHook('onRequest', scoped.authenticate)
    scoped.addHook('preHandler', resolveTenant)

    scoped.get(
      '/tenants/current',
      {
        schema: {
          tags: ['tenants'],
          ...routeDocs.tenantsCurrent,
          security: [{ bearerAuth: [] }],
          headers: tenantHeaderSchema,
          response: { 200: tenantResponseSchema },
        },
      },
      async (request) => TenantPublicSchema.parse(request.tenant),
    )

    scoped.get<{ Params: { slug: string } }>(
      '/tenants/:slug',
      {
        schema: {
          tags: ['tenants'],
          ...routeDocs.tenantsBySlug,
          security: [{ bearerAuth: [] }],
          headers: tenantHeaderSchema,
          params: {
            type: 'object',
            required: ['slug'],
            properties: { slug: { type: 'string' } },
          },
          response: { 200: tenantResponseSchema },
        },
      },
      async (request, reply) => {
        if (!assertSameTenant(request, request.params.slug, reply)) return
        return TenantPublicSchema.parse(request.tenant)
      },
    )
  })
}
