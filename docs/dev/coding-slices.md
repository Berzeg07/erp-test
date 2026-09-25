# Срезы и шаги кодинга

> **Сюда смотреть, когда нужно понять «что кодить сейчас».**  
> Полный канон — [TZ.md](../TZ.md).  
> Этот файл — **короткий трек срезов**: статус, один следующий шаг, что входит / что нет.

Каркас: форк `vue-fastify-starter`. UI — **одна** админка Vuetify (`apps/admin`). Кабинет `apps/web`, worker и Redis **не** тащим.

## Правило синхронизации

| Действие | Где отметить |
| -------- | ------------ |
| Закрыл срез | ✅ **здесь** (таблица «Сейчас» + очередь) |
| Новый микро-срез | строка в очереди; смысл ТЗ не плодить вторым файлом |
| Контракт API/полей | править [TZ.md](../TZ.md), не дублировать длинные схемы сюда |

Закрытие = код + тесты среза + короткое обновление README, если меняется запуск.

**Не делать несколько срезов в одном заходе.** Сначала API/тесты, UI — тонким слоем в конце.

Легенда: ✅ закрыт · 🟡 частично · ⬜ открыт · ⏸ не кодить

---

## Сейчас (ближайший шаг)

| ID | Срез | Статус | Контракт |
| -- | ---- | ------ | -------- |
| **BOOT-0** | Форк стартера, выкинуть лишнее, Swagger, Compose | ✅ | [TZ — стек](../TZ.md#стек-и-каркас) |
| **TENANT-1** | Tenant + заголовок изоляции | ✅ | [TZ — tenant](../TZ.md#tenant) |
| **FIX-1** | Фикстуры ≥60 + expected outcomes | ✅ | [TZ — фикстуры](../TZ.md#фикстуры) |
| **IMP-1** | Импорт CSV / JSON / mock API | ⬜ **текущий** | [TZ — конвейер](../TZ.md#конвейер) |
| **DEDUP-1** | Person, Company, связь, LeadCase, дедуп | ⬜ | [TZ — дедуп](../TZ.md#правила-дедупа-объяснимые) |
| **POLICY-1** | basis, guard, suppression, injection | ⬜ | [TZ — ответы 1 и 4](../TZ.md#зафиксированные-ответы-hr) |
| **RULE-1** | Правила `rules-v1` + DecisionRecord | ⬜ | [TZ — квалификация](../TZ.md#правила-квалификации-детерминированные-policy-rules-v1) |
| **LLM-1** | Mock LLM + схема + бюджет токенов | ⬜ | [TZ — LLM](../TZ.md#llm-adapter-p1) |
| **DRAFT-1** | Draft + approval версии | ⬜ | [TZ — конвейер п.8–9](../TZ.md#конвейер) |
| **OUT-1** | Outbox mock-send идемпотентный | ⬜ | тот же п.10 |
| **REPLY-1** | Mock replies + задачи; payment/meeting события | ⬜ | [TZ — ответы](../TZ.md#mock-ответы-и-задачи) |
| **CRM-1** | Upsert CRM, 429/5xx, DLQ, reprocess | ⬜ | [TZ — CRM](../TZ.md#mock-crm) |
| **METR-1** | Метрики SYNTHETIC + kill-switch | ⬜ | [TZ — метрики](../TZ.md#метрики-все-с-флагом-synthetic-true) |
| **UI-1** | Немая демо-панель Vuetify под скринкаст | ⬜ после METR-1 | [screencast.md](./screencast.md), [TZ — UI](../TZ.md#минимальный-ui-vuetify-appsadmin) |
| **TEST-1** | Добить ≥18 обязательных тестов | ⬜ можно параллельно с UI-1 | [TZ — тесты](../TZ.md#автотесты-минимум-18) |
| **DOCS-1** | README, threat model, COMMERCIAL, AI_USAGE, скринкаст | ⬜ последний | [TZ — сдача](../TZ.md#сдача) |

---

## Очередь шагов (по одному)

### BOOT-0 — каркас

**Что входит**

- Скопировать `vue-fastify-starter` в этот репозиторий (без `node_modules`, `.git`, `dist`, `.env`).
- **Оставить:** `apps/server`, `packages/shared`, `apps/admin` (login + Vuetify + FSD + `Ui*`).
- **Удалить:** `apps/web`, `apps/worker`, Redis из Compose / `.env` / `env.ts` / `index.ts` / `lib/redis.ts` / CI, `ioredis`.
- Выкинуть docs стартера про web/worker/Nuxt **или** заменить оглавлением этого `docs/`.
- `pnpm dev` = API + **только admin** (поправить `scripts/dev.mjs`).
- `@fastify/swagger` + `@fastify/swagger-ui` → `/docs`.
- Health без Redis. Seed оператора оставить.
- Один прогон: `docker:up` → migrate → seed → dev → `/health` и `/login` админки.

**Статус:** ✅ 2026-09-24. Postgres host-порт **5443** (5442 занят `app-postgres` стартера). `/health`, `/docs`, login seed проверены.

**Что нет:** доменные таблицы лидов, экраны продукта, переименование `@app/` в другой scope.

---

### TENANT-1 — изоляция

**Что входит**

- Модель `Tenant`, seed `athenai_demo` и `proshelf_demo`.
- Обязательный `X-Tenant-Id` на доменных роутах (после выбора в BOOT-0 — **этот заголовок**, не плодить второй способ).
- Неизвестный tenant / чужой id ресурса → 404.
- Тест: запись A не читается с заголовком B.
- Логи: поле `tenant`, без тел чужих записей.

**Что нет:** дедуп, импорт файлов, UI-переключатель (UI-1).

**Статус:** ✅ 2026-09-25. Заголовок `X-Tenant-Id`, 404 `TENANT_ISOLATION`, seed двух demo-tenant.

---

### FIX-1 — данные

**Что входит**

- Генератор или статичный набор ≥60 строк на двоих tenant.
- Все ловушки из [фикстур](../TZ.md#фикстуры).
- `expected-outcomes.json` (открытый набор).

**Что нет:** движок квалификации (пока можно помечать expected вручную под будущие правила).

**Статус:** ✅ 2026-09-25. `fixtures/leads.json` + CSV, `expected-outcomes.json`, `suppression.json`. Пересборка: `node scripts/generate-fixtures.mjs`.

---

### IMP-1 — импорт

**Что входит**

- `RawLeadRecord`, повторный импорт без размножения.
- CSV, JSON, `GET /mock-source/leads` + импорт оттуда.
- Тест повторного импорта.

**Что нет:** склейка в Person/Company (заглушка: сырьё лежит, кейсов ещё нет **или** сырой кейс 1:1 — лучше только raw до DEDUP-1).

---

### DEDUP-1 — каркас лида

**Что входит**

- `Person`, `Company`, `CompanyContact`, `LeadCase`.
- Нормализация email/домена/имени.
- Объяснимая склейка; raw не теряется.
- Тесты: типы дублей; email × две компании → два кейса; два домена без evidence не в одну Company; между tenant не клеить.

**Что нет:** LLM, draft, CRM.

---

### POLICY-1 — безопасность действия

**Что входит**

- `processing_basis` + refs + `source_purpose`.
- `deliveryGuard` / reason; suppression list.
- Детектор injection в свободных полях (простые маркеры + список фикстур).
- Opt-out / UNKNOWN / PROHIBITED / injection → `MANUAL_REVIEW` + `BLOCKED`, без draft.
- Тесты: opt-out, suppression, injection, UNKNOWN basis.

**Что нет:** генерация письма, LLM.

---

### RULE-1 — правила

**Что входит**

- Детерминированный `rules-v1`: score, confidence, QUALIFY/REJECT/REVIEW.
- `DecisionRecord` (правила, без секретов).
- Конфликт источников → review, без авто-draft.
- Неполная запись не QUALIFY.
- LLM ещё можно не звать (слот в DecisionRecord пустой).

**Что нет:** адаптер модели.

---

### LLM-1 — mock-модель

**Что входит**

- Адаптер + Zod-схема; mock: ok / invalid JSON / timeout / 429 / injection в ответе.
- Недоверенный текст не меняет tenant/канал/CTA/approval/бюджет.
- Учёт токенов; превышение → запрет новых вызовов.
- Невалидный output → review, не QUALIFY.
- LLM не пишет `processing_basis`.

**Что нет:** живой OpenAI.

---

### DRAFT-1 — письмо и человек

**Что входит**

- Draft **только из evidence**; при BLOCKED эндпоинт 409 `DELIVERY_BLOCKED`.
- Approval на `versionId`.
- PATCH текста → новая версия, старый approval мёртв.
- Тесты: нет approval; правка после ok.

**Что нет:** реальная отправка.

---

### OUT-1 — mock-send

**Что входит**

- Outbox; send без approval → 409; при kill-switch/BLOCKED → 409.
- Идемпотентный повтор send.
- Тест повторного mock-send.

**Что нет:** SMTP, CRM (можно заглушить событие «для CRM» до CRM-1).

---

### REPLY-1 — ответы

**Что входит**

- Импорт mock-ответов шести типов.
- Задачи на question / opt_out.
- `opt_out` → suppression + BLOCKED.
- `POST /events/payments` и meetings; тест: positive reply ≠ payment.

**Что нет:** UI формы ответа (API).

---

### CRM-1 — mock CRM

**Что входит**

- Upsert четырёх сущностей.
- Симуляция 429/5xx, retry, DLQ, reprocess.
- Тесты 429, 5xx, DLQ/reprocess.

**Что нет:** внешний HubSpot.

---

### METR-1 — цифры и рубильник

**Что входит**

- `GET /metrics` с `synthetic: true` и полями из ТЗ.
- Kill-switch ручной + из бюджета; блок LLM и send; импорт жив.
- Тест budget kill-switch; соседний tenant жив.

**Что нет:** графики.

---

### UI-1 — немая демо-панель

Контракт кадра: [screencast.md](./screencast.md). Закрывать срез только если раскадровку можно пройти **без голоса и без Swagger**.

**Что входит** (после живого API)

- Липкая шапка: `SYNTHETIC` · tenant switch · kill-switch · imported/unique/blocked.
- Плашка сцены на каждом экране (`v-alert` / `h1`), не исчезающий тост.
- Импорт: кнопка фикстуры + CSV; блок «до → после» (raw / unique / review / blocked).
- Список кейсов: чипы status и guard **раздельно**; фильтр injection/blocked/duplicate.
- Карточка: raw-строки, «склеено по …», evidence, conflict, basis, reasons; Draft/Send disabled + причина если BLOCKED.
- Draft: `versionId`, `approved yes/no`, «approval отозван» после правки; Send без approve → ошибка **на карточке** (`APPROVAL_REQUIRED`); успех `MOCK-SENT` + id; повтор — тот же id.
- Reply: выбор типа чипами; задача менеджеру; payment не появляется от positive.
- CRM+DLQ: четыре id на одном экране; кнопка «сбой 500»; reprocess.
- Метрики: все поля ТЗ + SYNTHETIC.
- Kill-switch: ON → отказ на том же экране; импорт всё ещё ок; смена tenant — сосед жив.
- `X-Tenant-Id` в `http.ts`; префиксы в `vite.api-prefixes.ts`.

**Что нет:** `apps/web`, канбан, графики, клон CRM, анимации «ради красоты», страница настроек. Login из стартера оставить.

---

### TEST-1 — закрыть матрицу

Добить все 18 обязательных, если дырки остались по срезам. `pnpm test` зелёный. Audit: `pnpm`/npm audit или аналог — артефакт в DOCS-1.

---

### DOCS-1 — сдача

README, OpenAPI уже с BOOT-0, threat model (черновик в TZ дополнить файлом `docs/THREAT-MODEL.md`), COMMERCIAL.md, AI_USAGE.md, часы и 3 компромисса. Скринкаст снять по [screencast.md](./screencast.md), без голоса.

**Что нет:** живая модель, второй фронт, Redis.

---

## Как стартовать задачу агенту

1. Этот файл → строка «Сейчас».
2. Открыть контракт в TZ.
3. Сделать **один** ID.
4. Тесты среза + отметить ✅ здесь.
