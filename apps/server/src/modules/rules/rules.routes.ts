import type { FastifyInstance } from 'fastify'
import { LeadCaseDetailSchema, RulesApplyResultSchema } from '@app/shared'
import { routeDocs, tenantHeaderSchema } from '../../lib/openapi.js'
import { TENANT_ISOLATION, resolveTenant } from '../../lib/tenant.js'
import { getLeadCase } from '../dedup/dedup.service.js'
import { applyRules, applyRulesForCaseId } from './rules.service.js'

export async function rulesRoutes(app: FastifyInstance) {
  app.register(async (scoped) => {
    scoped.addHook('onRequest', scoped.authenticate)
    scoped.addHook('preHandler', resolveTenant)

    scoped.post(
      '/cases/apply-rules',
      {
        schema: {
          tags: ['rules'],
          ...routeDocs.casesApplyRules,
          security: [{ bearerAuth: [] }],
          headers: tenantHeaderSchema,
        },
      },
      async (request) => RulesApplyResultSchema.parse(await applyRules(request.tenant!)),
    )

    scoped.post<{ Params: { id: string } }>(
      '/cases/:id/qualify',
      {
        schema: {
          tags: ['rules'],
          ...routeDocs.casesQualify,
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
        const applied = await applyRulesForCaseId(request.tenant!, request.params.id)
        if (!applied) {
          return reply.code(404).send({ error: TENANT_ISOLATION })
        }
        const detail = await getLeadCase(request.tenant!, applied)
        return LeadCaseDetailSchema.parse(detail)
      },
    )
  })
}
