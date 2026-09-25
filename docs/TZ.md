# AthenAI Lead Engine: Safe Revenue Loop

Канон после ответов HR на четыре уточнения. Разбор простым языком — [../TZ-RAZBOR.md](../TZ-RAZBOR.md). Что кодить сейчас — [dev/coding-slices.md](./dev/coding-slices.md).

Локальный сквозной контур на синтетике: источник → импорт → нормализация → дедуп → evidence → квалификация → черновик → human approval → mock-send → mock-reply → mock CRM → задача менеджеру → воронка и экономика. ИИ не имеет власти: мутное не уходит в письмо и не двигает CRM.

Работодатель проверяет не «сайт», а безопасный revenue-loop для двух tenant на одном сервисе.

---

## Зафиксированные ответы HR

Это уточнение исходного письма, без расширения объёма.

### 1. Статусы и BLOCKED

У `LeadCase` **ровно три** бизнес-статуса: `QUALIFY` | `REJECT` | `MANUAL_REVIEW`.

`BLOCKED` — **не** четвёртый статус карточки. Это `delivery_guard` (разрешение на действие) с причиной: `opt_out`, `suppression`, `prompt_injection`, `forbidden_source`, `unknown_processing_basis` и т.п.

Ожидаемый безопасный итог для opt-out / injection / запретного источника / неясного основания:

- `LeadCase.status = MANUAL_REVIEW`
- `delivery_guard = BLOCKED`
- черновик и mock-send **запрещены**
- человек нужен для разбора и аудита
- opt-out **нельзя** снять автоматически

`REJECT` без блока — «не наш сегмент», не «нельзя писать».

### 2. UI

Минимальный UI **не критерий оценки** у HR. Достаточно HTTP API + OpenAPI/Swagger.

Мы всё равно делаем **немую демо-панель** на Vuetify (`apps/admin`): 7–10 минут записи **без голоса**. Каждый обязательный шаг должен читаться с экрана (заголовок сцены, бейджи, до/после, текст ошибки). Контракт экранов и раскадровка: [dev/screencast.md](./dev/screencast.md).

Срезы API не зависят от UI: сначала контракт и тесты, потом экраны поверх тех же эндпоинтов.

### 3. Единица лида

Сущности: `Person`, `Company`, связь «контакт в компании», `LeadCase`.

Единица лида — пара **контакт × компания внутри одного tenant**.

- Один email в двух компаниях → две `LeadCase`, общий `Person` **только в том же tenant**.
- Если связь человек–компания не подтверждена или противоречива → оба кейса `MANUAL_REVIEW` + conflict в evidence, без draft/send.
- Два сайта у одной компании → одна `Company` с несколькими доменами **только** при external ID или надёжном evidence. Иначе не склеивать: provenance + конфликт + ручной разбор.
- Между tenant **ничего** не склеивается.

### 4. Основание обработки

Отдельные policy/evidence-поля (не юридическое заключение модели):

```text
processing_basis: CONSENT | DOCUMENTED_LEGITIMATE_INTEREST | UNKNOWN | PROHIBITED
processing_basis_evidence_refs: [...]
source_purpose: ...
```

LLM **не может** сама присвоить допустимое основание. Если `UNKNOWN`, нет evidence или `PROHIBITED` → по умолчанию `MANUAL_REVIEW` + `BLOCKED`, без draft и mock-send.

---

## Ограничения (не нарушать)

Только синтетика. Запрещены: реальные контакты и компании, scraping, реальные рассылки, внешние CRM, боевые API-ключи.

По умолчанию проект живёт **без ключей LLM**. Mock-outbox, без SMTP.

Срок теста: 48 часов после сообщения о старте. Рекомендуемый объём: 10–16 часов.

---

## Стек и каркас

Берём монорепу [vue-fastify-starter](D:\Dev\my-projects\vue-fastify-starter). Scope пакетов `@app/` **не переименовываем** (экономия часа).

