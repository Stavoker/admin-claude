export function normalizeBaseUrl(url) {
  if (!url || typeof url !== "string") return "";
  return url.trim().replace(/\/+$/, "");
}

export function resolveEndpoint(baseUrl, endpointPath) {
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

/** API на localhost — з Render треба йти напряму з браузера, не через сервер */
export function isLocalApiHost(baseUrl) {
  try {
    const { hostname } = new URL(baseUrl);
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]" ||
      hostname === "host.docker.internal"
    );
  } catch {
    return false;
  }
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

async function upstreamJson(url, options) {
  let res;
  try {
    res = await fetch(url, options);
  } catch (e) {
    const err = new Error(
      "Не вдалося з’єднатися з API на вашому ПК. Перевірте Docker (:3002) і CORS (дозвольте " +
        (typeof location !== "undefined" ? location.origin : "origin") +
        ")."
    );
    err.cause = e;
    throw err;
  }
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
    throw new Error(msg || `Помилка API (${res.status})`);
  }
  return data;
}

async function directChat(settings, { messages, system }) {
  const { apiKey, baseUrl, format = "openai", chatModel: model } = settings;
  const base = normalizeBaseUrl(baseUrl);

  if (format === "anthropic") {
    const body = {
      model: model || "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: messages || [],
    };
    if (system) body.system = system;
    const data = await upstreamJson(resolveEndpoint(base, "/v1/messages"), {
      method: "POST",
      headers: authHeaders(apiKey, format),
      body: JSON.stringify(body),
    });
    return { text: extractChatText(data, format), raw: data };
  }

  const chatMessages = [...(messages || [])];
  if (system && !chatMessages.some((m) => m.role === "system")) {
    chatMessages.unshift({ role: "system", content: system });
  }
  const data = await upstreamJson(resolveEndpoint(base, "/v1/chat/completions"), {
    method: "POST",
    headers: authHeaders(apiKey, format),
    body: JSON.stringify({
      model: model || "claude-sonnet-4-20250514",
      messages: chatMessages,
      max_tokens: 4096,
    }),
  });
  return { text: extractChatText(data, format), raw: data };
}

async function directText(settings, { prompt, tone, length }) {
  const system = [
    "Ти професійний копірайтер. Пиши якісний, структурований текст українською, якщо користувач не просить іншу мову.",
    tone ? `Тон: ${tone}.` : "",
    length ? `Обсяг: ${length}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return directChat(settings, {
    messages: [{ role: "user", content: prompt.trim() }],
    system,
  });
}

async function directImage(settings, { prompt, size }) {
  const { apiKey, baseUrl, format = "openai", chatModel, imageModel } = settings;
  const base = normalizeBaseUrl(baseUrl);
  const imageSize = size || "1024x1024";

  if (format === "anthropic") {
    const data = await upstreamJson(resolveEndpoint(base, "/v1/messages"), {
      method: "POST",
      headers: authHeaders(apiKey, format),
      body: JSON.stringify({
        model: chatModel || "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: `Згенеруй зображення за описом (поверни лише URL): ${prompt.trim()}`,
          },
        ],
      }),
    });
    const text = extractChatText(data, format);
    const urlMatch = text.match(/https?:\/\/[^\s)]+/);
    if (!urlMatch) throw new Error("Шлюз не повернув URL зображення");
    return { imageUrl: urlMatch[0], raw: data };
  }

  const paths = ["/v1/images/generations", "/v1/image/generations"];
  let lastError;
  for (const p of paths) {
    try {
      const data = await upstreamJson(resolveEndpoint(base, p), {
        method: "POST",
        headers: authHeaders(apiKey, format),
        body: JSON.stringify({
          model: imageModel || "dall-e-3",
          prompt: prompt.trim(),
          n: 1,
          size: imageSize,
        }),
      });
      const imageUrl = extractImageUrl(data);
      if (imageUrl) return { imageUrl, raw: data };
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error("Не вдалося згенерувати зображення");
}

async function proxyPost(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    const detail =
      typeof data.details === "object"
        ? data.details?.error?.message || data.details?.message
        : null;
    throw new Error(detail ? `${data.error} (${detail})` : data.error || "Помилка сервера");
  }
  return data;
}

export async function callChat(settings, payload) {
  if (isLocalApiHost(settings.baseUrl)) {
    return directChat(settings, payload);
  }
  return proxyPost("/api/chat", {
    ...settings,
    model: settings.chatModel,
    ...payload,
  });
}

export async function callText(settings, payload) {
  if (isLocalApiHost(settings.baseUrl)) {
    return directText(settings, payload);
  }
  return proxyPost("/api/text", {
    ...settings,
    model: settings.chatModel,
    ...payload,
  });
}

export async function callImage(settings, payload) {
  if (isLocalApiHost(settings.baseUrl)) {
    return directImage(settings, payload);
  }
  return proxyPost("/api/image", {
    ...settings,
    model: settings.imageModel,
    ...payload,
  });
}

export function connectionModeLabel(baseUrl) {
  return isLocalApiHost(baseUrl)
    ? "прямо з браузера → Docker на вашому ПК"
    : "через сервер Render";
}
