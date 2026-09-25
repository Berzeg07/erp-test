import type { FastifyInstance } from 'fastify'
import { DedupResolveResultSchema, LeadCaseDetailSchema, LeadCaseListSchema } from '@app/shared'
import { llmFaultHeaderSchema, routeDocs, tenantHeaderSchema } from '../../lib/openapi.js'
import { TENANT_ISOLATION, resolveTenant } from '../../lib/tenant.js'
import { readLlmFault } from '../llm/llm.service.js'
import { getLeadCase, listLeadCases, resolveLeadCases } from './dedup.service.js'

export async function dedupRoutes(app: FastifyInstance) {
  app.register(async (scoped) => {
    scoped.addHook('onRequest', scoped.authenticate)
    scoped.addHook('preHandler', resolveTenant)

    scoped.post(
      '/cases/resolve',
      {
        schema: {
          tags: ['cases'],
          ...routeDocs.casesResolve,
          security: [{ bearerAuth: [] }],
          headers: llmFaultHeaderSchema,
        },
      },
      async (request) =>
        DedupResolveResultSchema.parse(
          await resolveLeadCases(request.tenant!, { llmFault: readLlmFault(request) }),
        ),
    )

    scoped.get(
      '/cases',
      {
        schema: {
          tags: ['cases'],
          ...routeDocs.casesList,
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
          ...routeDocs.casesById,
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
