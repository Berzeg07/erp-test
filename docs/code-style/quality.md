# Качество кода

## ESLint + Prettier

- Flat config: корневой `eslint.config.js` (TS + Vue)
- Prettier: `.prettierrc`
- Скрипты: `pnpm lint`, `pnpm lint:fix`, `pnpm format`, `pnpm format:check`

## Правило фичи

Новая фича или смена контракта = **документация (если нужно) + тесты + typecheck** в том же изменении.

Покрытие — не только happy path: ошибки валидации, 401, refresh, staff gates (когда появятся).

| Что менялось | Куда тест |
| ------------ | --------- |
| Zod / shared | `packages/shared/src/*.test.ts` |
| HTTP API | `apps/server/src/modules/**/*.routes.test.ts` |
| Client API / lib | `entities/*/api/*.test.ts`, `shared/**/*.test.ts` |
| Новый API-префикс Vite | `vite.api-prefixes.ts` + smoke в web/admin |

UI-only без логики — тест опционален; typecheck обязателен.

## Чеклист перед merge

1. Обновлены релевантные `docs/` (если менялся контракт)
2. `pnpm typecheck` зелёный
3. `pnpm test` зелёный
4. Для API — route-тесты
5. Новый proxy-префикс — в web и admin

## CI

`.github/workflows/ci.yml`: install → lint → format:check → `ci:prepare` (generate + migrate deploy) → typecheck → test → seed.

Сервисы CI: Postgres + Redis с учётками `app`.

Cursor: `.cursor/rules/max-test-coverage.mdc`, `new-task-workflow.mdc`.
