export const openApiInfo = {
  title: 'AthenAI Lead Engine API',
  version: '0.1.0',
  description: [
    'Синтетический MVP **Safe Revenue Loop**: реальных контактов, отправки писем и ключей LLM нет.',
    '',
    '## Как ходить из /docs',
    '',
    '1. `POST /auth/login` (seed: `admin@app.local` / `admin12345`) → в ответе `token`.',
    '2. Кнопка **Authorize** вверху → вставить `token` **без** слова Bearer.',
    '3. На доменных ручках заголовок `x-tenant-id`: квартира данных, не второй логин.',
    '',
    '| Значение | Квартира |',
    '| --- | --- |',
    '| `athenai_demo` | AthenAI Demo |',
    '| `proshelf_demo` | Proshelf Demo |',
    '',
    'Чужой или пустой slug → `404 TENANT_ISOLATION`.',
    '',
    '## Конвейер',
    '',
    '1. Импорт сырья (`POST /imports` или `POST /imports/from-mock-source`).',
    '2. Стоп-список (`POST /suppression/from-fixtures`) — по желанию.',
    '3. `POST /cases/resolve` — склейка, затем policy (`deliveryGuard`), rules-v1 (`status`, `score`, `DecisionRecord`) и mock-LLM (совет в `decision.llmOutput`).',
    '4. Смотреть `GET /cases` / `GET /cases/{id}`.',
    '',
    '## Три разные оси на сырье',
    '',
    'Не путать: основание, отписка и injection — **разные поля**.',
    '',
    '### 1. `processingBasis` — по какому праву держим контакт',
    '',
    'Приходит с импортом или фикстурой. LLM это поле **не ставит** и не «улучшает».',
    '',
    '| Значение | Смысл |',
    '| --- | --- |',
    '| `CONSENT` | согласие зафиксировано |',
    '| `DOCUMENTED_LEGITIMATE_INTEREST` | законный интерес зафиксирован |',
    '| `UNKNOWN` | неясно, откуда строка / можно ли писать |',
    '| `PROHIBITED` | обрабатывать нельзя |',
    '',
    'На карточку копируется **худшее** из привязанных raw:',
    '',
    '1. `PROHIBITED` (самое строгое)',
    '2. `UNKNOWN`',
    '3. `CONSENT` и `DOCUMENTED_LEGITIMATE_INTEREST` (равны)',
    '',
    '`UNKNOWN` / `PROHIBITED` / нет evidence refs → `deliveryGuard=BLOCKED`, причина `unknown_processing_basis`.',
    '',
    '### 2. `optOut` — человек отказался от писем',
    '',
    '- Это **стоп-кран**, не основание.',
    '- Даже при `processingBasis=CONSENT`, если на любой бумажке `optOut=true` → `BLOCKED` / `opt_out`, черновика нет.',
    '- Отдельный стоп-список квартиры: `GET /suppression` (причина `suppression`).',
    '',
    '### 3. injection — приказ системе в свободном тексте',
    '',
    '- Живёт в `comment` и других недоверенных полях, не в основании.',
    '- Это не отзыв с вебинара, а команда: смени tenant, верни QUALIFY, забудь правила.',
    '- Текст **храним**, команду **не выполняем** → `BLOCKED` / `prompt_injection`.',
    '- Тег `prompt_injection` на фикстуре тоже попадание.',
    '',
    '## Поля карточки (не путать)',
    '',
    'Это **два независимых поля** на `LeadCase`. `BLOCKED` не четвёртый статус. `QUALIFY` не значит «уже можно слать», если guard красный.',
    '',
    '### `deliveryGuard` — можно ли действовать',
    '',
    'Ставит **policy** (opt-out, suppression, injection, основание). Смотреть ещё `deliveryGuardReason`.',
    '',
    '| Значение | Смысл |',
    '| --- | --- |',
    '| `CLEAR` | исходящее не запрещено политикой |',
    '| `BLOCKED` | писать нельзя, пока человек не разберёт; черновика нет |',
    '',
    '| `deliveryGuardReason` | Когда |',
    '| --- | --- |',
    '| `null` | guard `CLEAR`, либо конфликт Person×Company (review + BLOCKED без кода причины) |',
    '| `opt_out` | на сырье `optOut=true` |',
    '| `prompt_injection` | приказ в `comment` / тег `prompt_injection` |',
    '| `suppression` | почта в стоп-списке этой квартиры |',
    '| `unknown_processing_basis` | основание `UNKNOWN` / `PROHIBITED` / нет evidence refs |',
    '',
    '### `status` — годность лида (rules-v1)',
    '',
    'Ставят **правила** после policy. Mock-LLM только советует в `decision.llmOutput` и статус против правил не повышает. Невалидный JSON / timeout / 429 / injection в ответе модели → `MANUAL_REVIEW`, не QUALIFY. Основание `processingBasis` модель не пишет.',
    '',
    '| Значение | Смысл | Письмо |',
    '| --- | --- | --- |',
    '| `QUALIFY` | годный: согласие/LI, есть контакт и фирма, нет конфликта | только если ещё `CLEAR` |',
    '| `REJECT` | полный, но нецелевой (не ICP); контакт **не** запрещён | нет (нет QUALIFY → нет draft) |',
    '| `MANUAL_REVIEW` | человеку: неполно, конфликт, низкая уверенность склейки, или любой `BLOCKED` | нет |',
    '',
    'Типичные пары:',
    '',
    '| status | guard | Пример |',
    '| --- | --- | --- |',
    '| `QUALIFY` | `CLEAR` | Ira / Nimbus — можно готовить черновик (DRAFT-1) |',
    '| `REJECT` | `CLEAR` | Personal Hobby — не пишем как нецелевого, это не отписка |',
    '| `MANUAL_REVIEW` | `BLOCKED` | Quiet Harbor, Inject Co, Fog Analytics |',
    '| `MANUAL_REVIEW` | `CLEAR` | слабая склейка по имени (Northwind), без запрета контакта |',
    '',
    'Итого: письмо только при **QUALIFY + CLEAR**.',
    '',
    '## Ориентиры в `GET /cases`',
    '',
    'После импорта и resolve, header `athenai_demo`:',
    '',
    '| Кого искать | Что увидеть |',
    '| --- | --- |',
    '| Ira Sokolova / Nimbus Apps | `CONSENT`, без opt-out/injection → `QUALIFY` + `CLEAR` |',
    '| Fog Analytics / `ub@fog-analytics.example` | `UNKNOWN` → `BLOCKED` / `unknown_processing_basis` |',
    '| Quiet Harbor / `stop@quiet-harbor` | `opt_out` |',
    '| Inject Co | `prompt_injection` |',
    '| Personal Hobby | `REJECT` + `CLEAR` (не ICP, контакт не запрещён) |',
  ].join('\n'),
}