| Берём | Зачем |
| ------ | ----- |
| `apps/server` Fastify 5 + Prisma + Postgres | API, источник правды |
| `packages/shared` Zod | один контракт API |
| `apps/admin` Vue 3 + Vuetify 3 + FSD | минимальный UI оператора |
| JWT login из шаблона | human approval = аутентифицированный оператор |
| Docker Compose Postgres, ESLint, Prettier, Vitest, CI | качество и запуск |

| Выкидываем | Почему |
| ---------- | ------ |
| `apps/web` | второй SPA не нужен; оператор — одна админка |
| `apps/worker` | idle; retry/DLQ в процессе API + таблица Postgres |
| Redis | очередь не в шаблоне; DLQ в БД |
| слот `apps/site` / Nuxt | нет публичной витрины |
| роли `user` / `moderator` как продуктовая модель | достаточно `admin` (оператор) из seed |

Одна команда локально после форка:

```bash
cp .env.example .env
pnpm install
pnpm docker:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Для сдачи P0: Compose поднимает Postgres + API; админка — `pnpm dev` или тот же compose с сервисом `admin`. Swagger UI на API (например `/docs`).

---

## Tenant

Два учебных клиента **в одной БД и одном процессе**: `athenai_demo`, `proshelf_demo`.

Каждая доменная строка несёт `tenantId`. API: путь `/t/:tenantId/...` **или** обязательный заголовок `X-Tenant-Id` (фиксируем в BOOT-0: **заголовок + проверка, что tenant есть в справочнике**). Чужой id → 404, не 403 с утечкой.

Изоляция: БД, API, логи (`tenant=`), метрики, kill-switch, дедуп, `Person`.

Оператор логинится один раз (seed `admin@app.local`); tenant выбирается в UI/Swagger, не выводится из JWT.

---

## Модель данных

### Справочники

| Сущность | Смысл |
| -------- | ----- |
| `Tenant` | slug, имя, LLM-бюджет (токены), spent, `killSwitchOn`, причина |
| `User` | оператор из стартера (JWT) |
| `Person` | человек внутри tenant; ключ нормализованный email |
| `Company` | фирма внутри tenant; имя, домены[], external ids[] |
| `CompanyContact` | связь person×company в tenant |
| `RawLeadRecord` | исходная строка импорта; **не удаляется** |
| `LeadCase` | рабочее дело по паре контакт×компания |
| `Evidence` | факт + provenance (source, rawId, поле) |
| `DecisionRecord` | policy version, evidence refs, вывод правил, вывод LLM; без секретов и лишнего PII |
| `SuppressionEntry` | стоп-список tenant (email и/или домен) |
| `Draft` | текст + `versionId` + evidence refs; иммутабельная версия |
| `Approval` | привязка к точному `draft.versionId` |
| `OutboxMessage` | mock-send, идемпотентный ключ |
| `InboundReply` | mock-ответ |
| `ManagerTask` | задача человеку |
| `CrmCompany` / `CrmContact` / `CrmDeal` / `CrmTask` | mock CRM, upsert по ключу |
| `CrmOutbox` / `DlqItem` | доставка в CRM, retry, карантин |
| `PaymentEvent` | оплата **только** отдельным событием |
| `MeetingEvent` | встреча отдельным событием (не выводится из positive reply) |

### LeadCase (поля)

- `tenantId`, `personId`, `companyId`, `companyContactId`
- `status`: `QUALIFY` \| `REJECT` \| `MANUAL_REVIEW`
- `deliveryGuard`: `CLEAR` \| `BLOCKED`
- `deliveryGuardReason`: nullable enum
- `processingBasis`, `processingBasisEvidenceRefs`, `sourcePurpose`
- `score`, `confidence`, `reasons[]`, `conflicts[]`
- `policyVersion`

Черновик/send разрешены **только** если `status=QUALIFY` **и** `deliveryGuard=CLEAR` **и** есть approval текущей версии draft. На практике опасные кейсы из п.1 — всегда review+blocked, до QUALIFY не доезжают.

---

## Конвейер

1. **Импорт** CSV / JSON / mock source API → `RawLeadRecord` (идемпотентно по `tenant + source + externalId` или hash строки).
2. **Нормализация** email, домен, имя компании; сырьё хранится as-is.
3. **Резолв** Person / Company / CompanyContact по правилам дедупа; конфликты не молчать.
4. **LeadCase** upsert на пару контакт×компания; сырьё привязать.
5. **Evidence + processing_basis** из правил (не из LLM).
6. **Suppression / opt-out / injection / basis** → guard и статус.
7. Если guard не блок — **детерминированные правила** score/status; затем **LLM-adapter** (совет JSON). Итог ставит код.
8. Если QUALIFY + CLEAR — **draft только из evidence**.
9. Оператор **approve** версии. Правка текста → новая версия, approval сгорает.
10. **mock-send** в outbox (нет сети). Повтор того же ключа без второго касания.
11. **mock-reply** → при необходимости `ManagerTask`; `opt_out` → suppression + BLOCKED.
12. События в **mock CRM** с retry 429/5xx и DLQ; ручной reprocess.
13. **Метрики** синтетические. **Kill-switch** режет LLM и outbound, не импорт.

---

## Правила дедупа (объяснимые)

Порядок силы, всё внутри tenant:

1. `external_id` источника → тот же raw/кейс, если ID уже видели.
2. Домен компании → кандидат `Company`.
3. Нормализованное имя компании → слабый кандидат; без 1–2 не склеивать в одну Company автоматически.
4. Нормализованный email → `Person` в этом tenant.
5. LeadCase = существующая пара Person×Company либо новая.

Не подтверждено / спор → `MANUAL_REVIEW`, conflict в evidence, без draft/send.

---

## Правила квалификации (детерминированные, policy `rules-v1`)

Всегда раньше LLM. Любое из ниже → `MANUAL_REVIEW` + `BLOCKED` (кроме чистого нецелевого REJECT):

| Условие | Итог |
| ------- | ---- |
| `processing_basis` UNKNOWN / PROHIBITED / нет evidence refs | review + blocked, `unknown_processing_basis` |
| opt-out в сырье или suppression | review + blocked, `opt_out` / `suppression`; **черновика нет** |
| prompt injection в свободных полях | review + blocked, `prompt_injection` |
| запретный/неизвестный источник | review + blocked, `forbidden_source` |
| конфликт источников или Person×Company | review, conflict; outbound запрещён пока конфликт жив |
| неполная запись (нет email и нет компании) | review (не QUALIFY) |
| низкая уверенность склейки | review |
| невалидный LLM JSON / timeout / 429 | review, автомат не «додумывает» QUALIFY |
| kill-switch или бюджет LLM | новые LLM-вызовы и mock-send запрещены |

Чистый нецелевой сегмент без запрета контакта → `REJECT`, `deliveryGuard=CLEAR` (писать всё равно не будем: нет QUALIFY → нет draft).

Ясный годный, basis допустим, нет конфликта, нет injection → можно `QUALIFY` + `CLEAR`. LLM только советует; не повышает статус против правил и не ставит basis.

---

## LLM-adapter (P1)

- По умолчанию **mock**, без ключей.
- Строгая JSON-схема (Zod). Сервер валидирует. Ошибка → fallback MANUAL_REVIEW, не парсить «почти JSON».
- Недоверенный ввод (поля лида, enrichment, replies) не может сменить: system prompt, tenant, канал, CTA, approval, бюджет.
- Mock умеет: invalid JSON, timeout, 429, injection-payload в ответе.
- Учёт фейковых токенов; `spent >= budget` → kill-switch `budget_exceeded`, новых вызовов нет.
- `DecisionRecord` хранит совет модели рядом с правилами.

Канал MVP: только `mock_email`. CTA фиксирован политикой, не из текста лида.

---

## Mock-ответы и задачи

Типы: `positive` | `negative` | `question` | `opt_out` | `out_of_office` | `uncertain`.

Задача менеджеру: `question`, `opt_out`, по желанию `uncertain`. Positive **не** создаёт payment и **не** создаёт meeting. Payment и meeting — отдельные POST-события.

---

## Mock CRM

Идемпотентный upsert:

- company: `tenant + domain` (или crm key)
- contact: `tenant + email`
- deal: `tenant + leadCaseId`
- task: `tenant + type + leadCaseId` (+ reply id при необходимости)

Retry на 429/5xx с лимитом попыток → DLQ. Reprocess руками: тот же ключ, без дублей. Симуляция сбоя: заголовок или query `X-CRM-Fault: 429|500` в dev.

---

## Метрики (все с флагом `synthetic: true`)

import, unique leads, qualified, manual_review, drafts, approvals, mock_sent, replies, meetings, payments, expenses, human_minutes, cost_per_lead, cost_per_meeting, CAC.

Human minutes — константы политики (например approve = 2 мин, review = 5), не телеметрия мыши.

Kill-switch: ручной `POST` и авто из бюджета. Глушит LLM + mock-send. Импорт и чтение живы. Соседний tenant не трогаем.

---

## Фикстуры

≥ 60 синтетических записей на **двоих** tenant. В наборе обязательно:

- дубли (external id, домен, имя);
- неполные;
- конфликты источников и сомнительная связь человек–компания;
- opt-out / suppression;
- ≥ 3 сегмента бизнеса;
- ответы: positive / negative / нейтраль / question / OOO / uncertain;
- ≥ 5 prompt injection в свободных полях;
- `processing_basis` разных значений, в т.ч. UNKNOWN;
- похожие email **через** tenant (ловушка изоляции).

Открытый набор + `expected-outcomes.json` (статус, guard, склеится ли).

Файлы: `fixtures/leads.json`, `fixtures/leads.csv`, `fixtures/expected-outcomes.json`, `fixtures/suppression.json`. Все записи с `"synthetic": true`.

---

## HTTP API (минимум)

Префикс домена: `/t/:tenantId` **или** header (решение в BOOT-0, одно на весь проект).

- `POST /imports` CSV multipart / JSON body
- `GET /mock-source/leads` — фейковый внешний источник
- `POST /imports/from-mock-source`
- `GET /cases`, `GET /cases/:id` (evidence, raw refs, decisions, guard)
- `POST /cases/:id/qualify` (правила ± LLM)
- `POST /cases/:id/drafts`, `PATCH` текст (новая version, revoke approval)
- `POST /drafts/:versionId/approve`
- `POST /drafts/:versionId/send` — 409 без approval / при BLOCKED / kill-switch
- `POST /replies`
- `POST /events/meetings`, `POST /events/payments`
- `GET /crm/{companies,contacts,deals,tasks}`
- `GET /dlq`, `POST /dlq/:id/reprocess`
- `GET /metrics`
- `POST /kill-switch` `{ on, reason }`
- `GET /tenants/:id/budget`
- OpenAPI `/docs`

Ошибки: стабильные коды `KILL_SWITCH_ACTIVE`, `BUDGET_EXCEEDED`, `DELIVERY_BLOCKED`, `APPROVAL_REQUIRED`, `APPROVAL_STALE`, `TENANT_ISOLATION`.

---

## Минимальный UI (Vuetify, `apps/admin`)

Не критерий оценки HR. Для нас обязателен: **немой скринкаст 7–10 мин**, зритель понимает контур без закадра.

Правила экрана (иначе видео немое не считывается):

- Баннер `SYNTHETIC` всегда в шапке.
- Текущий tenant крупно; переключение `athenai_demo` / `proshelf_demo` одним контролом.
- Перед действием — короткая **плашка сцены** (одна строка, что сейчас происходит). Не тост на 1 секунду, а заголовок блока, который остаётся в кадре.
- Статусы только цветом+подписью: `QUALIFY` / `REJECT` / `MANUAL_REVIEW`. Guard отдельно: `CLEAR` / `BLOCKED` + причина (`opt_out`, `prompt_injection`, …). Не прятать BLOCKED внутрь статуса.
- После мутации сразу **цифры до → после** (импорт: сырых / уникальных; send: outbox id).
- Кнопки опасные (`Send`, `Kill-switch`) с итогом на месте: успех (`MOCK-SENT`, id) или отказ (`409 APPROVAL_REQUIRED`) крупным текстом, не только snackbar.
- Версия draft (`v3`) и «approved: yes/no» видны до клика Send.
- CRM-блок: компания / контакт / сделка / задача одним id после повтора — чтобы было видно «не размножилось».
- Никакого канбана, графиков, Bitrix-клона, `apps/web`.

### Экраны (ровно под видео)

| Экран | Зачем в немом ролике |
| ----- | -------------------- |
| Login | 10 сек, стартер |
| **Обзор** шапка: tenant + SYNTHETIC + kill-switch + 3 цифры (imported / unique / blocked) | зрителю сразу «два клиента, синтетика, рубильник» |
| **Импорт** | файл / mock source; таблица результата: принято, дубли, unique, review, blocked |
| **Кейсы** список | фильтр по status/guard; строки с именем, компанией, бейджами |
| **Карточка кейса** | сырые записи (не потеряны), evidence, conflict, basis, reasons, score; для дубля — «склеено по domain» |
| **Injection / BLOCKED** | тот же экран: guard=BLOCKED, кнопки Draft и Send disabled + подпись почему |
| **Draft** | текст только из evidence; `versionId`; Approve; Send |
| **Send без approve** | клик Send → на карточке `APPROVAL_REQUIRED`, outbox пуст |
| **Approve → Send** | бейдж версии; `MOCK-SENT`; повтор Send → тот же outbox id |
| **Reply** | тип ответа чипом; задача менеджеру если question/opt_out; opt_out → кейс BLOCKED |
| **CRM + DLQ** | 4 сущности + кнопка «сбой 500» → строка DLQ → Reprocess → тот же deal id |
| **Метрики** | все поля ТЗ, подпись SYNTHETIC; cost per lead / CAC |
| **Kill-switch** | тумблер ON → попытка qualify/send → `KILL_SWITCH_ACTIVE`; переключить tenant — у соседа работает |

Раскадровка по минутам: [dev/screencast.md](./dev/screencast.md).

---

## Автотесты (минимум 18)

Обязательные из письма:

1. повторный импорт  
2. разные типы дублей  
3. конфликт источников  
4. неполная запись  
5. opt-out  
6. prompt injection  
7. невалидный LLM-output  
8. нет approval  
9. изменение draft после approval  
10. повторный mock-send  
11. CRM 429  
12. CRM 5xx  
13. DLQ / reprocess  
14. tenant isolation  
15. suppression list  
16. payment только отдельным событием  
17. budget kill-switch  
18. processing_basis UNKNOWN → review+blocked  

Плюс по возможности: два домена без evidence не склеиваются; email в двух компаниях → два кейса; LLM не ставит CONSENT.

---

## Сдача

- git-история по срезам, не один коммит «всё»
- README: архитектура, запуск, тесты, ограничения, сознательно не сделанное
- `.env.example`, lockfile, Compose
- OpenAPI + схема сущностей
- fixture + expected outcomes
- threat model
- результаты build / lint / tests / security check (audit зависимостей)
- скринкаст 7–10 мин **без голоса** по [dev/screencast.md](./dev/screencast.md)
- `COMMERCIAL.md`, `AI_USAGE.md`, часы, расходы, 3 компромисса

Компромиссы по умолчанию: нет живого LLM; нет `apps/web` и Redis; UI тонкий; human minutes — константы; канал только mock-email.

---

## Threat model (кратко)

| Угроза | Контрмера |
| ------ | --------- |
| Смешение tenant | `tenantId` в каждой строке, фильтр в каждом запросе, тест изоляции |
| Реальная отправка | нет SMTP, только outbox |
| Превью/PII в логах | не логировать сырой email целиком в prod; в тесте синтетика |
| Injection | детектор + BLOCKED; недоверенный текст не в system prompt |
| Approval bypass | send проверяет versionId |
| CRM дубли при retry | upsert keys + DLQ |
| LLM hallucinated basis | basis только правила |
| Утечка ключей | ключей нет в дефолте; `.env` не в git |
