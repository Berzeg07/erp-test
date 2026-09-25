import type { FastifyInstance } from 'fastify'
import { HealthSchema } from '@app/shared'
import { routeDocs } from '../../lib/openapi.js'

export async function healthRoutes(app: FastifyInstance) {
  app.get(
    '/health',
    {
      schema: {
        tags: ['health'],
        ...routeDocs.health,
        response: {
          200: {
            type: 'object',
            required: ['ok', 'service'],
            properties: {
              ok: { type: 'boolean' },
              service: { type: 'string' },
            },
          },
        },
      },
    },
    async () => {
      return HealthSchema.parse({
        ok: true,
        service: 'app-server',
      })
    },
  )
}