export const openApiTags = [
  { name: 'health', description: 'Живой ли процесс. Без JWT.' },
  { name: 'auth', description: 'Сессия оператора. JWT не выбирает tenant.' },
  { name: 'tenants', description: 'Список квартир и проверка заголовка x-tenant-id.' },
  { name: 'imports', description: 'Склад сырья RawLeadRecord. Смотреть processingBasis, optOut, comment/tags. Карточки отсюда ещё не появляются.' },
  { name: 'cases', description: 'Дедуп: Person, Company, карточка LeadCase. На карточке processingBasis уже «худшее» из raw; guard и status — отдельные поля.' },
  { name: 'policy', description: 'Можно ли действовать. Три оси: processingBasis, optOut/suppression, injection → deliveryGuard CLEAR|BLOCKED.' },
  { name: 'rules', description: 'Квалификация rules-v1: QUALIFY / REJECT / MANUAL_REVIEW + DecisionRecord. Следом mock-LLM пишет llmOutput.' },
]

export const tenantHeaderSchema = {
  type: 'object',
  properties: {
    'x-tenant-id': {
      type: 'string',
      description:
        'Квартира данных (athenai_demo | proshelf_demo). Не логин. Один JWT, другой заголовок → уже другая квартира. Нет/чужой slug → 404 TENANT_ISOLATION.',
      example: 'athenai_demo',
    },
  },
} as const

