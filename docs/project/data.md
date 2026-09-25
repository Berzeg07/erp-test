# Данные

## PostgreSQL + Prisma

- Schema: `apps/server/prisma/schema.prisma`
- Migrations: `apps/server/prisma/migrations/`
- Seed: `apps/server/prisma/seed.ts` (`pnpm db:seed`)

### Модели шаблона

| Модель | Назначение |
| ------ | ---------- |
| `User` | Аккаунт оператора |
| `RefreshToken` | Refresh JWT |
| `Tenant` | Клиент продукта (`athenai_demo`, `proshelf_demo`) |

### Роли

```prisma
enum UserRole {
  user
  moderator
  admin
}
```

| Роль | Смысл в шаблоне |
| ---- | --------------- |
| `user` / `moderator` | не используем в MVP |
| `admin` | оператор панели; создаётся seed’ом |

Seed по умолчанию: один `admin` — [local-setup.md](./local-setup.md).

### Refresh-токены

- В БД хранится **hash**, не сырой токен.
- `familyId` связывает цепочку rotate; повторное использование отозванного токена отзывает всю family.
- TTL задаётся `JWT_REFRESH_EXPIRES_IN` (например `30d`).

## Разделение ответственности

| Хранилище | Что хранит |
| --------- | ---------- |
| PostgreSQL | пользователи, refresh-токены, будущие доменные таблицы |
| Память процесса | runtime Fastify |
| localStorage (браузер) | access + refresh токены админки |

Redis в продукте **нет** (BOOT-0).

## Команды

```bash
pnpm db:generate          # Prisma Client
pnpm db:migrate           # migrate dev (локально)
pnpm db:migrate:deploy    # CI / prod
pnpm db:seed              # SUPERADMIN_* из .env
pnpm --filter @app/server db:studio
```

Всегда через корневые/`db:*` скрипты с dotenv — см. правило `.cursor/rules/prisma-env.mdc`.

## Расширение в продукте

Новые модели — миграциями Prisma, не `db push` как основной путь в prod.  
Мультитенант: закладывайте `userId` (или `tenantId`) на доменных сущностях с первого среза продукта.
