# AthenAI Lead Engine

Локальный **Safe Revenue Loop** на синтетике: импорт лидов → дедуп → квалификация → черновик → human approval → mock-send → mock CRM.

Канон: [docs/TZ.md](./docs/TZ.md). Срезы: [docs/dev/coding-slices.md](./docs/dev/coding-slices.md).

Стек: форк `vue-fastify-starter` — Fastify + Prisma + Postgres + **одна** админка Vue/Vuetify. Нет `apps/web`, worker и Redis.

## Запуск

Требования: Node.js ≥ 22, pnpm 9, Docker Desktop.

```bash
cp .env.example .env
pnpm install
pnpm docker:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

| | |
| --- | --- |
| Админка | http://localhost:5283/login |
| API | http://localhost:4101/health |
| OpenAPI | http://localhost:4101/docs |
| Email / пароль | `admin@app.local` / `admin12345` |

Все данные синтетические. Реальных рассылок и ключей LLM нет.

## Пакеты

| Пакет | Роль |
| ----- | ---- |
| `@app/server` | Fastify API |
| `@app/admin` | Панель оператора (демо без голоса) |
| `@app/shared` | Zod-контракты |
