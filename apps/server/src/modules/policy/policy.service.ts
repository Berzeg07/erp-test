import {
  FixtureSuppressionBundleSchema,
  PolicyApplyResultSchema,
  ProcessingBasisSchema,
  RawLeadRecordSchema,
  type PolicyApplyResult,
  type ProcessingBasis,
} from '@app/shared'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Prisma } from '@prisma/client'
import type { RequestTenant } from '../../lib/tenant.js'
import { prisma } from '../../lib/prisma.js'
import { resolveFixturesDir } from '../imports/fixtures-path.js'
import { normalizeEmail } from '../dedup/normalize.js'
import { payloadHasPromptInjection } from './injection.js'

const BASIS_RANK: Record<ProcessingBasis, number> = {
  CONSENT: 1,
  DOCUMENTED_LEGITIMATE_INTEREST: 1,
  UNKNOWN: 2,
  PROHIBITED: 3,
}

function worstBasis(values: ProcessingBasis[]): ProcessingBasis {
  if (values.length === 0) return 'UNKNOWN'
  return values.reduce((worst, item) => (BASIS_RANK[item] > BASIS_RANK[worst] ? item : worst))
}

export function loadFixtureSuppression() {
  const path = join(resolveFixturesDir(), 'suppression.json')
  return FixtureSuppressionBundleSchema.parse(JSON.parse(readFileSync(path, 'utf8')))
}

export async function upsertSuppressionFromFixtures() {
  const bundle = loadFixtureSuppression()
  const tenants = await prisma.tenant.findMany({ select: { id: true, slug: true } })
  const bySlug = new Map(tenants.map((item) => [item.slug, item.id]))
  let upserted = 0

  for (const entry of bundle.entries) {
    const tenantId = bySlug.get(entry.tenantSlug)
    if (!tenantId) continue
    const emailNormalized = normalizeEmail(entry.email)
    if (!emailNormalized) continue
    await prisma.suppressionEntry.upsert({
      where: { tenantId_emailNormalized: { tenantId, emailNormalized } },
      create: { tenantId, emailNormalized, reason: entry.reason },
      update: { reason: entry.reason },
    })
    upserted += 1
  }

  return { synthetic: true as const, upserted }
}

export async function listSuppression(tenant: RequestTenant) {
  const rows = await prisma.suppressionEntry.findMany({
    where: { tenantId: tenant.id },
    orderBy: { emailNormalized: 'asc' },
  })
  return {
    synthetic: true as const,
    tenant: tenant.slug,
    entries: rows.map((row) => ({ emailNormalized: row.emailNormalized, reason: row.reason })),
  }
}

export async function applyPolicy(tenant: RequestTenant): Promise<PolicyApplyResult> {
  const [cases, suppression] = await Promise.all([
    prisma.leadCase.findMany({
      where: { tenantId: tenant.id },
      include: {
        person: { select: { emailNormalized: true } },
        rawRecords: true,
      },
    }),
    prisma.suppressionEntry.findMany({
      where: { tenantId: tenant.id },
      select: { emailNormalized: true, reason: true },
    }),
  ])

  const suppressionByEmail = new Map(suppression.map((row) => [row.emailNormalized, row.reason]))
  let blocked = 0
  let clear = 0

  for (const item of cases) {
    const payloads = item.rawRecords.flatMap((raw) => {
      const parsed = RawLeadRecordSchema.safeParse(raw.payload)
      if (!parsed.success) return []
      return [{ raw, payload: parsed.data }]
    })

    const bases = payloads.map((row) => ProcessingBasisSchema.parse(row.payload.processingBasis))
    const processingBasis = worstBasis(bases)
    const sourcePurpose = payloads.map((row) => row.payload.sourcePurpose).find((value) => value.trim()) ?? ''
    const evidenceRefs = payloads.map((row) => ({
      rawId: row.raw.id,
      field: 'processingBasis',
      source: row.raw.source,
    }))

    const injection = payloads.some(
      (row) => payloadHasPromptInjection(row.payload) || row.payload.tags.includes('prompt_injection'),
    )
    const optOut = payloads.some((row) => row.payload.optOut)
    const email = item.person.emailNormalized
    const suppressionReason = email ? suppressionByEmail.get(email) : undefined
    const missingRefs = evidenceRefs.length === 0

    let deliveryGuardReason: string | null = null
    if (injection) deliveryGuardReason = 'prompt_injection'
    else if (optOut) deliveryGuardReason = 'opt_out'
    else if (suppressionReason) deliveryGuardReason = suppressionReason === 'opt_out' ? 'opt_out' : 'suppression'
    else if (processingBasis === 'UNKNOWN' || processingBasis === 'PROHIBITED' || missingRefs) {
      deliveryGuardReason = 'unknown_processing_basis'
    }

    const blockedNow = deliveryGuardReason !== null
    if (blockedNow) blocked += 1
    else clear += 1

    await prisma.leadCase.update({
      where: { id: item.id },
      data: {
        status: 'MANUAL_REVIEW',
        deliveryGuard: blockedNow ? 'BLOCKED' : 'CLEAR',
        deliveryGuardReason,
        processingBasis,
        sourcePurpose,
        processingBasisEvidenceRefs: evidenceRefs as Prisma.InputJsonValue,
      },
    })
  }

  return PolicyApplyResultSchema.parse({
    synthetic: true,
    tenant: tenant.slug,
    blocked,
    clear,
  })
}