export const llmFaultHeaderSchema = {
  type: 'object',
  properties: {
    'x-tenant-id': tenantHeaderSchema.properties['x-tenant-id'],
    'x-llm-fault': {
      type: 'string',
      enum: ['invalid_json', 'timeout', '429', 'injection'],
      description:
        'Только mock. Нет заголовка — ответ ok. Сбои: invalid_json (не JSON), timeout, 429, injection (модель пытается сменить tenant/канал/CTA/основание). Живого OpenAI нет.',
    },
  },
} as const

type RouteDoc = { summary: string; description: string }

export const routeDocs = {
  health: {
    summary: 'Проверка, что API живой',
    description:
      'Без JWT. Ответ { ok: true, service: "app-server" }. Если 200 — можно логиниться и ходить в остальные ручки.',
  },
  authLogin: {
    summary: 'Войти оператором и получить JWT',
    description: [
      'Это вход человека-оператора, не выбор компании-клиента.',
      '',
      'Seed: admin@app.local / admin12345. В ответе token — вставить в Authorize (без слова Bearer). Поле refreshToken — для POST /auth/refresh.',
      '',
      'Tenant этим запросом не выбирается. Дальше на доменных ручках нужен заголовок x-tenant-id.',
    ].join('\n'),
  },
  authRefresh: {
    summary: 'Обновить JWT по refreshToken',
    description:
      'Тело: { refreshToken }. Старый refresh гасится, в ответе новая пара token + refreshToken. Authorize после этого надо обновить новым token.',
  },
  authLogout: {
    summary: 'Выйти (погасить refresh, если передали)',
    description: 'Нужен JWT. Если в теле есть refreshToken, семейство refresh отзывается. 204 без тела.',
  },
  authMe: {
    summary: 'Кто сейчас оператор',
    description: 'Нужен JWT. Email/роль сессии. Это не текущий tenant — квартиру смотри GET /tenants/current.',
  },
  tenantsList: {
    summary: 'Список квартир (без лидов)',
    description: [
      'Нужен JWT, x-tenant-id не нужен.',
      '',
      'Ответ — slug/name (athenai_demo, proshelf_demo). Лидов, карточек и сырья здесь нет. Нужен, чтобы знать, какой header дальше ставить.',
    ].join('\n'),
  },
  tenantsCurrent: {
    summary: 'Какая квартира выбрана заголовком',
    description:
      'JWT + x-tenant-id. Эхо выбранного tenant. Нет заголовка / неизвестный slug → 404 TENANT_ISOLATION.',
  },
  tenantsBySlug: {
    summary: 'Карточка tenant, только если header = slug',
    description:
      'JWT + x-tenant-id. 200 только когда параметр пути совпадает с заголовком. Иначе 404 без имени соседа — проверка изоляции, не «не найден».',
  },
  tenantsBudget: {
    summary: 'Бюджет токенов mock-LLM этой квартиры',
    description: [
      'JWT + x-tenant-id. Путь slug = заголовок, иначе 404 TENANT_ISOLATION.',
      '',
      'tokenSpent растёт на каждый вызов mock-модели (250 токенов). spent >= tokenBudget → killSwitchOn, причина budget_exceeded, новых вызовов нет. Соседний tenant не трогаем. Импорт и чтение живы. Ручной POST kill-switch — срез METR-1.',
    ].join('\n'),
  },
  importsPost: {
    summary: 'Положить сырьё (JSON или CSV) на склад',
    description: [
      'Пишет RawLeadRecord, карточки LeadCase не создаёт. Потом нужен POST /cases/resolve.',
      '',
      'В каждой строке три разные оси (не одно поле): processingBasis (право держать контакт: CONSENT / DOCUMENTED_LEGITIMATE_INTEREST / UNKNOWN / PROHIBITED), optOut (отписка, стоп-кран), comment+tags (injection — приказ системе в свободном тексте). LLM основание не ставит.',
      '',
      'Тело: { "leads": [ … ] } или { "csv": "…" } (или Content-Type text/csv). Строки другого tenant в файле не пишутся (skippedOtherTenant). Повтор тех же tenant+source+externalId обновляет, не размножает.',
      '',
      'Пустой Execute без body → 400 VALIDATION_ERROR. Схемы полей — Models внизу страницы /docs (ProcessingBasis, OptOut, PromptInjection).',
    ].join('\n'),
  },
  mockSourceGet: {
    summary: 'Посмотреть mock_api (в базу не пишет)',
    description: [
      'Чтение фикстур source=mock_api текущего tenant. Это не склад и не импорт. В элементе смотреть processingBasis, optOut, comment.',
      '',
      'В comment inject-строк может мелькать текст proshelf_demo — это не чужая квартира. Смотреть поле tenantSlug элемента. Чтобы положить в базу — POST /imports/from-mock-source.',
    ].join('\n'),
  },
  importsFromMock: {
    summary: 'Импорт 18 строк mock_api текущей квартиры',
    description: [
      'Берёт то же, что GET /mock-source/leads, и кладёт на склад. Body не нужен.',
      '',
      'Первый раз: created ≈ 18. Повтор: created 0, updated 18. Другой tenant в этом ответе не импортируется. Карточек ещё нет — дальше POST /cases/resolve.',
    ].join('\n'),
  },
  importsRawList: {
    summary: 'Что лежит на складе сырья',
    description: [
      'JWT + x-tenant-id. Список RawLeadRecord этой квартиры (бумажки as-is). Пусто = ещё не импортировали (не путать с «resolve вернул 0»).',
      '',
      'В payload каждой строки: processingBasis, optOut, comment, tags. Сырьё после дедупа не удаляется — на карточке те же бумажки в rawRecords.',
    ].join('\n'),
  },
  casesResolve: {
    summary: 'Склеить сырьё в людей, фирмы и карточки',
    description: [
      'Команда, не чтение: создаёт Person / Company / LeadCase. JSON — отчёт сколько собрали, не список дел.',
      '',
      'Идемпотентно: повтор не удваивает карточки. Сырьё остаётся (raw.leadCaseId). В конце: policy (deliveryGuard), rules-v1 (status/score/DecisionRecord), затем mock-LLM. Невалидный ответ модели не QUALIFY. Пустой склад → все нули. Список дел: GET /cases.',
    ].join('\n'),
  },
  casesList: {
    summary: 'Список карточек текущей квартиры',
    description: [
      'Чтение LeadCase. Три оси уже свёрнуты в поля карточки:',
      '',
      'processingBasis — худшее основание из привязанных raw (CONSENT / LI / UNKNOWN / PROHIBITED). Не статус.',
      'deliveryGuard / deliveryGuardReason — можно ли действовать. BLOCKED не четвёртый статус. Причины: opt_out (поле raw.optOut), prompt_injection (приказ в comment/tags), suppression (стоп-список), unknown_processing_basis (UNKNOWN/PROHIBITED/нет refs).',
      'status — QUALIFY / REJECT / MANUAL_REVIEW (rules-v1). Письмо только QUALIFY + CLEAR.',
      '',
      'Ещё: score, confidence, mergeBy, conflicts. Ira/Nimbus — чистый CONSENT без opt-out/injection. Fog Analytics — UNKNOWN. Quiet Harbor — opt_out. Inject Co — injection.',
    ].join('\n'),
  },
  casesById: {
    summary: 'Одна карточка и бумажки, из которых склеили',
    description: [
      'Карточка + бумажки, из которых склеили (rawRecords[].payload).',
      '',
      'На каждой бумажке свои processingBasis / optOut / comment. На карточке processingBasis — худшее из них; optOut или injection на любой бумажке блокирует всю карточку. decision.llmOutput — совет mock-модели (или skipped/error), не basis.',
      '',
      'Чужой x-tenant-id на чужой id → 404 TENANT_ISOLATION, без тела соседа.',
    ].join('\n'),
  },
  suppressionFromFixtures: {
    summary: 'Загрузить стоп-список из fixtures/suppression.json',
    description: [
      'Кладёт email в таблицу SuppressionEntry. Карточки сами не блокируются.',
      '',
      'x-tenant-id не нужен: грузятся оба tenant (3 строки). Повтор — upsert, не дубли. Чтобы guard сработал: GET /suppression (проверка списка) → POST /cases/resolve или POST /cases/apply-policy.',
    ].join('\n'),
  },
  suppressionList: {
    summary: 'Стоп-список email этой квартиры',
    description:
      'Только текущий x-tenant-id. У AthenAI есть blocked@muted-mills.example; у Proshelf этого адреса нет. Список пустой, если не грузили POST /suppression/from-fixtures и не было seed.',
  },
  casesApplyPolicy: {
    summary: 'Пересчитать deliveryGuard на уже существующих карточках',
    description: [
      'Не склеивает заново (это resolve). Читает сырьё карточек и ставит deliveryGuard по трём осям (порядок причин BLOCKED):',
      '',
      '1. prompt_injection — приказ в comment/свободных полях или тег prompt_injection.',
      '2. opt_out — raw.optOut=true (отписка). Если email ещё и в стоп-списке с reason opt_out — тоже opt_out.',
      '3. suppression — почта в GET /suppression этого tenant.',
      '4. unknown_processing_basis — processingBasis UNKNOWN или PROHIBITED, либо нет evidence refs.',
      '',
      'CONSENT без этих стоп-сигналов → CLEAR. Это не QUALIFY: статус ставит rules-v1 следом, затем mock-LLM. processingBasis на карточку — худшее из raw, LLM не участвует.',
      '',
      'Resolve уже вызывает policy+rules в конце. Эта ручка нужна, если стоп-список загрузили после resolve.',
    ].join('\n'),
  },
  casesApplyRules: {
    summary: 'Прогнать rules-v1 по всем карточкам квартиры',
    description: [
      'Ставит QUALIFY / REJECT / MANUAL_REVIEW, score, confidence и пишет DecisionRecord. Затем mock-LLM (заголовок x-llm-fault для сбоев). BLOCKED карточки модель не зовут (llmOutput skipped).',
      '',
      'Не импортирует и не склеивает. Resolve уже вызывает это после policy. Нужно, если правила накатили после ручного apply-policy.',
    ].join('\n'),
  },
  casesQualify: {
    summary: 'Квалифицировать одну карточку правилами rules-v1',
    description: [
      'Тот же движок, что POST /cases/apply-rules, но на один id. Body не нужен. Чужой id / чужой tenant → 404 TENANT_ISOLATION.',
      '',
      'Не повышает статус против BLOCKED. Невалидный mock-LLM / timeout / 429 / injection в ответе → MANUAL_REVIEW, не QUALIFY. processingBasis модель не пишет. Нецелевой ICP → REJECT + CLEAR. Слот decision.llmOutput заполняется.',
    ].join('\n'),
  },
} as const satisfies Record<string, RouteDoc>

