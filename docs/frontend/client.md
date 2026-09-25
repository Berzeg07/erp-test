# Клиент

Одно SPA: **админка оператора** (`@app/admin`, порт **5283**). Кабинет `apps/web` в этом продукте не используется.

Vue 3, Vuetify (тёмная тема), Pinia, vue-router, FSD, same-origin proxy на API.

Маршруты сейчас: `/login`, `/` (console stub, requires auth). Экраны воронки — срез **UI-1**.

Guard: нет access-токена → `/login`.

## Proxy

Префиксы в `apps/admin/vite.api-prefixes.ts`: `/auth`, `/health`, `/docs`, `/tenants`, `/imports`, `/mock-source`, `/cases`, `/drafts`, `/outbox`, `/suppression`.

Новый API-префикс: добавить туда + smoke-тест `api-proxy-prefixes.test.ts` + перезапуск Vite.
