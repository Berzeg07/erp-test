# Monorepo

pnpm workspaces. Контракты — `@app/shared`.

```
test-erp/
├── apps/
│   ├── admin/               # @app/admin — оператор :5283
│   └── server/              # @app/server — Fastify :4101
├── packages/shared/         # @app/shared — Zod
├── docs/
├── scripts/dev.mjs          # server → health → admin
└── docker-compose.yml       # Postgres
```

| Пакет | Назначение |
| ----- | ---------- |
| `@app/admin` | Панель оператора |
| `@app/server` | API |
| `@app/shared` | Контракты |

`pnpm docker:up` — только Postgres (`lead-engine-postgres`, host **5443**).
