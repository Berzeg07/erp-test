# Стек

## Зафиксировано

| Слой | Технология |
| ---- | ---------- |
| Кабинет | нет (`apps/web` удалён) |
| Админка | Vue 3 + Vite + TypeScript + Vuetify 3 |
| UI kit | Vuetify 3 + кастомные **`Ui*`** |
| Стили | SCSS (`sass`): BEM, `to-rem()`, миксины брейкпоинтов |
| Клиентская архитектура | Feature-Sliced Design (FSD) |
| State | Pinia |
| Routing | vue-router |
| Backend | Fastify 5 (Node.js ≥ 22, TypeScript) |
| Валидация | Zod (`packages/shared` + сервер) |
| ORM | Prisma 6 |
| БД | PostgreSQL 16 |
| OpenAPI | `@fastify/swagger` + swagger-ui (`/docs`) |
| Кэш / очередь | нет Redis; DLQ в Postgres |
| Auth | JWT (`@fastify/jwt`) + bcrypt + refresh tokens в Postgres |
| Rate limit | `@fastify/rate-limit` |
| CORS / Helmet | `@fastify/cors`, `@fastify/helmet` (prod) |
| Worker | нет |
| Infra local | Docker Compose (только Postgres) |
| Monorepo | pnpm workspaces |
| Lint / format | ESLint 9 flat + Prettier |
| Tests | Vitest |
| CI | GitHub Actions |

## Сознательно не в шаблоне

| Технология | Почему |
| ---------- | ------ |
| WebSocket | Нет realtime |
| Nuxt / Redis / worker | Сознательно не в Lead Engine |
| PWA | Не нужна |

## Версии (ориентир)

- Node ≥ 22, pnpm 9 (`packageManager` в корневом `package.json`)
- Vue 3.5+, Vite 6, Fastify 5, Prisma 6, Zod 3
