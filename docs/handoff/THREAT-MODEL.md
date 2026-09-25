# Threat model

Черновик из [TZ.md](../TZ.md#threat-model-кратко). Контекст: локальный синтетический MVP, один оператор, два demo-tenant, нет боевых ключей.

## Граница системы

| Внутри | Снаружи (намеренно нет) |
| ------ | ----------------------- |
| Fastify API, админка, Postgres | SMTP, живой LLM, внешняя CRM, интернет-скрапинг |
| JWT оператора + заголовок `X-Tenant-Id` | Tenant из JWT, второй способ выбора квартиры |
| Mock outbox, mock CRM, mock replies | Реальные письма и платежи |

Актор: аутентифицированный оператор (`admin@app.local`). Два клиента (`athenai_demo`, `proshelf_demo`) не должны видеть данные друг друга.

## Угрозы и контрмеры

| ID | Угроза | Что будет, если не закрыть | Контрмера | Где проверить |
| -- | ------ | -------------------------- | --------- | ------------- |
| T1 | Смешение tenant | Лиды соседа в ответе API или в логах | `tenantId` на каждой доменной строке; фильтр в каждом запросе; чужой id / нет заголовка / неизвестный slug → 404 `TENANT_ISOLATION` без тела соседа | матрица п.14, `tenant.routes.test` |
| T2 | Реальная исходящая почта | Спам и PII в сеть | Нет SMTP. Send пишет `OutboxMessage` со статусом `MOCK_SENT` | OUT-1, матрица п.10 |
| T3 | Превью / PII в логах | Email целиком в stdout | В логах поле `tenant`, не тела чужих записей. Данные — синтетика | TENANT-1 |
| T4 | Prompt injection | Текст лида меняет system prompt, канал, CTA, approval | Детектор на свободных полях → `MANUAL_REVIEW` + `BLOCKED` + `prompt_injection`. Недоверенный текст не в system prompt. Draft/send запрещены | матрица п.5, POLICY-1 |
| T5 | Approval bypass | Send без «ок» человека или по старой версии | Send проверяет approval **текущего** `versionId`. Нет approve → `APPROVAL_REQUIRED`. Правка текста → новая версия, старый approval не действует → `APPROVAL_STALE` | матрица п.8–9 |
| T6 | Дубли CRM при retry | Две сделки на один кейс после 429/5xx | Upsert-ключи (`tenant+domain`, `tenant+email`, `tenant+leadCaseId`, …). После 3 попыток — DLQ. Reprocess тем же ключом | матрица п.11–13 |
| T7 | LLM выдумала основание обработки | Модель ставит CONSENT и открывает outbound | `processingBasis` только из сырья/правил. LLM не может повысить статус против rules-v1 и не ставит basis | матрица optional, POLICY-1 / LLM-1 |
| T8 | Утечка ключей | Боевой ключ в git | Ключей LLM нет в дефолте. `.env` в `.gitignore`. В репо — `.env.example` | BOOT-0 |
| T9 | Kill-switch обошли на соседе или оставили send | После «стоп» письма всё равно уходят | Рубильник и бюджет — **на tenant**. Глушит LLM и mock-send этой квартиры. Импорт жив. Сосед не переключается. Если `spent >= budget`, выключить нельзя (fail-closed, `budget_exceeded`) | матрица п.17, METR-1 |
| T10 | Opt-out сняли автоматом | Письмо человеку, который отказался | `opt_out` / suppression → `BLOCKED`. Черновика нет. Снять автоматом нельзя | матрица п.15, REPLY-1 |
| T11 | Payment из «позитивного» ответа | Ложная выручка в метриках | `positive` не создаёт payment/meeting. Только `POST /events/payments` и `POST /events/meetings` | матрица п.16 |
| T12 | Идемпотентность импорта / send | Два касания на одну версию, размножение raw | Импорт: `tenant + source + externalId`. Send: уникальность на `draftVersionId`, повтор возвращает тот же outbox id | матрица п.1, п.10 |
| T13 | Неясное основание → письмо | Outbound без legal basis | `UNKNOWN` / `PROHIBITED` / нет evidence refs → review + `BLOCKED`, без draft/send | матрица п.18 |

## Что сознательно не моделируем

- Атаки на сам Postgres / Docker-хост.
- XSS/CSRF как отдельный трек: админка — тонкое демо, источник правды API.
- Supply-chain сверх `pnpm audit` (см. [security-check.md](./security-check.md)).
- Многопользовательские роли и SSO.

## Остаточный риск

Локальный JWT из `@fastify/jwt` тянет транзитивный `fast-jwt` с известными CVE (алгоритм RSA, пустой HMAC, cache confusion). В этом MVP токены подписываются **симметричным** `JWT_SECRET` из env, не RSA-ключами и не пустым секретом. Это не патч библиотеки: для сдачи зафиксировано в audit, живой прод не планировался.
