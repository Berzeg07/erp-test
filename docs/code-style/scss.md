# SCSS

Клиенты (`web`, `admin`) держат стили в `src/assets/scss`. Внешние Google Fonts не используем.

## Структура

```
src/assets/scss/
  _functions.scss      # to-rem()
  index.scss           # @forward → Vite additionalData
  common.scss          # reset + base (import в main.ts)
  vars/                # colors, spacing, typography
  helpers/             # breakpoints mixins
  vendors/             # reset
  utils/               # .ui-skeleton и др.
```

## Подключение

1. `import '@/assets/scss/common.scss'` в `app/main.ts`
2. В компонентах: `<style scoped lang="scss">`
3. Vite `additionalData`: `@use "@/assets/scss/index.scss" as *;` (файлы внутри `assets/scss` пропускаются, чтобы не было циклов)

## Правила

- Цвета / отступы — только токены из `vars/`
- Размеры — **`to-rem()`**, не сырые px (кроме 1px hairlines)
- Медиазапросы — только `@include mobile`, `@include tablet`, …; без сырых `@media` в SFC
- BEM: один корень блока, элементы `&__`, модификаторы `&--`; не плоские `.block__el` подряд

```scss
.home-page {
  &__title {
    color: $color-text;
  }

  &__title--muted {
    color: $color-muted;
  }
}
```

Палитра шаблона — нейтральный тёмный UI. В продукте токены можно переопределить под бренд.
