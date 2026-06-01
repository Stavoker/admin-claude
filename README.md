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

### Render + Docker API на вашому ПК

Типова схема:

- UI: [admin-claude.onrender.com](https://admin-claude.onrender.com)
- API (Kiro): Docker `http://localhost:3002/claude-kiro-oauth`

Якщо Base URL — **localhost**, запити йдуть **напряму з браузера** в Docker (не через Render). Це працює, бо браузер на тому ж ПК, що й контейнер.

**Base URL:** `http://localhost:3002/claude-kiro-oauth`

У Docker/API увімкніть **CORS** для origin `https://admin-claude.onrender.com` (і `http://localhost:3001` для локального Admin).

Якщо CORS заблоковано — у консолі браузера буде `Failed to fetch`; додайте заголовки на шлюзі, наприклад:

```
Access-Control-Allow-Origin: https://admin-claude.onrender.com
Access-Control-Allow-Headers: Authorization, Content-Type, x-api-key
Access-Control-Allow-Methods: POST, OPTIONS
```

Для публічного API (не localhost) запити йдуть через сервер Render як раніше.

## Можливості

- **Чат** — діалог з моделлю
- **Текст** — статті, пости (тон і обсяг)
- **Зображення** — якщо шлюз підтримує `/v1/images/generations`

Ключ зберігається в `localStorage` браузера; запити проксуються через backend Admin.
