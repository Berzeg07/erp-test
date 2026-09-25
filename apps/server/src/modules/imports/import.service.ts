import {
  ImportResultSchema,
  RawLeadListSchema,
  RawLeadRecordSchema,
  type ImportResult,
  type RawLeadList,
} from '@app/shared'
import type { Prisma } from '@prisma/client'
import type { RequestTenant } from '../../lib/tenant.js'
import { prisma } from '../../lib/prisma.js'

export async function importRawLeads(tenant: RequestTenant, records: unknown[]): Promise<ImportResult> {
  let created = 0
  let updated = 0
  let skippedOtherTenant = 0
  let skippedInvalid = 0
  let accepted = 0

  for (const raw of records) {
    const parsed = RawLeadRecordSchema.safeParse(raw)
    if (!parsed.success) {
      skippedInvalid += 1
      continue
    }

    const lead = parsed.data
    if (lead.tenantSlug !== tenant.slug) {
      skippedOtherTenant += 1
      continue
    }

    accepted += 1
    const key = {
      tenantId: tenant.id,
      source: lead.source,
      externalId: lead.externalId,
    }

    const existing = await prisma.rawLeadRecord.findUnique({
      where: { tenantId_source_externalId: key },
      select: { id: true },
    })

    await prisma.rawLeadRecord.upsert({
      where: { tenantId_source_externalId: key },
      create: {
        ...key,
        fixtureId: lead.id,
        payload: lead as Prisma.InputJsonValue,
      },
      update: {
        fixtureId: lead.id,
        payload: lead as Prisma.InputJsonValue,
      },
    })

    if (existing) updated += 1
    else created += 1
  }

  return ImportResultSchema.parse({
    synthetic: true,
    tenant: tenant.slug,
    accepted,
    created,
    updated,
    skippedOtherTenant,
    skippedInvalid,
  })
}

export async function listRawLeads(tenant: RequestTenant): Promise<RawLeadList> {
  const rows = await prisma.rawLeadRecord.findMany({
    where: { tenantId: tenant.id },
    orderBy: [{ source: 'asc' }, { externalId: 'asc' }, { fixtureId: 'asc' }],
  })

  return RawLeadListSchema.parse({
    synthetic: true,
    tenant: tenant.slug,
    records: rows.map((row) => ({
      id: row.id,
      source: row.source,
      externalId: row.externalId,
      fixtureId: row.fixtureId,
      payload: row.payload,
    })),
  })
}
