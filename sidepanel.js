// PageLens sidepanel.js
// Responsibilities:
//   1. Read the active tab's visible text (read-only — never writes to the page).
//   2. Send that text + the user's question to the Anthropic API directly from the browser.
//   3. Render the conversation.
//
// This file never calls any DOM-mutating chrome.scripting function on the page.
// The only injected function (extractPageContent) only reads content.

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MAX_PAGE_CHARS = 12000; // keep requests small & cheap

const state = {
  apiKey: null,
  model: "claude-sonnet-5",
  history: [], // { role: 'user' | 'assistant', content: string }
  lastPageKey: null, // url of the page the current history belongs to
};

// ---------- DOM refs ----------
const chatLog = document.getElementById("chatLog");
const questionInput = document.getElementById("questionInput");
const sendBtn = document.getElementById("sendBtn");
const settingsBtn = document.getElementById("settingsBtn");
const settingsPanel = document.getElementById("settingsPanel");
const apiKeyInput = document.getElementById("apiKeyInput");
const modelSelect = document.getElementById("modelSelect");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");
const saveStatus = document.getElementById("saveStatus");
const noKeyNotice = document.getElementById("noKeyNotice");
const openSettingsLink = document.getElementById("openSettingsLink");
const quickButtons = document.querySelectorAll(".quick-btn");

// ---------- Init ----------
init();

async function init() {
  const stored = await chrome.storage.local.get(["apiKey", "model"]);
  state.apiKey = stored.apiKey || null;
  state.model = stored.model || "claude-sonnet-5";
  modelSelect.value = state.model;
  if (stored.apiKey) apiKeyInput.value = stored.apiKey;
  updateNoKeyNotice();

  sendBtn.addEventListener("click", handleSend);
  questionInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });
  settingsBtn.addEventListener("click", () => settingsPanel.classList.toggle("hidden"));
  openSettingsLink.addEventListener("click", () => settingsPanel.classList.remove("hidden"));
  saveSettingsBtn.addEventListener("click", saveSettings);
  quickButtons.forEach((btn) => {
    btn.addEventListener("click", () => handleSend(btn.dataset.prompt));
  });
}

function updateNoKeyNotice() {
  noKeyNotice.classList.toggle("hidden", !!state.apiKey);
}

async function saveSettings() {
  const key = apiKeyInput.value.trim();
  const model = modelSelect.value;
  await chrome.storage.local.set({ apiKey: key, model });
  state.apiKey = key || null;
  state.model = model;
  updateNoKeyNotice();
  saveStatus.textContent = "Saved.";
  setTimeout(() => (saveStatus.textContent = ""), 1500);
}

// ---------- Page reading (read-only) ----------

// This function is injected into the page verbatim via chrome.scripting.executeScript.
// It must be self-contained (no references to outer scope).
function extractPageContent() {
  function visible(el) {
    const style = window.getComputedStyle(el);
    return style && style.display !== "none" && style.visibility !== "hidden";
  }
  const title = document.title || "";
  const url = location.href;
  const metaDesc =
    document.querySelector('meta[name="description"]')?.content ||
    document.querySelector('meta[property="og:description"]')?.content ||
    "";
  const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
    .filter(visible)
    .slice(0, 40)
    .map((h) => h.textContent.trim())
    .filter(Boolean);
  const bodyText = document.body ? document.body.innerText : "";
  return { title, url, metaDesc, headings, bodyText };
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function readCurrentPage() {
  const tab = await getActiveTab();
  if (!tab || !tab.id) throw new Error("No active tab found.");
  if (!/^https?:/.test(tab.url || "")) {
    throw new Error("PageLens can only read regular web pages (http/https), not this kind of tab.");
  }
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: extractPageContent,
  });
  return { ...result, tabId: tab.id };
}

function truncate(str, max) {
  if (!str) return "";
  return str.length > max ? str.slice(0, max) + "\n\n[...truncated...]" : str;
}

// ---------- Chat rendering ----------

function clearEmptyState() {
  const empty = chatLog.querySelector(".empty-state");
  if (empty) empty.remove();
}

function addBubble(role, text) {
  clearEmptyState();
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  div.textContent = text;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
  return div;
}

function addPageTag(title, url) {
  clearEmptyState();
  const div = document.createElement("div");
  div.className = "page-tag";
  div.textContent = `📄 ${title || url}`;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
}

// ---------- Main send flow ----------

async function handleSend(presetPrompt) {
  const question = (presetPrompt ?? questionInput.value).trim();
  if (!question) return;

  if (!state.apiKey) {
    settingsPanel.classList.remove("hidden");
    addBubble("error", "Add your Anthropic API key in settings first.");
    return;
  }

  sendBtn.disabled = true;
  questionInput.value = "";
  addBubble("user", question);
  const pendingBubble = addBubble("pending assistant", "Reading page…");

  try {
    const page = await readCurrentPage();

    if (state.lastPageKey !== page.url) {
      state.history = [];
      state.lastPageKey = page.url;
      addPageTag(page.title, page.url);
    }

    pendingBubble.textContent = "Thinking…";

    const pageContext = buildPageContext(page);
    const answer = await askClaude(question, pageContext);

    pendingBubble.remove();
    addBubble("assistant", answer);

    state.history.push({ role: "user", content: question });
    state.history.push({ role: "assistant", content: answer });
    // keep history bounded
    if (state.history.length > 12) state.history = state.history.slice(-12);
  } catch (err) {
    pendingBubble.remove();
    addBubble("error", err.message || String(err));
  } finally {
    sendBtn.disabled = false;
  }
}

function buildPageContext(page) {
  const headingsBlock = page.headings.length ? `Headings on page:\n- ${page.headings.join("\n- ")}\n\n` : "";
  const descBlock = page.metaDesc ? `Meta description: ${page.metaDesc}\n\n` : "";
  return (
    `Page title: ${page.title}\n` +
    `Page URL: ${page.url}\n` +
    descBlock +
    headingsBlock +
    `Visible page text (may be truncated):\n${truncate(page.bodyText, MAX_PAGE_CHARS)}`
  );
}

async function askClaude(question, pageContext) {
  const systemPrompt =
    "You are PageLens, a read-only assistant embedded in a Chrome extension. " +
    "You are given the visible text of the web page the user currently has open, and a question about it. " +
    "Answer only using that page content plus general knowledge needed to explain it — do not invent facts not supported by the page. " +
    "If the page content doesn't contain the answer, say so plainly. " +
    "Keep answers concise and skimmable. You have no ability to click, fill out forms, or take any action on the page — you only read and explain.";

  const messages = [
    ...state.history,
    {
      role: "user",
      content: `Here is the current page:\n\n${pageContext}\n\nQuestion: ${question}`,
    },
  ];

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": state.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: state.model,
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    let message = `API error (${response.status})`;
    try {
      const parsed = JSON.parse(errBody);
      if (parsed?.error?.message) message = parsed.error.message;
    } catch (_) {
      /* ignore parse failure, use default message */
    }
    throw new Error(message);
  }

  const data = await response.json();
  const textBlock = data.content?.find((block) => block.type === "text");
  return textBlock?.text?.trim() || "(No response text returned.)";
}