export const importLeadItemSchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    processingBasis: {
      type: 'string',
      enum: ['CONSENT', 'DOCUMENTED_LEGITIMATE_INTEREST', 'UNKNOWN', 'PROHIBITED'],
      description:
        'Право держать контакт, не статус карточки. CONSENT — согласие. DOCUMENTED_LEGITIMATE_INTEREST — законный интерес. UNKNOWN — неясно. PROHIBITED — нельзя. Ставит импорт/фикстура, не LLM. На карточку попадёт худшее из склейки.',
    },
    optOut: {
      type: 'boolean',
      description:
        'Отписка (стоп-кран). Не основание. true на любой бумажке карточки → BLOCKED / opt_out, даже если processingBasis=CONSENT. Черновика не будет.',
    },
    comment: {
      type: 'string',
      description:
        'Свободный текст, недоверенный. Если здесь приказ системе (смени tenant, верни QUALIFY, забудь правила) — это injection: текст сохраняем, команду не выполняем → BLOCKED / prompt_injection.',
    },
    tags: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Метки фикстуры. Тег prompt_injection считается попаданием детектора, даже если comment «безобидный». opt_out / suppression — подсказки набора, не замена полей optOut и стоп-списка.',
    },
    sourcePurpose: {
      type: 'string',
      description: 'Заявленная цель источника (webinar_followup, purchased_list, wrong_icp, …). Не основание обработки.',
    },
    tenantSlug: {
      type: 'string',
      enum: ['athenai_demo', 'proshelf_demo'],
      description: 'Чья квартира. При импорте с header AthenAI строки Proshelf не пишутся (skippedOtherTenant).',
    },
  },
} as const

