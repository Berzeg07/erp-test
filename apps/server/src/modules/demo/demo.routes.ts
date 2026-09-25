import type { FastifyInstance } from 'fastify'
import { MetricsSchema } from '@app/shared'
import { routeDocs, tenantHeaderSchema } from '../../lib/openapi.js'
import { resolveTenant } from '../../lib/tenant.js'
import { resetTenantDemo } from './demo.service.js'

export async function demoRoutes(app: FastifyInstance) {
  app.register(async (scoped) => {
    scoped.addHook('onRequest', scoped.authenticate)
    scoped.addHook('preHandler', resolveTenant)

    scoped.post(
      '/demo/reset',
      {
        schema: {
          tags: ['demo'],
          ...routeDocs.demoReset,
          security: [{ bearerAuth: [] }],
          headers: tenantHeaderSchema,
        },
      },
      async (request) => MetricsSchema.parse(await resetTenantDemo(request.tenant!)),
    )
  })
}
