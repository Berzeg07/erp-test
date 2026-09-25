import type { FastifyInstance } from 'fastify'
import { KillSwitchBodySchema, MetricsSchema, TenantBudgetSchema } from '@app/shared'
import { routeDocs, tenantHeaderSchema } from '../../lib/openapi.js'
import { resolveTenant } from '../../lib/tenant.js'
import { getMetrics, setKillSwitch } from './metrics.service.js'

export async function metricsRoutes(app: FastifyInstance) {
  app.register(async (scoped) => {
    scoped.addHook('onRequest', scoped.authenticate)
    scoped.addHook('preHandler', resolveTenant)

    scoped.get(
      '/metrics',
      {
        schema: {
          tags: ['metrics'],
          ...routeDocs.metricsGet,
          security: [{ bearerAuth: [] }],
          headers: tenantHeaderSchema,
        },
      },
      async (request) => MetricsSchema.parse(await getMetrics(request.tenant!)),
    )

    scoped.post(
      '/kill-switch',
      {
        schema: {
          tags: ['metrics'],
          ...routeDocs.killSwitchPost,
          security: [{ bearerAuth: [] }],
          headers: tenantHeaderSchema,
          body: {
            type: 'object',
            required: ['on'],
            properties: {
              on: { type: 'boolean' },
              reason: { type: 'string', minLength: 1, maxLength: 80 },
            },
          },
        },
      },
      async (request, reply) => {
        const parsed = KillSwitchBodySchema.safeParse(request.body)
        if (!parsed.success) {
          return reply.code(400).send({ error: 'VALIDATION_ERROR' })
        }
        return TenantBudgetSchema.parse(await setKillSwitch(request.tenant!, parsed.data.on, parsed.data.reason))
      },
    )
  })
}
