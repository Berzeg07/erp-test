import {
  DedupResolveResultSchema,
  LeadCaseDetailSchema,
  LeadCaseListSchema,
  RawLeadRecordSchema,
  type DedupResolveResult,
  type LeadCaseDetail,
  type LeadCaseList,
  type RawLeadRecord,
} from '@app/shared'
import type { Prisma } from '@prisma/client'
import type { RequestTenant } from '../../lib/tenant.js'
import { prisma } from '../../lib/prisma.js'
import { normalizeCompanyName, normalizeDomain, normalizeEmail, strongerMergeBy } from './normalize.js'

function asStringArray(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function addUnique(list: string[], item: string): string[] {
  return list.includes(item) ? list : [...list, item]
}

async function resolvePerson(
  tenantId: string,
  payload: RawLeadRecord,
  rawId: string,
): Promise<{ id: string }> {
  const emailNormalized = normalizeEmail(payload.email)
  const identityKey = emailNormalized ?? `anon:${rawId}`
  const displayName = payload.contactName?.trim() || null

  return prisma.person.upsert({
    where: { tenantId_identityKey: { tenantId, identityKey } },
    create: {
      tenantId,
      identityKey,
      emailNormalized,
      displayName,
    },
    update: displayName ? { displayName } : {},
    select: { id: true },
  })
}

async function resolveCompany(
  tenantId: string,
  payload: RawLeadRecord,
  rawId: string,
): Promise<{ id: string; matchedBy: string; reason: string }> {
  const domain = normalizeDomain(payload.domain)
  const byExt = await prisma.companyExternalId.findFirst({
    where: { tenantId, externalId: payload.externalId },
    select: { companyId: true },
  })
  if (byExt) {
    return {
      id: byExt.companyId,
      matchedBy: 'external_id',
      reason: `merged by external_id ${payload.externalId}`,
    }
  }

  if (domain) {
    const byDomain = await prisma.companyDomain.findUnique({
      where: { tenantId_domain: { tenantId, domain } },
      select: { companyId: true },
    })
    if (byDomain) {
      return {
        id: byDomain.companyId,
        matchedBy: 'domain',
        reason: `merged by domain ${domain}`,
      }
    }
  }

  const name = payload.companyName?.trim() || 'Unknown company'
  const nameNormalized = normalizeCompanyName(payload.companyName) || `raw:${rawId}`
  const created = await prisma.company.create({
    data: {
      tenantId,
      name,
      nameNormalized,
    },
    select: { id: true },
  })
  return {
    id: created.id,
    matchedBy: 'none',
    reason: 'new company, no strong match',
  }
}

async function attachCompanyKeys(
  tenantId: string,
  companyId: string,
  payload: RawLeadRecord,
) {
  const domain = normalizeDomain(payload.domain)
  if (domain) {
    const existing = await prisma.companyDomain.findUnique({
      where: { tenantId_domain: { tenantId, domain } },
    })
    if (!existing) {
      await prisma.companyDomain.create({
        data: { tenantId, companyId, domain },
      })
    }
  }

  await prisma.companyExternalId.upsert({
    where: {
      tenantId_source_externalId: {
        tenantId,
        source: payload.source,
        externalId: payload.externalId,
      },
    },
    create: {
      tenantId,
      companyId,
      source: payload.source,
      externalId: payload.externalId,
    },
    update: {},
  })
}

export async function resolveLeadCases(tenant: RequestTenant): Promise<DedupResolveResult> {
  const raws = await prisma.rawLeadRecord.findMany({
    where: { tenantId: tenant.id },
    orderBy: [{ createdAt: 'asc' }, { source: 'asc' }, { externalId: 'asc' }],
  })

  let attachedRaw = 0

  for (const raw of raws) {
    const parsed = RawLeadRecordSchema.safeParse(raw.payload)
    if (!parsed.success) continue
    const payload = parsed.data

    const person = await resolvePerson(tenant.id, payload, raw.id)
    const company = await resolveCompany(tenant.id, payload, raw.id)
    await attachCompanyKeys(tenant.id, company.id, payload)

    const contact = await prisma.companyContact.upsert({
      where: {
        tenantId_personId_companyId: {
          tenantId: tenant.id,
          personId: person.id,
          companyId: company.id,
        },
      },
      create: {
        tenantId: tenant.id,
        personId: person.id,
        companyId: company.id,
      },
      update: {},
      select: { id: true },
    })

    const existingCase = await prisma.leadCase.findUnique({
      where: {
        tenantId_personId_companyId: {
          tenantId: tenant.id,
          personId: person.id,
          companyId: company.id,
        },
      },
    })

    const reasons = addUnique(asStringArray(existingCase?.reasons ?? []), company.reason)
    const mergeBy = strongerMergeBy(existingCase?.mergeBy ?? 'none', company.matchedBy)

    const leadCase = existingCase
      ? await prisma.leadCase.update({
          where: { id: existingCase.id },
          data: {
            mergeBy,
            reasons: reasons as Prisma.InputJsonValue,
          },
        })
      : await prisma.leadCase.create({
          data: {
            tenantId: tenant.id,
            personId: person.id,
            companyId: company.id,
            companyContactId: contact.id,
            mergeBy,
            conflicts: [],
            reasons: reasons as Prisma.InputJsonValue,
          },
        })

    await prisma.rawLeadRecord.update({
      where: { id: raw.id },
      data: { leadCaseId: leadCase.id },
    })
    attachedRaw += 1
  }

  await applyConflicts(tenant.id)

  const [cases, persons, companies] = await Promise.all([
    prisma.leadCase.count({ where: { tenantId: tenant.id } }),
    prisma.person.count({ where: { tenantId: tenant.id } }),
    prisma.company.count({ where: { tenantId: tenant.id } }),
  ])

  return DedupResolveResultSchema.parse({
    synthetic: true,
    tenant: tenant.slug,
    cases,
    persons,
    companies,
    attachedRaw,
  })
}

async function applyConflicts(tenantId: string) {
  const cases = await prisma.leadCase.findMany({
    where: { tenantId },
    include: {
      company: { select: { id: true, nameNormalized: true } },
      rawRecords: { select: { id: true } },
    },
  })

  const byPerson = new Map<string, string[]>()
  const byCompany = new Map<string, string[]>()
  const byName = new Map<string, Set<string>>()

  for (const item of cases) {
    byPerson.set(item.personId, addUnique(byPerson.get(item.personId) ?? [], item.id))
    byCompany.set(item.companyId, addUnique(byCompany.get(item.companyId) ?? [], item.personId))
    const nameSet = byName.get(item.company.nameNormalized) ?? new Set()
    nameSet.add(item.companyId)
    byName.set(item.company.nameNormalized, nameSet)
  }

  const conflictsByCase = new Map<string, string[]>()
  const addConflict = (caseId: string, code: string) => {
    conflictsByCase.set(caseId, addUnique(conflictsByCase.get(caseId) ?? [], code))
  }

  for (const caseIds of byPerson.values()) {
    if (caseIds.length < 2) continue
    for (const caseId of caseIds) addConflict(caseId, 'person_multiple_companies')
  }

  for (const [companyId, personIds] of byCompany.entries()) {
    if (personIds.length < 2) continue
    for (const item of cases) {
      if (item.companyId === companyId) addConflict(item.id, 'company_multiple_contacts')
    }
  }

  for (const companyIds of byName.values()) {
    if (companyIds.size < 2) continue
    for (const item of cases) {
      if (companyIds.has(item.companyId)) addConflict(item.id, 'name_only_overlap')
    }
  }

  for (const item of cases) {
    const conflicts = conflictsByCase.get(item.id) ?? []
    await prisma.leadCase.update({
      where: { id: item.id },
      data: { conflicts: conflicts as Prisma.InputJsonValue },
    })
  }
}

function toSummary(item: {
  id: string
  status: 'QUALIFY' | 'REJECT' | 'MANUAL_REVIEW'
  deliveryGuard: 'CLEAR' | 'BLOCKED'
  mergeBy: string
  conflicts: Prisma.JsonValue
  reasons: Prisma.JsonValue
  person: { id: string; emailNormalized: string | null; displayName: string | null }
  company: { id: string; name: string; domains: { domain: string }[] }
  rawRecords: { id: string }[]
}) {
  return {
    id: item.id,
    status: item.status,
    deliveryGuard: item.deliveryGuard,
    mergeBy: item.mergeBy,
    conflicts: asStringArray(item.conflicts),
    reasons: asStringArray(item.reasons),
    person: {
      id: item.person.id,
      emailNormalized: item.person.emailNormalized,
      displayName: item.person.displayName,
    },
    company: {
      id: item.company.id,
      name: item.company.name,
      domains: item.company.domains.map((row) => row.domain).sort(),
    },
    rawCount: item.rawRecords.length,
  }
}

const caseInclude = {
  person: true,
  company: { include: { domains: true } },
  rawRecords: true,
} as const

export async function listLeadCases(tenant: RequestTenant): Promise<LeadCaseList> {
  const rows = await prisma.leadCase.findMany({
    where: { tenantId: tenant.id },
    include: caseInclude,
    orderBy: { createdAt: 'asc' },
  })

  return LeadCaseListSchema.parse({
    synthetic: true,
    tenant: tenant.slug,
    cases: rows.map(toSummary),
  })
}

export async function getLeadCase(
  tenant: RequestTenant,
  caseId: string,
): Promise<LeadCaseDetail | null> {
  const row = await prisma.leadCase.findFirst({
    where: { id: caseId, tenantId: tenant.id },
    include: caseInclude,
  })
  if (!row) return null

  return LeadCaseDetailSchema.parse({
    ...toSummary(row),
    rawRecords: row.rawRecords.map((raw) => ({
      id: raw.id,
      source: raw.source,
      externalId: raw.externalId,
      fixtureId: raw.fixtureId,
      payload: raw.payload,
    })),
  })
}
