import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { corsOrigins, env } from './config/env.js'
import { authRoutes } from './modules/auth/auth.routes.js'
import { healthRoutes } from './modules/health/health.routes.js'
import { tenantRoutes } from './modules/tenants/tenant.routes.js'
import { importRoutes } from './modules/imports/import.routes.js'
import type { RequestTenant } from './lib/tenant.js'

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; role: string }
    user: { sub: string; role: string }
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>
  }

  interface FastifyRequest {
    tenant?: RequestTenant
  }
}

type BuildServerOptions = {
  logger?: boolean
}

export async function buildServer(options: BuildServerOptions = {}) {
  const enableLogger = options.logger ?? process.env.NODE_ENV !== 'test'

  const app = Fastify({
    ajv: {
      customOptions: {
        keywords: ['example'],
      },
    },
    logger: enableLogger
      ? {
          serializers: {
            req(request) {
              const header = request.headers['x-tenant-id']
              const fromHeader = Array.isArray(header) ? header[0] : header
              return {
                method: request.method,
                url: request.url,
                tenant: request.tenant?.slug ?? fromHeader ?? null,
              }
            },
            res(reply) {
              return { statusCode: reply.statusCode }
            },
          },
        }
      : false,
  })

  if (process.env.NODE_ENV === 'production') {
    await app.register(helmet, {
      contentSecurityPolicy: false,
    })
  }

  await app.register(cors, {
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })

  await app.register(rateLimit, {
    max: process.env.NODE_ENV === 'development' ? 1000 : env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_TIME_WINDOW_MS,
    errorResponseBuilder: () => ({
      statusCode: 429,
      error: 'RATE_LIMITED',
    }),
  })

  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: {
      expiresIn: env.JWT_EXPIRES_IN,
    },
  })

  app.decorate('authenticate', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch {
      return reply.code(401).send({ error: 'UNAUTHORIZED' })
    }
  })

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'AthenAI Lead Engine API',
        description: 'Safe Revenue Loop — synthetic data only. Default mock LLM, no real send.',
        version: '0.1.0',
      },
      tags: [
        { name: 'health', description: 'Liveness' },
        { name: 'auth', description: 'Operator session' },
        { name: 'tenants', description: 'Tenant isolation' },
        { name: 'imports', description: 'Synthetic raw lead import' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  })

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  })

  await app.register(healthRoutes)
  await app.register(authRoutes, {
    authRateLimit: {
      max: process.env.NODE_ENV === 'development' ? 1000 : env.AUTH_RATE_LIMIT_MAX,
      timeWindow: env.AUTH_RATE_LIMIT_TIME_WINDOW_MS,
    },
  })
  await app.register(tenantRoutes)
  await app.register(importRoutes)

  return app
}
