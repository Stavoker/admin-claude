import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;
const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

function normalizeBaseUrl(url) {
  if (!url || typeof url !== "string") return "";
  return url.trim().replace(/\/+$/, "");
}

/** Підтримка повного endpoint URL або базового шляху без дублювання /v1/... */
function resolveEndpoint(baseUrl, endpointPath) {
  const base = normalizeBaseUrl(baseUrl);
  const path = endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`;
  const pathNoSlash = path.slice(1);

  if (base.endsWith(path) || base.endsWith(pathNoSlash)) {
    return base;
  }

  const stripSuffixes = [
    "/v1/chat/completions",
    "/chat/completions",
    "/v1/messages",
    "/v1/images/generations",
    "/v1/image/generations",
  ];
  let root = base;
  for (const suffix of stripSuffixes) {
    if (root.endsWith(suffix)) {
      root = root.slice(0, -suffix.length);
      break;
    }
  }
  return `${normalizeBaseUrl(root)}${path}`;
}

function wrapUpstreamError(e) {
  const err = e instanceof Error ? e : new Error(String(e));
  const cause = err.cause;
  if (
    cause?.code === "ECONNREFUSED" ||
    cause?.code === "ENOTFOUND" ||
    /fetch failed/i.test(err.message)
  ) {
    err.status = 503;
    err.message =
      "Не вдалося підключитися до API. Перевірте, що шлюз запущений (напр. localhost:3002) і Base URL вказано правильно.";
  }
  if (!err.status) err.status = 500;
  return err;
}

function authHeaders(apiKey, format) {
  const headers = { "Content-Type": "application/json" };
  if (format === "anthropic") {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else {
    headers.Authorization = `Bearer ${apiKey}`;
    headers["x-api-key"] = apiKey;
  }
  return headers;
}

async function upstreamJson(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg =
      data?.error?.message ||
      (typeof data?.error === "string" ? data.error : null) ||
      data?.message ||
      (text && text.length < 500 ? text : null) ||
      res.statusText;
    const err = new Error(msg || `Помилка API (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function extractChatText(data, format) {
  if (format === "anthropic") {
    const block = data?.content?.find((c) => c.type === "text");
    return block?.text ?? "";
  }
  return data?.choices?.[0]?.message?.content ?? "";
}

function extractImageUrl(data) {
  const item = data?.data?.[0];
  if (!item) return null;
  if (item.url) return item.url;
  if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
  return null;
}

app.post("/api/chat", async (req, res) => {
  try {
    const { apiKey, baseUrl, format = "openai", model, messages, system } = req.body;
    if (!apiKey?.startsWith("sk-")) {
      return res.status(400).json({ error: "Потрібен API ключ у форматі sk-..." });
    }
    const base = normalizeBaseUrl(baseUrl);
    if (!base) return res.status(400).json({ error: "Вкажіть Base URL вашого API" });

    let data;
    if (format === "anthropic") {
      const body = {
        model: model || "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: messages || [],
      };
      if (system) body.system = system;
      data = await upstreamJson(resolveEndpoint(base, "/v1/messages"), {
        method: "POST",
        headers: authHeaders(apiKey, format),
        body: JSON.stringify(body),
      });
    } else {
      const chatMessages = [...(messages || [])];
      if (system && !chatMessages.some((m) => m.role === "system")) {
        chatMessages.unshift({ role: "system", content: system });
      }
      data = await upstreamJson(resolveEndpoint(base, "/v1/chat/completions"), {
        method: "POST",
        headers: authHeaders(apiKey, format),
        body: JSON.stringify({
          model: model || "claude-sonnet-4-20250514",
          messages: chatMessages,
          max_tokens: 4096,
        }),
      });
    }

    res.json({ text: extractChatText(data, format), raw: data });
  } catch (e) {
    const err = wrapUpstreamError(e);
    res.status(err.status || 500).json({
      error: err.message || "Помилка API",
      details: err.data,
    });
  }
});

app.post("/api/text", async (req, res) => {
  try {
    const { apiKey, baseUrl, format = "openai", model, prompt, tone, length } = req.body;
    if (!apiKey?.startsWith("sk-")) {
      return res.status(400).json({ error: "Потрібен API ключ у форматі sk-..." });
    }
    const base = normalizeBaseUrl(baseUrl);
    if (!base) return res.status(400).json({ error: "Вкажіть Base URL вашого API" });
    if (!prompt?.trim()) return res.status(400).json({ error: "Введіть тему або завдання для тексту" });

    const system = [
      "Ти професійний копірайтер. Пиши якісний, структурований текст українською, якщо користувач не просить іншу мову.",
      tone ? `Тон: ${tone}.` : "",
      length ? `Обсяг: ${length}.` : "",
    ]
      .filter(Boolean)
      .join(" ");

    const userContent = prompt.trim();

    let data;
    if (format === "anthropic") {
      data = await upstreamJson(resolveEndpoint(base, "/v1/messages"), {
        method: "POST",
        headers: authHeaders(apiKey, format),
        body: JSON.stringify({
          model: model || "claude-sonnet-4-20250514",
          max_tokens: 8192,
          system,
          messages: [{ role: "user", content: userContent }],
        }),
      });
    } else {
      data = await upstreamJson(resolveEndpoint(base, "/v1/chat/completions"), {
        method: "POST",
        headers: authHeaders(apiKey, format),
        body: JSON.stringify({
          model: model || "claude-sonnet-4-20250514",
          max_tokens: 8192,
          messages: [
            { role: "system", content: system },
            { role: "user", content: userContent },
          ],
        }),
      });
    }

    res.json({ text: extractChatText(data, format), raw: data });
  } catch (e) {
    const err = wrapUpstreamError(e);
    res.status(err.status || 500).json({
      error: err.message || "Помилка API",
      details: err.data,
    });
  }
});

app.post("/api/image", async (req, res) => {
  try {
    const { apiKey, baseUrl, format = "openai", model, prompt, size } = req.body;
    if (!apiKey?.startsWith("sk-")) {
      return res.status(400).json({ error: "Потрібен API ключ у форматі sk-..." });
    }
    const base = normalizeBaseUrl(baseUrl);
    if (!base) return res.status(400).json({ error: "Вкажіть Base URL вашого API" });
    if (!prompt?.trim()) return res.status(400).json({ error: "Введіть опис зображення" });

    const imageModel = model || "dall-e-3";
    const imageSize = size || "1024x1024";

    let imageUrl = null;
    let raw = null;

    if (format === "anthropic") {
      const data = await upstreamJson(resolveEndpoint(base, "/v1/messages"), {
        method: "POST",
        headers: authHeaders(apiKey, format),
        body: JSON.stringify({
          model: model || "claude-sonnet-4-20250514",
          max_tokens: 4096,
          messages: [
            {
              role: "user",
              content: `Згенеруй зображення за описом (поверни лише пряме посилання на зображення, якщо API це підтримує): ${prompt.trim()}`,
            },
          ],
        }),
      });
      raw = data;
      const text = extractChatText(data, format);
      const urlMatch = text.match(/https?:\/\/[^\s)]+/);
      imageUrl = urlMatch?.[0] ?? null;
      if (!imageUrl) {
        return res.status(502).json({
          error:
            "Цей шлюз у режимі Anthropic не повернув URL зображення. Спробуйте формат OpenAI або окремий endpoint для зображень у налаштуваннях провайдера.",
          text,
        });
      }
    } else {
      const paths = ["/v1/images/generations", "/v1/image/generations"];
      let lastError;
      for (const p of paths) {
        try {
          const data = await upstreamJson(resolveEndpoint(base, p), {
            method: "POST",
            headers: authHeaders(apiKey, format),
            body: JSON.stringify({
              model: imageModel,
              prompt: prompt.trim(),
              n: 1,
              size: imageSize,
            }),
          });
          raw = data;
          imageUrl = extractImageUrl(data);
          if (imageUrl) break;
        } catch (e) {
          lastError = e;
        }
      }
      if (!imageUrl) {
        throw lastError || new Error("Не вдалося згенерувати зображення");
      }
    }

    res.json({ imageUrl, raw });
  } catch (e) {
    const err = wrapUpstreamError(e);
    res.status(err.status || 500).json({
      error: err.message || "Помилка генерації зображення",
      details: err.data,
    });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, port: PORT });
});

app.listen(PORT, () => {
  console.log(`Claude Admin: http://localhost:${PORT}`);
});
