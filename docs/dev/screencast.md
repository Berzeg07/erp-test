# Немой скринкаст 7–10 минут

Контракт UI для сдачи. Голос **не пишем**: зритель читает плашки, бейджи и ошибки. Чеклист HR покрывается этими сценами, не Swagger (Swagger можно мелькнуть в конце на 15 сек как «есть OpenAPI»).

Канон полей: [TZ.md](../TZ.md). Срез реализации: **UI-1** в [coding-slices.md](./coding-slices.md).

## Железо кадра (всегда в кадре)

Шапка админки, не прячется при скролле:

1. `SYNTHETIC DATA` 
2. Tenant: `athenai_demo` | `proshelf_demo`
3. Kill-switch: OFF/ON (цвет)
4. Три числа: imported · unique · blocked

Плашка сцены — `v-alert` или заголовок `h1` на странице, **крупно**, не tooltip. Пример: `Сцена: импорт CSV → дедуп`.

## Раскадровка (уложиться в 7–10 мин)

Молчание между кликами 1–2 сек, чтобы успели прочитать. Не гонять курсор.

| Мин | Сцена | Куда кликать | Что должно быть написано на экране |
| --- | ----- | ------------ | ---------------------------------- |
| 0:00 | Старт | Login → Обзор | SYNTHETIC, tenant `athenai_demo`, switch OFF |
| 0:40 | Импорт | CSV (или «загрузить фикстуру») | Сцена: импорт. После: `raw 40 → unique 28`, из них `review 5`, `blocked 2` |
| 1:20 | Дедуп | Открыть кейс с дублем | Сцена: дедуп. Две raw-строки, одна LeadCase, причина `matched by domain` / `external_id` |
| 2:10 | Injection | Кейс с jailbreak в комментарии | `MANUAL_REVIEW` + `BLOCKED` + `prompt_injection`. Draft и Send **серые**, текст «запрещено: prompt_injection» |
| 3:00 | QUALIFY draft | Чистый кейс | Сцена: черновик. Текст письма, внизу «только evidence». `version v1` · `approved: no` |
| 3:40 | Нет approval | Send | Красная плашка `409 APPROVAL_REQUIRED`. Outbox: пусто |
| 4:10 | Approval | Approve | `approved: yes` · привязка `v1` |
| 4:30 | Правка текста | Изменить слово | Новая `v2`, `approved: no`, подпись «approval отозван» |
| 4:50 | Снова approve + send | Approve v2 → Send | `MOCK-SENT` · outbox id `…` |
| 5:20 | Повтор send | Send ещё раз | Тот же outbox id, `already sent` — не два письма |
| 5:40 | Mock reply | Выбрать `question` (или `positive` + отдельно не payment) | Чип типа. Задача менеджеру видна. Payment = 0 |
| 6:10 | Opt-out reply | На другом кейсе `opt_out` | Guard → BLOCKED, задача «закрыть контакт» |
| 6:40 | CRM сбой | «Симулировать CRM 500» | Строка в DLQ, deal не размножился |
| 7:00 | Reprocess | Reprocess | DLQ пуст, тот же deal id |
| 7:20 | Метрики | Экран Metrics | Все подписи из ТЗ, бейдж SYNTHETIC |
| 8:00 | Kill-switch | ON → Send / Qualify | `KILL_SWITCH_ACTIVE`. Импорт всё ещё можно нажать — 200 (коротко показать) |
| 8:40 | Изоляция | Tenant → `proshelf_demo` | Другие кейсы, switch OFF, Send у соседа жив |
| 9:10 | Запас | OpenAPI `/docs` 10–15 сек | «контракт API» |
| 9:30 | Конец | Обзор | Три числа не нулевые |

Если плывёт по времени — выкинуть мелькание `/docs`, не выкидывать injection, approval, kill-switch, isolation.

## Что не снимать

- Код, терминал, Prisma Studio (кроме аварии).
- Регистрацию, настройки темы.
- Живой LLM, реальную почту.
- Длинный скролл FAQ «о продукте».

## Готовность среза UI-1

Срез закрыт, когда по раскадровке можно пройти **без консоли**: каждая строка таблицы выше имеет видимый текст на экране (бейдж, плашка или disabled+причина).