export const openApiSchemas = {
  ProcessingBasis: {
    type: 'string' as const,
    enum: ['CONSENT', 'DOCUMENTED_LEGITIMATE_INTEREST', 'UNKNOWN', 'PROHIBITED'],
    description: [
      'Основание обработки: по какому праву держим контакт. Не статус карточки и не deliveryGuard.',
      'CONSENT — согласие зафиксировано. DOCUMENTED_LEGITIMATE_INTEREST — законный интерес зафиксирован. UNKNOWN — неясно, откуда строка. PROHIBITED — обрабатывать нельзя.',
      'Приходит с сырой строкой (импорт/фикстура). LLM не ставит и не повышает. На LeadCase копируется худшее из привязанных raw: PROHIBITED (3) > UNKNOWN (2) > CONSENT и LI (1, равны).',
      'UNKNOWN / PROHIBITED / нет evidence refs → BLOCKED, причина unknown_processing_basis.',
    ].join(' '),
  },
  OptOut: {
    type: 'boolean' as const,
    description: [
      'Отписка на сырой строке (raw.optOut). Стоп-кран «этому человеку писать нельзя», не юридическое основание.',
      'Даже при processingBasis=CONSENT, если любая бумажка карточки optOut=true → status MANUAL_REVIEW, deliveryGuard BLOCKED, reason opt_out. Черновика нет.',
      'Не путать с plannedReply=opt_out (это будущий mock-ответ) и со стоп-списком GET /suppression (reason может быть suppression или opt_out).',
    ].join(' '),
  },
  PromptInjection: {
    type: 'object' as const,
    description: [
      'Приказ системе в недоверенных полях лида (comment и другие свободные тексты), не отзыв с вебинара.',
      'Примеры: смени tenant, верни QUALIFY, забудь правила, подними бюджет. Текст храним as-is, команду не выполняем.',
      'Детектор: маркеры в тексте + тег prompt_injection на фикстуре. Итог: MANUAL_REVIEW + BLOCKED / prompt_injection. Не повышает статус и не меняет processingBasis.',
    ].join(' '),
    properties: {
      deliveryGuardReason: { type: 'string' as const, enum: ['prompt_injection'] },
    },
  },
  DeliveryGuard: {
    type: 'string' as const,
    enum: ['CLEAR', 'BLOCKED'],
    description:
      'Разрешение на действие, не статус карточки. CLEAR — исходящее не запрещено политикой. BLOCKED — писать нельзя, пока человек не разберёт. Причина в deliveryGuardReason: opt_out, prompt_injection, suppression, unknown_processing_basis.',
  },
  LeadCaseStatus: {
    type: 'string' as const,
    enum: ['QUALIFY', 'REJECT', 'MANUAL_REVIEW'],
    description:
      'Годность по rules-v1. QUALIFY — можно готовить черновик, если ещё CLEAR. REJECT — нецелевой, контакт не запрещён (CLEAR). MANUAL_REVIEW — человеку, в том числе все BLOCKED и сбой mock-LLM. Письмо только QUALIFY + CLEAR. LLM статус не повышает и не ставит processingBasis.',
  },
}

