# AthenAI Lead Engine

Локальный **Safe Revenue Loop** на синтетике: импорт → дедуп → квалификация → черновик → human approval → mock-send → mock-reply → mock CRM.

ИИ не имеет власти: мутное не уходит в письмо и не двигает CRM. Реальных контактов, SMTP и ключей LLM нет.

Канон: [docs/TZ.md](./docs/TZ.md). Срезы: [docs/dev/coding-slices.md](./docs/dev/coding-slices.md). Сдача: [docs/handoff/](./docs/handoff/).

## Архитектура

Один процесс API + одна админка + Postgres. Два учебных клиента в одной БД: `athenai_demo` и `proshelf_demo`. Tenant выбирается заголовком `X-Tenant-Id`, не из JWT.

```
apps/admin (Vue 3 + Vuetify, :5283)
        │  JWT + X-Tenant-Id (Vite proxy)
        ▼
apps/server (Fastify 5 + Prisma, :4101 /docs)
        │
        ▼
PostgreSQL 16  (host :5443, schema public)
```

Контракт Zod — `@app/shared`. Схема сущностей — [apps/server/prisma/schema.prisma](./apps/server/prisma/schema.prisma). OpenAPI — `http://localhost:4101/docs`. Список HTTP: [docs/backend/server.md](./docs/backend/server.md).

Нет `apps/web`, worker и Redis. Retry и DLQ — таблицы Postgres.

Единица лида: **контакт × компания внутри одного tenant**. Сырьё (`RawLeadRecord`) не удаляется.

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
| Postgres (host) | `localhost:5443` |

Порт **5443**, не 5432: на многих машинах 5442 уже занят стартером. Переменные — корневой `.env`, не `apps/server/.env`. Подробнее: [docs/project/local-setup.md](./docs/project/local-setup.md).

Compose поднимает только Postgres. API и админка — `pnpm dev`.

Перед записью скринкаста: Техническое → сброс текущей квартиры, затем импорт фикстуры. Раскадровка: [docs/dev/screencast.md](./docs/dev/screencast.md).

## Фикстуры

| Файл | Содержание |
| ---- | ---------- |
| [fixtures/leads.json](./fixtures/leads.json) | ≥60 синтетических строк на двоих tenant |
| [fixtures/leads.csv](./fixtures/leads.csv) | тот же набор в CSV |
| [fixtures/expected-outcomes.json](./fixtures/expected-outcomes.json) | ожидаемые status / guard / склейка |
| [fixtures/suppression.json](./fixtures/suppression.json) | стоп-список |

В наборе: дубли, injection, opt-out, UNKNOWN basis, неполные, два tenant.

## Тесты и проверки

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm audit
```

18 обязательных сюжетов HR — имена в [apps/server/src/modules/matrix/hr-matrix.routes.test.ts](./apps/server/src/modules/matrix/hr-matrix.routes.test.ts). Серверные тесты ходят в схему Postgres `test` и не затирают `public` (Swagger / `pnpm dev`).

CI: [.github/workflows/ci.yml](./.github/workflows/ci.yml) — lint, format, migrate, typecheck, test, seed.

Audit зависимостей: [docs/handoff/security-check.md](./docs/handoff/security-check.md), сырой вывод [docs/handoff/pnpm-audit.txt](./docs/handoff/pnpm-audit.txt).

## Ограничения

- Только синтетика. Нет scraping, боевых CRM, реальной почты.
- LLM — **mock** в процессе API. Бюджет токенов фейковый (`spent >= budget` → kill-switch `budget_exceeded`).
- Канал MVP: только `mock_email`. CTA фиксирован политикой, не текстом лида.
- Kill-switch глушит LLM и mock-send **этой** квартиры. Импорт и чтение живы. Соседа не трогает.
- Human minutes в метриках — константы (approve = 2 мин, review = 5), не телеметрия мыши.
- Оплата и встреча — только отдельные POST, не из ответа `positive`.

## Сознательно не сделано

- Живая модель и ключи провайдера.
- `apps/web`, `apps/worker`, Redis, WebSocket.
- SMTP / реальные каналы кроме mock-email.
- Роли `user` / `moderator` как продуктовая модель (достаточно seed `admin`).
- Снятие opt-out автоматом.
- Склейка компаний только по имени без домена или external id.

Компромиссы и часы: [docs/handoff/COMMERCIAL.md](./docs/handoff/COMMERCIAL.md). Как вёл разработку в Cursor: [docs/handoff/AI_USAGE.md](./docs/handoff/AI_USAGE.md).

## Пакеты

| Пакет | Роль |
| ----- | ---- |
| `@app/server` | Fastify API, Prisma, OpenAPI |
| `@app/admin` | Панель оператора (немое демо) |
| `@app/shared` | Zod-контракты и фикстурные типы |
