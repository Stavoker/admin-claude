# Claude Admin

Веб-інтерфейс для роботи з Claude-подібним API (не офіційний Anthropic). Ключі формату `sk-...`.

**Продакшен:** [https://admin-claude.onrender.com](https://admin-claude.onrender.com)

## Локальний запуск

```bash
npm install
npm start
```

Відкрийте **http://localhost:3001**

## Render

Репозиторій: [github.com/Stavoker/admin-claude](https://github.com/Stavoker/admin-claude)

Сервіс слухає `PORT` від Render (див. `render.yaml`). Health check: `/api/health`.

## Налаштування

1. **API ключ** — `sk-...`
2. **Base URL** — корінь шлюзу **без** `/v1/chat/completions`
3. **Формат API** — OpenAI або Anthropic (як у вашого провайдера)
4. **Модель** — наприклад `claude-sonnet-4-5`

### Локально (Admin + Kiro на одному ПК)

| Сервіс | URL |
|--------|-----|
| Claude Admin | `http://localhost:3001` |
| Шлюз Kiro OAuth | `http://localhost:3002/claude-kiro-oauth` |

У полі Base URL: `http://localhost:3002/claude-kiro-oauth`

### На Render ([admin-claude.onrender.com](https://admin-claude.onrender.com))

Запити до API йдуть **з серверів Render**, не з вашого браузера напряму.

- **`http://localhost:3002` не працюватиме** — для Render це їхня машина, а не ваш комп’ютер.
- Потрібен **публічний** Base URL шлюзу, наприклад `https://your-kiro-gateway.example.com/claude-kiro-oauth`
- Або користуйтесь Admin **локально** (`npm start`), якщо Kiro лише на вашому ПК.

## Можливості

- **Чат** — діалог з моделлю
- **Текст** — статті, пости (тон і обсяг)
- **Зображення** — якщо шлюз підтримує `/v1/images/generations`

Ключ зберігається в `localStorage` браузера; запити проксуються через backend Admin.
