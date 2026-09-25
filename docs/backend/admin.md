# Админка (`apps/admin`)

Единственный фронт продукта. Порт **5283**.

| Экран | Путь |
| ----- | ---- |
| Login | `/login` |
| Консоль | `/` (пока заглушка + `SYNTHETIC DATA`) |

Воронка лидов — срез **UI-1**.

После `pnpm db:seed`: `admin@app.local` / `admin12345` → http://localhost:5283/login
