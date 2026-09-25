const INJECTION_MARKERS = [
  /ignore previous instructions/i,
  /\bsystem\s*:/i,
  /forget evidence/i,
  /processing_basis\s*=/i,
  /skip human approval/i,
  /delivery_guard\s*=/i,
  /tenant\s*=/i,
  /you are the policy/i,
  /drop system prompt/i,
  /raise the (llm )?budget/i,
  /approve this draft/i,
  /channel\s*=\s*smtp/i,
  /\bcta\s*=/i,
  /admin override/i,
]

export function detectPromptInjection(text: string | undefined): boolean {
  const value = text?.trim() ?? ''
  if (!value) return false
  return INJECTION_MARKERS.some((marker) => marker.test(value))
}

export function untrustedLeadText(payload: {
  comment?: string
  companyName?: string
  contactName?: string
  email?: string
  domain?: string
  sourcePurpose?: string
}): string {
  return [
    payload.comment,
    payload.companyName,
    payload.contactName,
    payload.email,
    payload.domain,
    payload.sourcePurpose,
  ]
    .filter((part): part is string => Boolean(part))
    .join('\n')
}

export function payloadHasPromptInjection(payload: {
  comment?: string
  companyName?: string
  contactName?: string
  email?: string
  domain?: string
  sourcePurpose?: string
  tags?: string[]
}): boolean {
  if (payload.tags?.includes('prompt_injection')) return true
  return detectPromptInjection(untrustedLeadText(payload))
}
