import type { FastifyReply, FastifyRequest } from 'fastify'
import { prisma } from './prisma.js'

export const TENANT_HEADER = 'x-tenant-id'
export const TENANT_ISOLATION = 'TENANT_ISOLATION'

export type RequestTenant = {
  id: string
  slug: string
  name: string
}

function isolation404(reply: FastifyReply) {
  return reply.code(404).send({ error: TENANT_ISOLATION })
}

export async function resolveTenant(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const raw = request.headers[TENANT_HEADER]
  const slug = Array.isArray(raw) ? raw[0] : raw
  const normalized = slug?.trim() ?? ''

  if (!normalized) {
    request.log.info({ tenant: null }, 'tenant header missing')
    return isolation404(reply)
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug: normalized },
    select: { id: true, slug: true, name: true },
  })

  if (!tenant) {
    request.log.info({ tenant: normalized }, 'unknown tenant')
    return isolation404(reply)
  }

  request.tenant = tenant
  request.log = request.log.child({ tenant: tenant.slug })
}

export function assertSameTenant(request: FastifyRequest, resourceTenantSlug: string, reply: FastifyReply): boolean {
  if (!request.tenant || request.tenant.slug !== resourceTenantSlug) {
    request.log.info({ tenant: request.tenant?.slug ?? null }, 'cross-tenant resource denied')
    isolation404(reply)
    return false
  }
  return true
}
