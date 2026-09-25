import type { FastifyInstance } from 'fastify'
import { DraftListSchema, DraftPatchBodySchema, DraftVersionPublicSchema, OutboxSendResultSchema } from '@app/shared'
import { routeDocs, tenantHeaderSchema } from '../../lib/openapi.js'
import { TENANT_ISOLATION, resolveTenant } from '../../lib/tenant.js'
import {
  DraftError,
  approveDraftVersion,
  createDraftFromEvidence,
  listDrafts,
  patchDraftVersion,
} from './draft.service.js'
import { OutboxError, sendDraftVersion } from '../outbox/outbox.service.js'

export async function draftRoutes(app: FastifyInstance) {
  app.register(async (scoped) => {
    scoped.addHook('onRequest', scoped.authenticate)
    scoped.addHook('preHandler', resolveTenant)

    scoped.post<{ Params: { id: string } }>(
      '/cases/:id/drafts',
      {
        schema: {
          tags: ['drafts'],
          ...routeDocs.casesCreateDraft,
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
        try {
          const created = await createDraftFromEvidence(request.tenant!, request.params.id)
          if (!created) {
            return reply.code(404).send({ error: TENANT_ISOLATION })
          }
          return DraftVersionPublicSchema.parse(created)
        } catch (error) {
          if (error instanceof DraftError) {
            return reply.code(error.statusCode).send({ error: error.code })
          }
          throw error
        }
      },
    )

    scoped.get<{ Params: { id: string } }>(
      '/cases/:id/drafts',
      {
        schema: {
          tags: ['drafts'],
          ...routeDocs.casesListDrafts,
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
        const listed = await listDrafts(request.tenant!, request.params.id)
        if (!listed) {
          return reply.code(404).send({ error: TENANT_ISOLATION })
        }
        return DraftListSchema.parse(listed)
      },
    )

    scoped.patch<{ Params: { versionId: string } }>(
      '/drafts/:versionId',
      {
        schema: {
          tags: ['drafts'],
          ...routeDocs.draftsPatch,
          security: [{ bearerAuth: [] }],
          headers: tenantHeaderSchema,
          params: {
            type: 'object',
            required: ['versionId'],
            properties: { versionId: { type: 'string', format: 'uuid' } },
          },
          body: {
            type: 'object',
            required: ['text'],
            properties: {
              text: { type: 'string', minLength: 1, maxLength: 8000 },
            },
          },
        },
      },
      async (request, reply) => {
        const parsed = DraftPatchBodySchema.safeParse(request.body)
        if (!parsed.success) {
          return reply.code(400).send({ error: 'VALIDATION_ERROR' })
        }
        const created = await patchDraftVersion(request.tenant!, request.params.versionId, parsed.data.text)
        if (!created) {
          return reply.code(404).send({ error: TENANT_ISOLATION })
        }
        return DraftVersionPublicSchema.parse(created)
      },
    )

    scoped.post<{ Params: { versionId: string } }>(
      '/drafts/:versionId/approve',
      {
        schema: {
          tags: ['drafts'],
          ...routeDocs.draftsApprove,
          security: [{ bearerAuth: [] }],
          headers: tenantHeaderSchema,
          params: {
            type: 'object',
            required: ['versionId'],
            properties: { versionId: { type: 'string', format: 'uuid' } },
          },
        },
      },
      async (request, reply) => {
        const approved = await approveDraftVersion(request.tenant!, request.params.versionId, request.user.sub)
        if (!approved) {
          return reply.code(404).send({ error: TENANT_ISOLATION })
        }
        return DraftVersionPublicSchema.parse(approved)
      },
    )

    scoped.post<{ Params: { versionId: string } }>(
      '/drafts/:versionId/send',
      {
        schema: {
          tags: ['drafts'],
          ...routeDocs.draftsSend,
          security: [{ bearerAuth: [] }],
          headers: tenantHeaderSchema,
          params: {
            type: 'object',
            required: ['versionId'],
            properties: { versionId: { type: 'string', format: 'uuid' } },
          },
        },
      },
      async (request, reply) => {
        try {
          const sent = await sendDraftVersion(request.tenant!, request.params.versionId)
          if (!sent) {
            return reply.code(404).send({ error: TENANT_ISOLATION })
          }
          return OutboxSendResultSchema.parse(sent)
        } catch (error) {
          if (error instanceof OutboxError) {
            return reply.code(error.statusCode).send({ error: error.code })
          }
          throw error
        }
      },
    )
  })
}
