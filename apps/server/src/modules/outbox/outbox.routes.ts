import type { FastifyInstance } from 'fastify'
import { OutboxListSchema } from '@app/shared'
import { routeDocs, tenantHeaderSchema } from '../../lib/openapi.js'
import { resolveTenant } from '../../lib/tenant.js'
import { listOutbox } from './outbox.service.js'

export async function outboxRoutes(app: FastifyInstance) {
  app.register(async (scoped) => {
    scoped.addHook('onRequest', scoped.authenticate)
    scoped.addHook('preHandler', resolveTenant)

    scoped.get(
      '/outbox',
      {
        schema: {
          tags: ['outbox'],
          ...routeDocs.outboxList,
          security: [{ bearerAuth: [] }],
          headers: tenantHeaderSchema,
        },
      },
      async (request) => {
        return OutboxListSchema.parse(await listOutbox(request.tenant!))
      },
    )
  })
}
