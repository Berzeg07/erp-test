# Security check (зависимости)

Дата прогона: 2026-09-25. Команда: `pnpm audit` из корня. Сырой вывод: [pnpm-audit.txt](./pnpm-audit.txt).

Локальный синтетический MVP. Зафиксировать находки — требование сдачи; массовый bump каркаса в этот срез не входил.

## Сводка

`pnpm audit` (dev + prod): **11** findings — 3 critical, 3 high, 5 moderate.

`pnpm audit --prod`: **9** findings — 3 critical, 3 high, 3 moderate (без Vitest).

Все critical/high — **транзитивные** пакеты каркаса Fastify 5 / Prisma, не прикладной код лидов.

| Серьёзность | Пакет | Откуда тянется | Зачем нам |
| ----------- | ----- | -------------- | --------- |
| critical ×3, high, moderate ×2 | `fast-jwt@5.0.6` | `@fastify/jwt@9` | JWT оператора. В MVP подпись HS256, секрет из `JWT_SECRET` (≥16 символов в `.env.example`). CVE про RSA public key, пустой HMAC resolver и cache confusion — не тот режим, но библиотека не пропатчена |
| high + moderate | `@fastify/static@9` | `@fastify/swagger-ui` | Раздача UI `/docs`. Path traversal / обход guard на статике Swagger, не на доменных роутах |
| high | `deepmerge-ts@7` | Prisma CLI/config | Стек рекурсивного merge в инструменте Prisma, не в запросах лидов |
| moderate | `vitest@3` / `@vitest/mocker` | devDependencies | Только тесты, не runtime API |

## Как повторить

```bash
pnpm audit
pnpm audit --prod
```

Exit code ≠ 0 при findings — ожидаемо.

## Что не закрывали в DOCS-1

Пин `@fastify/jwt` на ветку с `fast-jwt >= 6.2.4` ломает совместимость Fastify 5 каркаса без отдельного среза. Для take-home: нет публичного интернета на API, один локальный оператор, синтетика.
