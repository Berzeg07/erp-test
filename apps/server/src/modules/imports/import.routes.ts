import type { FastifyInstance, FastifyReply } from 'fastify'
import {
  ImportCsvJsonBodySchema,
  ImportJsonBodySchema,
  ImportResultSchema,
  MockSourceLeadsSchema,
  RawLeadListSchema,
  TenantSlugSchema,
} from '@app/shared'
import { ZodError } from 'zod'
import { routeDocs, tenantHeaderSchema } from '../../lib/openapi.js'
import { resolveTenant } from '../../lib/tenant.js'
import { parseCsvLeads } from './import.csv.js'
import { mockSourceLeadsForTenant } from './import.fixtures.js'
import { importRawLeads, listRawLeads } from './import.service.js'

class ImportBodyError extends Error {
  readonly statusCode = 400
  readonly code = 'VALIDATION_ERROR'
}

const importResultSchema = {
  type: 'object',
  required: ['synthetic', 'tenant', 'accepted', 'created', 'updated', 'skippedOtherTenant', 'skippedInvalid'],
  properties: {
    synthetic: { type: 'boolean' },
    tenant: { type: 'string' },
    accepted: { type: 'integer' },
    created: { type: 'integer' },
    updated: { type: 'integer' },
    skippedOtherTenant: { type: 'integer' },
    skippedInvalid: { type: 'integer' },
  },
} as const

function sendImportError(reply: FastifyReply, error: unknown) {
  if (error instanceof ImportBodyError || error instanceof ZodError) {
    return reply.code(400).send({ error: 'VALIDATION_ERROR' })
  }
  throw error
}

const exampleImportLead = {
  id: 'swagger-demo-1',
  tenantSlug: 'athenai_demo',
  source: 'webinar_csv',
  externalId: 'SWAGGER-1',
  companyName: 'Swagger Demo Co',
  domain: 'swagger-demo.example',
  contactName: 'Demo Person',
  email: 'demo@swagger-demo.example',
  segment: 'saas',
  comment: 'Try import from /docs',
  processingBasis: 'CONSENT',
  sourcePurpose: 'webinar_followup',
  optOut: false,
  tags: ['filler'],
}

const importBodySchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    leads: {
      type: 'array',
      description: 'JSON rows (same shape as fixtures/leads.json)',
      items: { type: 'object', additionalProperties: true },
    },
    csv: {
      type: 'string',
      description: 'CSV text instead of leads[]. Same columns as fixtures/leads.csv',
    },
  },
  example: { leads: [exampleImportLead] },
} as const

function parseImportBody(body: unknown): unknown[] {
  if (typeof body === 'string') {
    if (body.trim() === '') {
      throw new ImportBodyError('CSV body is required')
    }
    return parseCsvLeads(body)
  }

  if (typeof body !== 'object' || body === null) {
    throw new ImportBodyError('JSON object or text/csv is required')
  }

  const record = body as Record<string, unknown>
  if (Array.isArray(record.leads)) {
    return ImportJsonBodySchema.parse(record).leads
  }
  if (typeof record.csv === 'string') {
    return parseCsvLeads(ImportCsvJsonBodySchema.parse(record).csv)
  }

  throw new ImportBodyError('Provide leads[] or csv')
}

export async function importRoutes(app: FastifyInstance) {
  app.addContentTypeParser('text/csv', { parseAs: 'string' }, (_request, body, done) => {
    done(null, { csv: body })
  })

  app.register(async (scoped) => {
    scoped.addHook('onRequest', scoped.authenticate)
    scoped.addHook('preHandler', resolveTenant)

    scoped.post(
      '/imports',
      {
        schema: {
          tags: ['imports'],
          ...routeDocs.importsPost,
          security: [{ bearerAuth: [] }],
          headers: tenantHeaderSchema,
          consumes: ['application/json', 'text/csv'],
          body: importBodySchema,
          response: {
            200: importResultSchema,
            400: {
              type: 'object',
              properties: { error: { type: 'string' } },
            },
          },
        },
      },
      async (request, reply) => {
        try {
          const records = parseImportBody(request.body)
          return ImportResultSchema.parse(await importRawLeads(request.tenant!, records))
        } catch (error) {
          return sendImportError(reply, error)
        }
      },
    )

    scoped.get(
      '/mock-source/leads',
      {
        schema: {
          tags: ['imports'],
          ...routeDocs.mockSourceGet,
          security: [{ bearerAuth: [] }],
          headers: tenantHeaderSchema,
        },
      },
      async (request) => {
        const tenant = TenantSlugSchema.parse(request.tenant!.slug)
        return MockSourceLeadsSchema.parse({
          synthetic: true,
          tenant,
          leads: mockSourceLeadsForTenant(tenant),
        })
      },
    )

    scoped.post(
      '/imports/from-mock-source',
      {
        schema: {
          tags: ['imports'],
          ...routeDocs.importsFromMock,
          security: [{ bearerAuth: [] }],
          headers: tenantHeaderSchema,
          response: { 200: importResultSchema },
        },
      },
      async (request) => {
        const tenant = TenantSlugSchema.parse(request.tenant!.slug)
        return ImportResultSchema.parse(await importRawLeads(request.tenant!, mockSourceLeadsForTenant(tenant)))
      },
    )

    scoped.get(
      '/imports/raw',
      {
        schema: {
          tags: ['imports'],
          ...routeDocs.importsRawList,
          security: [{ bearerAuth: [] }],
          headers: tenantHeaderSchema,
        },
      },
      async (request) => RawLeadListSchema.parse(await listRawLeads(request.tenant!)),
    )
  })
}
