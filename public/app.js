const STORAGE_KEY = "claude-admin-settings";

const $ = (id) => document.getElementById(id);

const els = {
  apiKey: $("apiKey"),
  baseUrl: $("baseUrl"),
  apiFormat: $("apiFormat"),
  chatModel: $("chatModel"),
  imageModel: $("imageModel"),
  saveSettings: $("saveSettings"),
  chatMessages: $("chatMessages"),
  chatForm: $("chatForm"),
  chatInput: $("chatInput"),
  clearChat: $("clearChat"),
  textForm: $("textForm"),
  textPrompt: $("textPrompt"),
  textTone: $("textTone"),
  textLength: $("textLength"),
  textResult: $("textResult"),
  imageForm: $("imageForm"),
  imagePrompt: $("imagePrompt"),
  imageSize: $("imageSize"),
  imageResult: $("imageResult"),
  generatedImage: $("generatedImage"),
  imageDownload: $("imageDownload"),
  toast: $("toast"),
};

let chatHistory = [];
let toastTimer;

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s.apiKey) els.apiKey.value = s.apiKey;
    if (s.baseUrl) els.baseUrl.value = s.baseUrl;
    if (s.apiFormat) els.apiFormat.value = s.apiFormat;
    if (s.chatModel) els.chatModel.value = s.chatModel;
    if (s.imageModel) els.imageModel.value = s.imageModel;
  } catch {
    /* ignore */
  }
}

function getSettings() {
  const apiKey = els.apiKey.value.trim();
  const baseUrl = els.baseUrl.value.trim();
  const format = els.apiFormat.value;
  const chatModel = els.chatModel.value.trim() || undefined;
  const imageModel = els.imageModel.value.trim() || undefined;
  return { apiKey, baseUrl, format, chatModel, imageModel };
}

function saveSettings() {
  const s = getSettings();
  if (!s.apiKey.startsWith("sk-")) {
    showToast("Ключ має починатися з sk-", true);
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  showToast("Налаштування збережено");
}

function validateSettings() {
  const s = getSettings();
  if (!s.apiKey.startsWith("sk-")) {
    showToast("Введіть API ключ (sk-...)", true);
    return null;
  }
  if (!s.baseUrl) {
    showToast("Вкажіть Base URL провайдера", true);
    return null;
  }
  return s;
}

function showToast(message, isError = false) {
  els.toast.textContent = message;
  els.toast.classList.remove("hidden", "error", "success");
  els.toast.classList.add(isError ? "error" : "success");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.add("hidden"), 4000);
}

function appendMessage(role, text, extraClass = "") {
  const div = document.createElement("div");
  div.className = `msg ${role} ${extraClass}`.trim();
  div.textContent = text;
  els.chatMessages.appendChild(div);
  els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
  return div;
}

async function apiPost(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Помилка сервера");
  return data;
}

function setLoading(button, loading) {
  if (!button) return;
  button.disabled = loading;
  button.dataset.originalText ??= button.textContent;
  button.textContent = loading ? "Зачекайте…" : button.dataset.originalText;
}

// Tabs
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    $(`panel-${tab.dataset.tab}`).classList.add("active");
  });
});

els.saveSettings.addEventListener("click", saveSettings);

els.clearChat.addEventListener("click", () => {
  chatHistory = [];
  els.chatMessages.innerHTML = "";
});

els.chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const settings = validateSettings();
  if (!settings) return;

  const text = els.chatInput.value.trim();
  if (!text) return;

  const submitBtn = els.chatForm.querySelector('button[type="submit"]');
  els.chatInput.value = "";
  chatHistory.push({ role: "user", content: text });
  appendMessage("user", text);

  const loadingEl = appendMessage("assistant", "Думаю…", "loading");
  setLoading(submitBtn, true);

  try {
    const data = await apiPost("/api/chat", {
      ...settings,
      model: settings.chatModel,
      messages: chatHistory,
    });
    chatHistory.push({ role: "assistant", content: data.text });
    loadingEl.textContent = data.text || "(порожня відповідь)";
    loadingEl.classList.remove("loading");
  } catch (err) {
    chatHistory.pop();
    loadingEl.textContent = err.message;
    loadingEl.classList.remove("loading");
    loadingEl.classList.add("error");
  } finally {
    setLoading(submitBtn, false);
  }
});

els.textForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const settings = validateSettings();
  if (!settings) return;

  const submitBtn = els.textForm.querySelector('button[type="submit"]');
  setLoading(submitBtn, true);
  els.textResult.classList.add("hidden");

  try {
    const data = await apiPost("/api/text", {
      ...settings,
      model: settings.chatModel,
      prompt: els.textPrompt.value.trim(),
      tone: els.textTone.value,
      length: els.textLength.value,
    });
    els.textResult.textContent = data.text || "(порожня відповідь)";
    els.textResult.classList.remove("hidden");
  } catch (err) {
    showToast(err.message, true);
  } finally {
    setLoading(submitBtn, false);
  }
});

els.imageForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const settings = validateSettings();
  if (!settings) return;

  const submitBtn = els.imageForm.querySelector('button[type="submit"]');
  setLoading(submitBtn, true);
  els.imageResult.classList.add("hidden");

  try {
    const data = await apiPost("/api/image", {
      ...settings,
      model: settings.imageModel,
      prompt: els.imagePrompt.value.trim(),
      size: els.imageSize.value,
    });
    els.generatedImage.src = data.imageUrl;
    els.imageDownload.href = data.imageUrl;
    els.imageResult.classList.remove("hidden");
  } catch (err) {
    showToast(err.message, true);
  } finally {
    setLoading(submitBtn, false);
  }
});

els.chatInput.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter" && !ev.shiftKey) {
    ev.preventDefault();
    els.chatForm.requestSubmit();
  }
});

loadSettings();
