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
| GET | `/tenants` | JWT | список slug/name (без лидов) |
| GET | `/tenants/current` | JWT + `X-Tenant-Id` | текущий tenant |
| GET | `/tenants/:slug` | JWT + `X-Tenant-Id` | 200 только если заголовок = slug, иначе 404 |
| GET | `/tenants/:slug/budget` | JWT + `X-Tenant-Id` | токены mock-LLM: budget / spent / kill-switch |
| POST | `/imports` | JWT + `X-Tenant-Id` | JSON `{ leads }` / `{ csv }` или `text/csv` → идемпотентный upsert `RawLeadRecord` |
| GET | `/mock-source/leads` | JWT + `X-Tenant-Id` | фикстуры `source=mock_api` только текущего tenant |
| POST | `/imports/from-mock-source` | JWT + `X-Tenant-Id` | импорт из mock-source |
| GET | `/imports/raw` | JWT + `X-Tenant-Id` | сырые записи текущего tenant |
| POST | `/cases/resolve` | JWT + `X-Tenant-Id` | Person/Company/LeadCase из raw, идемпотентно |
| GET | `/cases` | JWT + `X-Tenant-Id` | список кейсов текущего tenant |
| GET | `/cases/:id` | JWT + `X-Tenant-Id` | карточка + raw refs; чужой tenant → 404 |
| POST | `/cases/apply-policy` | JWT + `X-Tenant-Id` | guard, затем rules-v1 и mock-LLM |
| POST | `/cases/apply-rules` | JWT + `X-Tenant-Id` | QUALIFY/REJECT/REVIEW + DecisionRecord + mock-LLM |
| POST | `/cases/:id/qualify` | JWT + `X-Tenant-Id` | то же на одну карточку; чужой id → 404 |
| POST | `/cases/:id/drafts` | JWT + `X-Tenant-Id` | черновик из evidence; BLOCKED → 409 `DELIVERY_BLOCKED` |
| GET | `/cases/:id/drafts` | JWT + `X-Tenant-Id` | версии черновика |
| PATCH | `/drafts/:versionId` | JWT + `X-Tenant-Id` | новый текст = новая версия, старый approval не на ней |
| POST | `/drafts/:versionId/approve` | JWT + `X-Tenant-Id` | approve точного versionId |
| POST | `/suppression/from-fixtures` | JWT | загрузить `fixtures/suppression.json` |
| GET | `/suppression` | JWT + `X-Tenant-Id` | стоп-список текущего tenant |

`deliveryGuard` — не статус карточки. Опасные кейсы: `status=MANUAL_REVIEW` + `BLOCKED` + причина. Чистый годный: `QUALIFY` + `CLEAR`. Resolve в конце: policy, rules-v1, затем mock-LLM (`decision.llmOutput`). Сбой модели не QUALIFY. Канал только `mock_email`, CTA фиксирован политикой. Черновик: только QUALIFY + CLEAR, текст из evidence; BLOCKED → 409 `DELIVERY_BLOCKED`. Send — OUT-1.

Дедуп внутри tenant: один `externalId` (любой source) или один домен → одна Company. Нормализованное имя без домена/id **не** склеивает фирмы. LeadCase = Person × Company; один email в двух фирмах → два кейса. Сырьё не удаляется (`RawLeadRecord.leadCaseId`).

Повторный импорт не размножает строки: ключ `tenant + source + externalId`. Строки другого tenant в файле пропускаются (`skippedOtherTenant`). Ключ `WEB-100` из `webinar_csv` и `partner_json` — две raw-строки.

`X-Tenant-Id` — единственный способ выбрать tenant. Неизвестный slug, нет заголовка, чужой id → **404** `{ error: "TENANT_ISOLATION" }` без тела соседнего tenant.

Логи сериализуют `tenant`, не тела ответов.

Ошибки auth (примеры): `INVALID_CREDENTIALS` (401), `UNAUTHORIZED` (401), `VALIDATION_ERROR` (400), `REFRESH_INVALID` / `REFRESH_EXPIRED` / `REFRESH_REVOKED` (401), `RATE_LIMITED` (429).

Схемы Zod: `@app/shared`.

## Модули

| Путь | Роль |
| ---- | ---- |
| `modules/health` | healthcheck |
| `modules/auth` | login / refresh / logout / me |
| `modules/tenants` | список, current, бюджет mock-LLM, изоляция |
| `modules/imports` | CSV/JSON/mock-source → `RawLeadRecord` |
| `modules/dedup` | нормализация и склейка → `LeadCase` |
| `modules/policy` | deliveryGuard, suppression, injection |
| `modules/rules` | rules-v1, DecisionRecord, QUALIFY/REJECT |
| `modules/llm` | mock-адаптер, Zod-совет, бюджет токенов, kill-switch из бюджета |
| `modules/drafts` | черновик из evidence, версии, approval на versionId |
| `lib/tenant.ts` | `X-Tenant-Id`, 404 `TENANT_ISOLATION` |
| `lib/prisma.ts` | PrismaClient |
| `lib/refresh-token.ts` | create / rotate / revoke |
| `config/env.ts` | env через Zod |

## Тесты

```bash
pnpm --filter @app/server test
```

Env: см. корневой `.env.example` (`DATABASE_URL`, `JWT_SECRET`, `SERVER_PORT`, `CORS_ORIGIN`, `SUPERADMIN_*`). Vitest переключает `DATABASE_URL` на схему `test`, `wipeLeadGraph` не трогает `public`.
