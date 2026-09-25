import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { env } from '../config/env.js'
import { prisma } from './prisma.js'

export class RefreshTokenError extends Error {
  constructor(
    readonly code: 'REFRESH_INVALID' | 'REFRESH_EXPIRED' | 'REFRESH_REVOKED' | 'USER_MISSING',
    readonly statusCode: number,
  ) {
    super(code)
    this.name = 'RefreshTokenError'
  }
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function parseDurationMs(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value.trim())
  if (!match) return 30 * 24 * 60 * 60 * 1000
  const amount = Number(match[1])
  const unit = match[2] as 's' | 'm' | 'h' | 'd'
  const multipliers = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  } as const
  return amount * multipliers[unit]
}

function refreshExpiresAt() {
  return new Date(Date.now() + parseDurationMs(env.JWT_REFRESH_EXPIRES_IN))
}

export async function createRefreshToken(userId: string, familyId: string = randomUUID()) {
  const token = randomBytes(32).toString('base64url')
  const tokenHash = hashToken(token)

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash,
      familyId,
      expiresAt: refreshExpiresAt(),
    },
  })

  return { token, familyId }
}

async function revokeFamily(familyId: string) {
  await prisma.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

export async function rotateRefreshToken(refreshToken: string) {
  const tokenHash = hashToken(refreshToken)
  const row = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  })

  if (!row) throw new RefreshTokenError('REFRESH_INVALID', 401)
  if (row.revokedAt) {
    await revokeFamily(row.familyId)
    throw new RefreshTokenError('REFRESH_REVOKED', 401)
  }
  if (row.expiresAt.getTime() <= Date.now()) {
    throw new RefreshTokenError('REFRESH_EXPIRED', 401)
  }
  if (!row.user) throw new RefreshTokenError('USER_MISSING', 401)

  await prisma.refreshToken.update({
    where: { id: row.id },
    data: { revokedAt: new Date() },
  })

  const next = await createRefreshToken(row.userId, row.familyId)
  return { user: row.user, refreshToken: next.token }
}

export async function revokeRefreshToken(refreshToken: string) {
  const tokenHash = hashToken(refreshToken)
  const row = await prisma.refreshToken.findUnique({ where: { tokenHash } })
  if (!row || row.revokedAt) return
  await revokeFamily(row.familyId)
}
