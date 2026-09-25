import type { FastifyInstance, FastifyReply } from 'fastify'
import {
  AuthLoginSchema,
  AuthRefreshResponseSchema,
  AuthRefreshSchema,
  AuthSessionSchema,
  type UserRole,
} from '@app/shared'
import { ZodError } from 'zod'
import { routeDocs } from '../../lib/openapi.js'
import { AuthError, getMe, loginUser } from './auth.service.js'
import { toAuthUser } from './auth.mapper.js'
import {
  createRefreshToken,
  RefreshTokenError,
  revokeRefreshToken,
  rotateRefreshToken,
} from '../../lib/refresh-token.js'

type AuthRoutesOptions = {
  authRateLimit: {
    max: number
    timeWindow: number
  }
}

function sendAuthError(
  reply: { code: (status: number) => { send: (body: unknown) => unknown } },
  error: unknown,
) {
  if (error instanceof AuthError) {
    return reply.code(error.statusCode).send({ error: error.code })
  }
  if (error instanceof RefreshTokenError) {
    return reply.code(error.statusCode).send({ error: error.code })
  }
  if (error instanceof ZodError) {
    return reply.code(400).send({ error: 'VALIDATION_ERROR', details: error.flatten() })
  }
  throw error
}

async function issueSession(reply: FastifyReply, userId: string, role: UserRole, user: ReturnType<typeof toAuthUser>) {
  const token = await reply.jwtSign({
    sub: userId,
    role,
  })
  const refresh = await createRefreshToken(userId)

  return AuthSessionSchema.parse({
    token,
    refreshToken: refresh.token,
    user,
  })
}

export async function authRoutes(app: FastifyInstance, options: AuthRoutesOptions) {
  const authRouteConfig = {
    config: {
      rateLimit: options.authRateLimit,
    },
  }

  app.post(
    '/auth/login',
    {
      ...authRouteConfig,
      schema: {
        tags: ['auth'],
        ...routeDocs.authLogin,
        body: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email', default: 'admin@app.local' },
            password: { type: 'string', minLength: 8, default: 'admin12345' },
          },
        },
      },
    },
    async (request, reply) => {
    try {
      const body = AuthLoginSchema.parse(request.body)
      const result = await loginUser(body.email, body.password)
      return issueSession(reply, result.raw.id, result.raw.role, result.user)
    } catch (error) {
      return sendAuthError(reply, error)
    }
  })

  app.post(
    '/auth/refresh',
    {
      ...authRouteConfig,
      schema: {
        tags: ['auth'],
        ...routeDocs.authRefresh,
        body: {
          type: 'object',
          required: ['refreshToken'],
          properties: {
            refreshToken: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
    try {
      const body = AuthRefreshSchema.parse(request.body)
      const rotated = await rotateRefreshToken(body.refreshToken)
      const token = await reply.jwtSign({
        sub: rotated.user.id,
        role: rotated.user.role,
      })
      return AuthRefreshResponseSchema.parse({
        token,
        refreshToken: rotated.refreshToken,
        user: toAuthUser(rotated.user),
      })
    } catch (error) {
      return sendAuthError(reply, error)
    }
  })

  app.post(
    '/auth/logout',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['auth'],
        ...routeDocs.authLogout,
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
    try {
      const body = AuthRefreshSchema.partial().parse(request.body ?? {})
      if (body.refreshToken) {
        await revokeRefreshToken(body.refreshToken)
      }
      return reply.code(204).send()
    } catch (error) {
      return sendAuthError(reply, error)
    }
  })

  app.get(
    '/auth/me',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['auth'],
        ...routeDocs.authMe,
        security: [{ bearerAuth: [] }],
      },
    },
    async (request) => {
    const userId = request.user.sub
    return getMe(userId)
  })
}
