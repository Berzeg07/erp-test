# Feature-Sliced Design (FSD)

FSD применяется в **`apps/admin`**.

## Слои (сверху вниз)

| Слой | Назначение | Пример в шаблоне |
| ---- | ---------- | ---------------- |
| `app` | bootstrap, providers | `main.ts`, pinia, router, vuetify |
| `pages` | экраны / маршруты | `pages/login`, `pages/home` |
| `widgets` | крупные блоки UI | (пусто в шаблоне — добавлять по мере экранов) |
| `features` | действия пользователя | (пусто — login пока в page + entity) |
| `entities` | домен + API + store | `entities/session` |
| `shared` | UI-kit, api, config, lib, assets | `shared/ui`, `shared/api/http.ts` |

## Импорты

- Слой импортирует **только нижележащие**.
- Публичный API слайса — через `index.ts`.
- Запрещено: `pages` → `pages`, `shared` → `entities|features|pages|widgets`.

```ts
// ❌ BAD — page тянет внутренности другой page
import { useX } from '@/pages/other/model/...'

// ✅ GOOD — через entities / shared
import { useSessionStore } from '@/entities/session'
```

## UI-kit `Ui*`

Переиспользуемые примитивы в `shared/ui/{slice}/ui/Ui*.vue` + `index.ts`.

| Сейчас в шаблоне | Назначение |
| ---------------- | ---------- |
| `UiButton` | кнопка |
| `UiSkeleton` | placeholder загрузки |

Новые примитивы — с префиксом **`Ui`**, не копировать разметку между pages.

## Async UI

Блоки с данными с API — **скелетон** (`UiSkeleton`), не текст «Загрузка…».

## SCSS внутри FSD

- Токены / миксины: `src/assets/scss/`
- Стили экранов: `<style scoped lang="scss">` в SFC
- Vite `additionalData`: `@use "@/assets/scss/index.scss" as *;`
- BEM + `to-rem()` + только миксины брейкпоинтов — [../code-style/scss.md](../code-style/scss.md)

## Что куда класть при росте продукта

| Что появилось | Куда |
| ------------- | ---- |
| Новый экран с URL | `pages/...` |
| Крупный блок в layout | `widgets/...` |
| Действие пользователя (форма, CTA) | `features/...` |
| Заявки / источники / API-клиент | `entities/...` |
| Кнопка, модалка, форматтер | `shared/ui` или `shared/lib` |

Cursor rule: `.cursor/rules/fsd-architecture.mdc`, `.cursor/rules/ui-kit.mdc`.
