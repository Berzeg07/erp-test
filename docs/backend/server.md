# Сервер (`apps/server`)

## Стек

Fastify 5 + TypeScript + Prisma + JWT + rate-limit + OpenAPI. **Без Redis и WebSocket.**

## Эндпоинты

| Method | Path | Auth | Описание |
| ------ | ---- | ---- | -------- |
| GET | `/health` | нет | `{ ok: true, service: "app-server" }` |
| GET | `/docs` | нет | Swagger UI |
| GET | `/docs/json` | нет | OpenAPI JSON |
| POST | `/auth/login` | нет | `{ email, password }` → session |
| POST | `/auth/refresh` | нет | `{ refreshToken }` → новые token + refresh + user |
| POST | `/auth/logout` | JWT | опционально `{ refreshToken }` — revoke family |
| GET | `/auth/me` | JWT | текущий `AuthUser` |

Доменные роуты лидов появятся со среза TENANT-1.

Ошибки auth (примеры): `INVALID_CREDENTIALS` (401), `UNAUTHORIZED` (401), `VALIDATION_ERROR` (400), `REFRESH_INVALID` / `REFRESH_EXPIRED` / `REFRESH_REVOKED` (401), `RATE_LIMITED` (429).

Схемы Zod: `@app/shared`.

## Модули

| Путь | Роль |
| ---- | ---- |
| `modules/health` | healthcheck |
| `modules/auth` | login / refresh / logout / me |
| `lib/prisma.ts` | PrismaClient |
| `lib/refresh-token.ts` | create / rotate / revoke |
| `config/env.ts` | env через Zod |

## Тесты

```bash
pnpm --filter @app/server test
```

Env: см. корневой `.env.example` (`DATABASE_URL`, `JWT_SECRET`, `SERVER_PORT`, `CORS_ORIGIN`, `SUPERADMIN_*`).
