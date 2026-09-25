# Локальный запуск

## Доступы после `pnpm db:seed`

| | |
| --- | --- |
| Email | `admin@app.local` |
| Пароль | `admin12345` |
| Роль | `admin` (оператор) |
| Admin | http://localhost:5283/login |
| API health | http://localhost:4101/health |
| OpenAPI | http://localhost:4101/docs |

Переменные seed в `.env`: `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD`, `SUPERADMIN_DISPLAY_NAME`.

## Требования

- Node.js ≥ 22
- pnpm 9
- Docker Desktop (Postgres)

## Шаги

```bash
cp .env.example .env
pnpm install
pnpm docker:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

`pnpm dev` поднимает API (`:4101`), ждёт `GET /health`, затем админку `:5283`.

## URL и порты

| Сервис | URL / порт |
| ------ | ---------- |
| Admin | http://localhost:5283/login |
| API | http://localhost:4101/health |
| Swagger | http://localhost:4101/docs |
| Postgres (host) | `localhost:5443` |

Vite проксирует `/auth`, `/health`, `/docs` на `:4101`.

Порт Postgres по умолчанию **5443** (5442 часто занят стартером).

## Частые проблемы

| Симптом | Что проверить |
| ------- | ------------- |
| `P1001 Can't reach database` | `pnpm docker:up`, `POSTGRES_PORT` / `DATABASE_URL` |
| `P1012 DATABASE_URL` | корневой `.env`; не голый `prisma` без dotenv |
| Vite proxy ECONNREFUSED | сначала API / `pnpm dev` |

## Полезные команды

```bash
pnpm docker:down
pnpm --filter @app/server db:studio
pnpm typecheck
pnpm test
pnpm lint
```

Серверные тесты ходят в схему Postgres `test` и не затирают `public` (Swagger / `pnpm dev`).
