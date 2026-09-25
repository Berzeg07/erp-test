import type { FastifyInstance } from 'fastify'
import {
  CrmCompanyListSchema,
  CrmContactListSchema,
  CrmDealListSchema,
  CrmSnapshotSchema,
  CrmSyncBodySchema,
  CrmTaskListSchema,
  DlqListSchema,
} from '@app/shared'
import { routeDocs, tenantHeaderSchema } from '../../lib/openapi.js'
import { TENANT_ISOLATION, resolveTenant } from '../../lib/tenant.js'
import {
  CrmError,
  listCrmCompanies,
  listCrmContacts,
  listCrmDeals,
  listCrmTasks,
  listDlq,
  readCrmFault,
  reprocessDlq,
  syncLeadCase,
} from './crm.service.js'

const crmFaultHeaderSchema = {
  type: 'object',
  properties: {
    'x-tenant-id': tenantHeaderSchema.properties['x-tenant-id'],
    'x-crm-fault': {
      type: 'string',
      enum: ['429', '500'],
      description: 'Только mock. Нет заголовка — upsert проходит. 429 — лимит CRM, 500 — падение. После 3 попыток в одном запросе запись в GET /dlq, сущности не создаются.',
    },
  },
} as const

export async function crmRoutes(app: FastifyInstance) {
  app.register(async (scoped) => {
    scoped.addHook('onRequest', scoped.authenticate)
    scoped.addHook('preHandler', resolveTenant)

    scoped.post(
      '/crm/sync',
      {
        schema: {
          tags: ['crm'],
          ...routeDocs.crmSync,
          security: [{ bearerAuth: [] }],
          headers: crmFaultHeaderSchema,
          body: {
            type: 'object',
            required: ['leadCaseId'],
            properties: { leadCaseId: { type: 'string', format: 'uuid' } },
          },
        },
      },
      async (request, reply) => {
        const parsed = CrmSyncBodySchema.safeParse(request.body)
        if (!parsed.success) {
          return reply.code(400).send({ error: 'VALIDATION_ERROR' })
        }
        try {
          const synced = await syncLeadCase(request.tenant!, parsed.data.leadCaseId, readCrmFault(request))
          if (!synced) {
            return reply.code(404).send({ error: TENANT_ISOLATION })
          }
          return CrmSnapshotSchema.parse(synced)
        } catch (error) {
          if (error instanceof CrmError) {
            return reply.code(error.statusCode).send({ error: error.code })
          }
          throw error
        }
      },
    )

    scoped.get(
      '/crm/companies',
      {
        schema: {
          tags: ['crm'],
          ...routeDocs.crmCompanies,
          security: [{ bearerAuth: [] }],
          headers: tenantHeaderSchema,
        },
      },
      async (request) => CrmCompanyListSchema.parse(await listCrmCompanies(request.tenant!)),
    )

    scoped.get(
      '/crm/contacts',
      {
        schema: {
          tags: ['crm'],
          ...routeDocs.crmContacts,
          security: [{ bearerAuth: [] }],
          headers: tenantHeaderSchema,
        },
      },
      async (request) => CrmContactListSchema.parse(await listCrmContacts(request.tenant!)),
    )

    scoped.get(
      '/crm/deals',
      {
        schema: {
          tags: ['crm'],
          ...routeDocs.crmDeals,
          security: [{ bearerAuth: [] }],
          headers: tenantHeaderSchema,
        },
      },
      async (request) => CrmDealListSchema.parse(await listCrmDeals(request.tenant!)),
    )

    scoped.get(
      '/crm/tasks',
      {
        schema: {
          tags: ['crm'],
          ...routeDocs.crmTasks,
          security: [{ bearerAuth: [] }],
          headers: tenantHeaderSchema,
        },
      },
      async (request) => CrmTaskListSchema.parse(await listCrmTasks(request.tenant!)),
    )

    scoped.get(
      '/dlq',
      {
        schema: {
          tags: ['crm'],
          ...routeDocs.dlqList,
          security: [{ bearerAuth: [] }],
          headers: tenantHeaderSchema,
        },
      },
      async (request) => DlqListSchema.parse(await listDlq(request.tenant!)),
    )

    scoped.post<{ Params: { id: string } }>(
      '/dlq/:id/reprocess',
      {
        schema: {
          tags: ['crm'],
          ...routeDocs.dlqReprocess,
          security: [{ bearerAuth: [] }],
          headers: crmFaultHeaderSchema,
          params: {
            type: 'object',
            required: ['id'],
            properties: { id: { type: 'string', format: 'uuid' } },
          },
        },
      },
      async (request, reply) => {
        try {
          const synced = await reprocessDlq(request.tenant!, request.params.id, readCrmFault(request))
          if (!synced) {
            return reply.code(404).send({ error: TENANT_ISOLATION })
          }
          return CrmSnapshotSchema.parse(synced)
        } catch (error) {
          if (error instanceof CrmError) {
            return reply.code(error.statusCode).send({ error: error.code })
          }
          throw error
        }
      },
    )
  })
}
