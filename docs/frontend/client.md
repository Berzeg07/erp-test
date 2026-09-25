# Клиент

Одно SPA: **админка оператора** (`@app/admin`, порт **5283**). Кабинет `apps/web` в этом продукте не используется.

Vue 3, Vuetify (тёмная тема), Pinia, vue-router, FSD, same-origin proxy на API.

Guard: нет access-токена → `/login`. Seed: `admin@app.local` / `admin12345`.

## Экраны (UI-1)

Липкая шапка на всех экранах после логина: `SYNTHETIC DATA` · tenant `athenai_demo` | `proshelf_demo` · kill-switch OFF/ON · imported · unique · blocked. На каждом экране плашка **Сцена:** (не тост).

Заголовок `X-Tenant-Id` ставит `http.ts` из выбранного tenant.

| Путь | Экран |
| ---- | ----- |
| `/login` | Вход |
| `/` | Обзор трёх чисел и рубильника |
| `/import` | Фикстура + CSV, блок до → после |
| `/leads` | Список: чипы status и guard раздельно, фильтры |
| `/leads/:id` | Raw, evidence, draft/approve/send, reply, CRM+DLQ |
| `/funnel` | Все поля ТЗ + бейдж SYNTHETIC |
| `/tech` | Сброс воронки текущей квартиры (нули в шапке) |
| `/docs` | OpenAPI (прокси на сервер, не экран SPA) |

Пути SPA не совпадают с API-прокси: список `/leads`, метрики `/funnel` (`/cases` и `/metrics` отдаёт сервер).

## Proxy

Префиксы в `apps/admin/vite.api-prefixes.ts`: `/auth`, `/health`, `/docs`, `/tenants`, `/imports`, `/mock-source`, `/cases`, `/drafts`, `/outbox`, `/replies`, `/tasks`, `/events`, `/crm`, `/dlq`, `/metrics`, `/kill-switch`, `/suppression`, `/demo`.

Новый API-префикс: добавить туда + smoke-тест `api-proxy-prefixes.test.ts` + перезапуск Vite.
