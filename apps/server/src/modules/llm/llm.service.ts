import {
  LlmOutputStoredSchema,
  RawLeadRecordSchema,
  TenantBudgetSchema,
  TenantSlugSchema,
  buildLlmSystemPrompt,
  lockedLlmContext,
  parseLlmJson,
  wrapUntrustedLeadText,
  type LlmMockFault,
  type LlmOutputStored,
  type TenantBudget,
} from '@app/shared'
import { Prisma } from '@prisma/client'
import type { FastifyRequest } from 'fastify'
import type { RequestTenant } from '../../lib/tenant.js'
import { prisma } from '../../lib/prisma.js'
import { detectPromptInjection, untrustedLeadText } from '../policy/injection.js'
import { completeMockLlm } from './mock-adapter.js'

export const LLM_FAULT_HEADER = 'x-llm-fault'

const LLM_ERROR_REASON: Record<'invalid_json' | 'timeout' | 'rate_limited' | 'injection', string> = {
  invalid_json: 'llm_invalid',
  timeout: 'llm_timeout',
  rate_limited: 'llm_rate_limited',
  injection: 'llm_injection',
}

function asStringArray(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function addUnique(list: string[], items: string[]) {
  const next = [...list]
  for (const item of items) {
    if (!next.includes(item)) next.push(item)
  }
  return next
}

function preview(raw: string) {
  return raw.slice(0, 400)
}

export function readLlmFault(request: FastifyRequest): LlmMockFault {
  const raw = request.headers[LLM_FAULT_HEADER]
  const value = Array.isArray(raw) ? raw[0] : raw
  if (value === 'invalid_json' || value === 'timeout' || value === '429' || value === 'injection') {
    return value
  }
  return 'ok'
}

async function persistLlmOutput(
  caseId: string,
  tenantId: string,
  llmOutput: LlmOutputStored,
  status: 'QUALIFY' | 'REJECT' | 'MANUAL_REVIEW',
  extraReasons: string[],
) {
  const item = await prisma.leadCase.findFirstOrThrow({
    where: { id: caseId, tenantId },
    include: { decisionRecord: true },
  })

  const reasons = extraReasons.length > 0 ? addUnique(asStringArray(item.reasons), extraReasons) : asStringArray(item.reasons)

  await prisma.leadCase.update({
    where: { id: caseId },
    data: {
      status,
      reasons: reasons as Prisma.InputJsonValue,
    },
  })

  const parsed = LlmOutputStoredSchema.parse(llmOutput)
  const recordPatch = {
    status,
    reasons: (item.decisionRecord ? addUnique(asStringArray(item.decisionRecord.reasons), extraReasons) : extraReasons) as Prisma.InputJsonValue,
    llmOutput: parsed as Prisma.InputJsonValue,
  }

  if (item.decisionRecord) {
    await prisma.decisionRecord.update({
      where: { id: item.decisionRecord.id },
      data: recordPatch,
    })
    return
  }

  await prisma.decisionRecord.create({
    data: {
      tenantId,
      leadCaseId: caseId,
      policyVersion: item.policyVersion,
      status,
      deliveryGuard: item.deliveryGuard,
      deliveryGuardReason: item.deliveryGuardReason,
      score: item.score,
      confidence: item.confidence,
      reasons: recordPatch.reasons,
      evidenceRefs: item.processingBasisEvidenceRefs as Prisma.InputJsonValue,
      ruleOutput: {} as Prisma.InputJsonValue,
      llmOutput: recordPatch.llmOutput,
    },
  })
}

export async function applyLlmToCase(
  tenant: RequestTenant,
  caseId: string,
  options?: { llmFault?: LlmMockFault },
): Promise<void> {
  const slug = TenantSlugSchema.parse(tenant.slug)
  const locked = lockedLlmContext(slug)
  const fault = options?.llmFault ?? 'ok'

  const item = await prisma.leadCase.findFirst({
    where: { id: caseId, tenantId: tenant.id },
    include: { rawRecords: true },
  })
  if (!item) return

  const tenantRow = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenant.id },
    select: {
      llmTokenBudget: true,
      llmTokenSpent: true,
      killSwitchOn: true,
      killSwitchReason: true,
    },
  })

  if (item.deliveryGuard === 'BLOCKED') {
    await persistLlmOutput(
      item.id,
      tenant.id,
      { kind: 'skipped', reason: 'delivery_blocked', tokensCharged: 0, locked },
      item.status,
      [],
    )
    return
  }

  if (tenantRow.killSwitchOn || tenantRow.llmTokenSpent >= tenantRow.llmTokenBudget) {
    const reason = tenantRow.killSwitchReason === 'budget_exceeded' || tenantRow.llmTokenSpent >= tenantRow.llmTokenBudget
      ? 'budget_exceeded'
      : 'kill_switch'
    if (!tenantRow.killSwitchOn && tenantRow.llmTokenSpent >= tenantRow.llmTokenBudget) {
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { killSwitchOn: true, killSwitchReason: 'budget_exceeded' },
      })
    }
    await persistLlmOutput(item.id, tenant.id, { kind: 'skipped', reason, tokensCharged: 0, locked }, item.status, [])
    return
  }

  const userPrompt = wrapUntrustedLeadText(
    item.rawRecords
      .flatMap((raw) => {
        const parsed = RawLeadRecordSchema.safeParse(raw.payload)
        if (!parsed.success) return []
        return [untrustedLeadText(parsed.data)]
      })
      .join('\n'),
  )
  const systemPrompt = buildLlmSystemPrompt(locked)
  const mock = completeMockLlm({ fault, locked, status: item.status, systemPrompt, userPrompt })

  const charged = await prisma.tenant.update({
    where: { id: tenant.id },
    data: { llmTokenSpent: { increment: mock.tokens } },
    select: { llmTokenSpent: true, llmTokenBudget: true },
  })

  if (charged.llmTokenSpent >= charged.llmTokenBudget) {
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { killSwitchOn: true, killSwitchReason: 'budget_exceeded' },
    })
  }

  if (mock.transport === 'timeout' || mock.transport === 'rate_limited') {
    const error = mock.transport
    await persistLlmOutput(
      item.id,
      tenant.id,
      {
        kind: 'error',
        error,
        tokensCharged: mock.tokens,
        locked,
      },
      item.status === 'QUALIFY' ? 'MANUAL_REVIEW' : item.status,
      item.status === 'QUALIFY' ? [LLM_ERROR_REASON[error]] : [`llm_${error}`],
    )
    return
  }

  const injectedInText = detectPromptInjection(mock.rawText)
  const parsed = injectedInText ? ({ ok: false, error: 'injection' } as const) : parseLlmJson(mock.rawText)

  if (!parsed.ok) {
    await persistLlmOutput(
      item.id,
      tenant.id,
      {
        kind: 'error',
        error: parsed.error,
        tokensCharged: mock.tokens,
        locked,
        rawPreview: preview(mock.rawText),
      },
      item.status === 'QUALIFY' ? 'MANUAL_REVIEW' : item.status,
      item.status === 'QUALIFY' ? [LLM_ERROR_REASON[parsed.error]] : [`llm_${parsed.error}`],
    )
    return
  }

  await persistLlmOutput(
    item.id,
    tenant.id,
    {
      kind: 'advice',
      advice: parsed.advice.advice,
      summary: parsed.advice.summary,
      confidence: parsed.advice.confidence,
      tokensCharged: mock.tokens,
      locked,
    },
    item.status,
    ['llm_advice'],
  )
}

export async function getTenantBudget(tenant: RequestTenant): Promise<TenantBudget> {
  const row = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenant.id },
    select: {
      slug: true,
      llmTokenBudget: true,
      llmTokenSpent: true,
      killSwitchOn: true,
      killSwitchReason: true,
    },
  })

  return TenantBudgetSchema.parse({
    synthetic: true,
    tenant: TenantSlugSchema.parse(row.slug),
    tokenBudget: row.llmTokenBudget,
    tokenSpent: row.llmTokenSpent,
    killSwitchOn: row.killSwitchOn,
    killSwitchReason: row.killSwitchReason,
  })
}
