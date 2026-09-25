import bcrypt from 'bcryptjs'
import { AuthUserSchema } from '@app/shared'
import { prisma } from '../../lib/prisma.js'
import { toAuthUser } from './auth.mapper.js'

export class AuthError extends Error {
  constructor(
    readonly code: 'INVALID_CREDENTIALS' | 'USER_NOT_FOUND',
    readonly statusCode: number,
  ) {
    super(code)
    this.name = 'AuthError'
  }
}

export async function loginUser(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
  if (!user) throw new AuthError('INVALID_CREDENTIALS', 401)

  const ok = await bcrypt.compare(password, user.passwordHash)
  if (!ok) throw new AuthError('INVALID_CREDENTIALS', 401)

  return { user: AuthUserSchema.parse(toAuthUser(user)), raw: user }
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new AuthError('USER_NOT_FOUND', 404)
  return AuthUserSchema.parse(toAuthUser(user))
}
