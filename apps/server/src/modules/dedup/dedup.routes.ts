import type { FastifyInstance } from 'fastify'
import { DedupResolveResultSchema, LeadCaseDetailSchema, LeadCaseListSchema } from '@app/shared'
import { TENANT_ISOLATION, resolveTenant } from '../../lib/tenant.js'
import { getLeadCase, listLeadCases, resolveLeadCases } from './dedup.service.js'

const tenantHeaderSchema = {
  type: 'object',
  properties: {
    'x-tenant-id': { type: 'string', description: 'Tenant slug, e.g. athenai_demo' },
  },
} as const

export async function dedupRoutes(app: FastifyInstance) {
  app.register(async (scoped) => {
    scoped.addHook('onRequest', scoped.authenticate)
    scoped.addHook('preHandler', resolveTenant)

    scoped.post(
      '/cases/resolve',
      {
        schema: {
          tags: ['cases'],
          summary: 'Resolve Person/Company/LeadCase from stored RawLeadRecord (idempotent)',
          security: [{ bearerAuth: [] }],
          headers: tenantHeaderSchema,
        },
      },
      async (request) => DedupResolveResultSchema.parse(await resolveLeadCases(request.tenant!)),
    )

    scoped.get(
      '/cases',
      {
        schema: {
          tags: ['cases'],
          summary: 'List LeadCase for the current tenant',
          security: [{ bearerAuth: [] }],
          headers: tenantHeaderSchema,
        },
      },
      async (request) => LeadCaseListSchema.parse(await listLeadCases(request.tenant!)),
    )

    scoped.get<{ Params: { id: string } }>(
      '/cases/:id',
      {
        schema: {
          tags: ['cases'],
          summary: 'LeadCase detail with raw refs; 404 if other tenant',
          security: [{ bearerAuth: [] }],
          headers: tenantHeaderSchema,
          params: {
            type: 'object',
            required: ['id'],
            properties: { id: { type: 'string', format: 'uuid' } },
          },
        },
      },
      async (request, reply) => {
        const detail = await getLeadCase(request.tenant!, request.params.id)
        if (!detail) {
          return reply.code(404).send({ error: TENANT_ISOLATION })
        }
        return LeadCaseDetailSchema.parse(detail)
      },
    )
  })
}
