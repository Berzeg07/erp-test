export const openApiInfo = {
  title: 'AthenAI Lead Engine API',
  version: '0.1.0',
  description: [
    'Синтетический MVP Safe Revenue Loop: реальных контактов, отправки писем и ключей LLM нет.',
    '',
    'Как ходить из /docs',
    '',
    '1. POST /auth/login (seed: admin@app.local / admin12345) → в ответе token.',
    '2. Кнопка Authorize вверху → вставить token без слова Bearer.',
    '3. На доменных ручках заголовок x-tenant-id: квартира данных, не второй логин. Значения: athenai_demo или proshelf_demo. Чужой/пустой slug → 404 TENANT_ISOLATION.',
    '',
    'Порядок конвейера: импорт сырья → (стоп-список) → POST /cases/resolve → смотреть GET /cases. Resolve в конце сам ставит deliveryGuard. QUALIFY ещё нет (RULE-1).',
  ].join('\n'),
}

export const openApiTags = [
  { name: 'health', description: 'Живой ли процесс. Без JWT.' },
  { name: 'auth', description: 'Сессия оператора. JWT не выбирает tenant.' },
  { name: 'tenants', description: 'Список квартир и проверка заголовка x-tenant-id.' },
  { name: 'imports', description: 'Склад сырья RawLeadRecord. Карточки отсюда ещё не появляются.' },
  { name: 'cases', description: 'Дедуп: Person, Company, карточка LeadCase.' },
  { name: 'policy', description: 'Можно ли действовать: deliveryGuard, стоп-список, injection.' },
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
  importsPost: {
    summary: 'Положить сырьё (JSON или CSV) на склад',
    description: [
      'Пишет RawLeadRecord, карточки LeadCase не создаёт. Потом нужен POST /cases/resolve.',
      '',
      'Тело: { "leads": [ … ] } или { "csv": "…" } (или Content-Type text/csv). Строки другого tenant в файле не пишутся (skippedOtherTenant). Повтор тех же tenant+source+externalId обновляет, не размножает.',
      '',
      'Пустой Execute без body → 400 VALIDATION_ERROR.',
    ].join('\n'),
  },
  mockSourceGet: {
    summary: 'Посмотреть mock_api (в базу не пишет)',
    description: [
      'Чтение фикстур source=mock_api текущего tenant. Это не склад и не импорт.',
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
    description:
      'JWT + x-tenant-id. Список RawLeadRecord этой квартиры. Пусто = ещё не импортировали (не путать с «resolve вернул 0»: resolve читает этот склад). Сырьё после дедупа не удаляется.',
  },
  casesResolve: {
    summary: 'Склеить сырьё в людей, фирмы и карточки',
    description: [
      'Команда, не чтение: создаёт Person / Company / LeadCase. JSON — отчёт сколько собрали, не список дел.',
      '',
      'Идемпотентно: повтор не удваивает карточки. Сырьё остаётся (raw.leadCaseId). В конце сам вызывает policy (deliveryGuard). Пустой склад → все нули. Список дел: GET /cases.',
    ].join('\n'),
  },
  casesList: {
    summary: 'Список карточек текущей квартиры',
    description: [
      'Чтение LeadCase. Смотреть: person, company, mergeBy, rawCount, conflicts, deliveryGuard / deliveryGuardReason, processingBasis.',
      '',
      'status до RULE-1 обычно MANUAL_REVIEW. BLOCKED — не четвёртый статус, а запрет действия (guard).',
    ].join('\n'),
  },
  casesById: {
    summary: 'Одна карточка и бумажки, из которых склеили',
    description:
      'В ответе rawRecords — исходные RawLeadRecord. id с чужим x-tenant-id → 404 TENANT_ISOLATION, без тела соседа.',
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
      'Не склеивает заново (это resolve). Ставит CLEAR/BLOCKED по opt-out, стоп-списку, injection, UNKNOWN/PROHIBITED basis.',
      '',
      'Порядок причин BLOCKED: opt_out → prompt_injection → suppression → unknown_processing_basis. CONSENT без стоп-сигналов остаётся CLEAR, QUALIFY не ставится. Resolve уже вызывает это в конце — ручка нужна, если список suppression загрузили после resolve.',
    ].join('\n'),
  },
} as const satisfies Record<string, RouteDoc>
