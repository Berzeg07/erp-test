# Архитектура

## Высокий уровень

```
┌─────────────────┐   HTTP + JWT        ┌──────────────────────┐
│  apps/admin     │ ─────────────────►  │  apps/server         │
│  Vue 3 + Vuetify│   Vite proxy        │  Fastify 5           │
│  :5283          │                     │  :4101 /docs         │
└─────────────────┘                     └──────────┬───────────┘
         ▲                                         │
         │  @app/shared (Zod)                      └──── PostgreSQL 16
```

Канон: [TZ.md](../TZ.md). Сдача: [handoff/](../handoff/).

## Принципы

1. Сервер — источник правды.
2. Контракт в `@app/shared`.
3. Long-running Node, не serverless.
4. Postgres = факты. Очереди — таблицы, не Redis.
5. Один фронт: панель оператора. Tenant в заголовке (TENANT-1), не из JWT.
6. Без WebSocket.

## Auth

Как в стартере: login → access + refresh. Seed `admin@app.local`.

Dev proxy: `/auth`, `/health`, `/docs`, `/tenants`, `/imports`, `/mock-source`, `/cases`, `/drafts`, `/outbox`, `/replies`, `/tasks`, `/events`, `/crm`, `/dlq`, `/metrics`, `/kill-switch`, `/suppression`, `/demo` → `:4101`.
