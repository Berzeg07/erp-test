# Админка (`apps/admin`)

Единственный фронт продукта. Порт **5283**.

Липкая шапка: SYNTHETIC · tenant · kill-switch · imported/unique/blocked.

| Экран | Путь |
| ----- | ---- |
| Login | `/login` |
| Обзор | `/` |
| Импорт | `/import` |
| Кейсы | `/leads` |
| Карточка | `/leads/:id` |
| Метрики | `/funnel` |
| Сброс данных | `/tech` |

После `pnpm db:seed`: `admin@app.local` / `admin12345` → http://localhost:5283/login

Раскадровка немого видео: [screencast.md](../dev/screencast.md).
