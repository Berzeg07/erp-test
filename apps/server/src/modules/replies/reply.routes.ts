import type { FastifyInstance } from 'fastify'
import {
  EventBodySchema,
  InboundReplyPublicSchema,
  MeetingEventPublicSchema,
  MeetingListSchema,
  PaymentEventPublicSchema,
  PaymentListSchema,
  ReplyBodySchema,
  ReplyImportResultSchema,
  ReplyListSchema,
  TaskListSchema,
} from '@app/shared'
import { routeDocs, tenantHeaderSchema } from '../../lib/openapi.js'
import { TENANT_ISOLATION, resolveTenant } from '../../lib/tenant.js'
import {
  applyReply,
  importRepliesFromFixtures,
  listMeetings,
  listPayments,
  listReplies,
  listTasks,
  recordMeeting,
  recordPayment,
} from './reply.service.js'

export async function replyRoutes(app: FastifyInstance) {
  app.register(async (scoped) => {
    scoped.addHook('onRequest', scoped.authenticate)
    scoped.addHook('preHandler', resolveTenant)

    scoped.post(
      '/replies/from-fixtures',
      {
        schema: {
          tags: ['replies'],
          ...routeDocs.repliesFromFixtures,
          security: [{ bearerAuth: [] }],
          headers: tenantHeaderSchema,
        },
      },
      async (request) => ReplyImportResultSchema.parse(await importRepliesFromFixtures(request.tenant!)),
    )

    scoped.post(
      '/replies',
      {
        schema: {
          tags: ['replies'],
          ...routeDocs.repliesPost,
          security: [{ bearerAuth: [] }],
          headers: tenantHeaderSchema,
          body: {
            type: 'object',
            required: ['leadCaseId', 'type'],
            properties: {
              leadCaseId: { type: 'string', format: 'uuid' },
              type: {
                type: 'string',
                enum: ['positive', 'negative', 'neutral', 'question', 'opt_out', 'out_of_office', 'uncertain'],
              },
            },
          },
        },
      },
      async (request, reply) => {
        const parsed = ReplyBodySchema.safeParse(request.body)
        if (!parsed.success) {
          return reply.code(400).send({ error: 'VALIDATION_ERROR' })
        }
        const created = await applyReply(request.tenant!, parsed.data.leadCaseId, parsed.data.type)
        if (!created) {
          return reply.code(404).send({ error: TENANT_ISOLATION })
        }
        return InboundReplyPublicSchema.parse(created)
      },
    )

    scoped.get(
      '/replies',
      {
        schema: {
          tags: ['replies'],
          ...routeDocs.repliesList,
          security: [{ bearerAuth: [] }],
          headers: tenantHeaderSchema,
        },
      },
      async (request) => ReplyListSchema.parse(await listReplies(request.tenant!)),
    )

    scoped.get(
      '/tasks',
      {
        schema: {
          tags: ['replies'],
          ...routeDocs.tasksList,
          security: [{ bearerAuth: [] }],
          headers: tenantHeaderSchema,
        },
      },
      async (request) => TaskListSchema.parse(await listTasks(request.tenant!)),
    )

    scoped.post(
      '/events/payments',
      {
        schema: {
          tags: ['events'],
          ...routeDocs.eventsPaymentsPost,
          security: [{ bearerAuth: [] }],
          headers: tenantHeaderSchema,
          body: {
            type: 'object',
            required: ['leadCaseId'],
            properties: { leadCaseId: { type: 'string', format: 'uuid' } },
          },
        },
      },
      async (request, reply) => {
        const parsed = EventBodySchema.safeParse(request.body)
        if (!parsed.success) {
          return reply.code(400).send({ error: 'VALIDATION_ERROR' })
        }
        const created = await recordPayment(request.tenant!, parsed.data.leadCaseId)
        if (!created) {
          return reply.code(404).send({ error: TENANT_ISOLATION })
        }
        return PaymentEventPublicSchema.parse(created)
      },
    )

    scoped.get(
      '/events/payments',
      {
        schema: {
          tags: ['events'],
          ...routeDocs.eventsPaymentsList,
          security: [{ bearerAuth: [] }],
          headers: tenantHeaderSchema,
        },
      },
      async (request) => PaymentListSchema.parse(await listPayments(request.tenant!)),
    )

    scoped.post(
      '/events/meetings',
      {
        schema: {
          tags: ['events'],
          ...routeDocs.eventsMeetingsPost,
          security: [{ bearerAuth: [] }],
          headers: tenantHeaderSchema,
          body: {
            type: 'object',
            required: ['leadCaseId'],
            properties: { leadCaseId: { type: 'string', format: 'uuid' } },
          },
        },
      },
      async (request, reply) => {
        const parsed = EventBodySchema.safeParse(request.body)
        if (!parsed.success) {
          return reply.code(400).send({ error: 'VALIDATION_ERROR' })
        }
        const created = await recordMeeting(request.tenant!, parsed.data.leadCaseId)
        if (!created) {
          return reply.code(404).send({ error: TENANT_ISOLATION })
        }
        return MeetingEventPublicSchema.parse(created)
      },
    )

    scoped.get(
      '/events/meetings',
      {
        schema: {
          tags: ['events'],
          ...routeDocs.eventsMeetingsList,
          security: [{ bearerAuth: [] }],
          headers: tenantHeaderSchema,
        },
      },
      async (request) => MeetingListSchema.parse(await listMeetings(request.tenant!)),
    )
  })
}
