import type { FastifyInstance } from 'fastify'
import { PolicyApplyResultSchema, SuppressionListSchema } from '@app/shared'
import { routeDocs, tenantHeaderSchema } from '../../lib/openapi.js'
import { resolveTenant } from '../../lib/tenant.js'
import { applyPolicy, listSuppression, upsertSuppressionFromFixtures } from './policy.service.js'
import { applyRules } from '../rules/rules.service.js'

export async function policyRoutes(app: FastifyInstance) {
  app.post(
    '/suppression/from-fixtures',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['policy'],
        ...routeDocs.suppressionFromFixtures,
        security: [{ bearerAuth: [] }],
      },
    },
    async () => upsertSuppressionFromFixtures(),
  )

  app.register(async (scoped) => {
    scoped.addHook('onRequest', scoped.authenticate)
    scoped.addHook('preHandler', resolveTenant)

    scoped.get(
      '/suppression',
      {
        schema: {
          tags: ['policy'],
          ...routeDocs.suppressionList,
          security: [{ bearerAuth: [] }],
          headers: tenantHeaderSchema,
        },
      },
      async (request) => SuppressionListSchema.parse(await listSuppression(request.tenant!)),
    )

    scoped.post(
      '/cases/apply-policy',
      {
        schema: {
          tags: ['policy'],
          ...routeDocs.casesApplyPolicy,
          security: [{ bearerAuth: [] }],
          headers: tenantHeaderSchema,
        },
      },
      async (request) => {
        const result = await applyPolicy(request.tenant!)
        await applyRules(request.tenant!)
        return PolicyApplyResultSchema.parse(result)
      },
    )
  })
}
