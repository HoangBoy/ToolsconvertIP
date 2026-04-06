const HISTORY_KEY = "spc_history_v1";
const HISTORY_LIMIT = 1000;

const inputEl = document.getElementById("input");
const outputEl = document.getElementById("output");
const statsEl = document.getElementById("stats");
const protocolEl = document.getElementById("protocol");
const keepNamesEl = document.getElementById("keepNames");
const autoSaveHistoryEl = document.getElementById("autoSaveHistory");
const tagInputEl = document.getElementById("tagInput");
const noteInputEl = document.getElementById("noteInput");
const accountTypeInputEl = document.getElementById("accountTypeInput");
const nameTemplateInputEl = document.getElementById("nameTemplateInput");
const useTemplateNameEl = document.getElementById("useTemplateName");

const convertBtn = document.getElementById("convertBtn");
const clearBtn = document.getElementById("clearBtn");
const pasteInputBtn = document.getElementById("pasteInputBtn");
const copyInputBtn = document.getElementById("copyInputBtn");
const copyBtn = document.getElementById("copyBtn");
const downloadBtn = document.getElementById("downloadBtn");

const historySearchEl = document.getElementById("historySearch");
const dateFromEl = document.getElementById("dateFrom");
const dateToEl = document.getElementById("dateTo");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");
const exportHistoryBtn = document.getElementById("exportHistoryBtn");
const historyStatsEl = document.getElementById("historyStats");
const historyListEl = document.getElementById("historyList");

const syncKeyInputEl = document.getElementById("syncKeyInput");
const autoCloudSyncEl = document.getElementById("autoCloudSync");
const cloudStatusEl = document.getElementById("cloudStatus");
const pushCloudBtn = document.getElementById("pushCloudBtn");
const pullCloudBtn = document.getElementById("pullCloudBtn");

let historyRecords = loadHistory();
let firebaseReady = false;
let firebaseDb = null;

function normalizeInput(raw) {
  return raw
    .replace(/\r/g, "\n")
    .replace(/[;,|]+/g, " ")
    .trim();
}

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("vi-VN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  } catch (_error) {
    return iso;
  }
}

function safeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function idValue() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `id-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
}

function yyyymmdd(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function yyyymmddHHmmss(date = new Date()) {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${yyyymmdd(date)}-${hh}${mm}${ss}`;
}

function cleanDocId(raw) {
  const id = (raw || "").trim();
  if (!id) {
    return "default-sync";
  }

  return id.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 120) || "default-sync";
}

function parseOne(text) {
  const line = text.trim();
  if (!line || line.startsWith("#")) {
    return null;
  }

  const fullRegex = /^(?:(https?|socks5):\/\/)?([^:\s@]+):([^@\s]+)@([^:\s]+):(\d{2,5})(?:\s+"([^"]+)")?(?:\s+\*)?(?:\s+dns:[\w-]+)?$/i;
  const ipPortUserPassRegex = /^([^:\s]+):(\d{2,5}):([^:\s@]+):([^\s]+)$/;

  let m = line.match(fullRegex);
  if (m) {
    const [, protocol, user, pass, host, port, name] = m;
    return {
      protocol: (protocol || protocolEl.value).toLowerCase(),
      user,
      pass,
      host,
      port,
      sourceName: name || null,
      format: protocol ? "protocol://user:pass@ip:port" : "user:pass@ip:port"
    };
  }

  m = line.match(ipPortUserPassRegex);
  if (m) {
    const [, host, port, user, pass] = m;
    return {
      protocol: protocolEl.value.toLowerCase(),
      user,
      pass,
      host,
      port,
      sourceName: null,
      format: "ip:port:user:pass"
    };
  }

  return null;
}

function explodeCandidates(raw) {
  const lines = normalizeInput(raw).split(/\n+/).map((x) => x.trim()).filter(Boolean);
  const candidates = [];

  for (const line of lines) {
    if (line.includes(" ")) {
      const maybeOne = parseOne(line);
      if (maybeOne) {
        candidates.push(line);
        continue;
      }

      const pieces = line.split(/\s+/).map((x) => x.trim()).filter(Boolean);
      candidates.push(...pieces);
    } else {
      candidates.push(line);
    }
  }

  return candidates;
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function persistHistory() {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(historyRecords.slice(0, HISTORY_LIMIT)));
}

function buildProxyName(parsedItem, index) {
  const sourceName = parsedItem.sourceName || "";

  if (!useTemplateNameEl.checked) {
    if (keepNamesEl.checked && sourceName) {
      return sourceName;
    }

    return `proxy${index}`;
  }

  const now = new Date();
  const template = (nameTemplateInputEl.value || "").trim() || "proxy{index}";
  const account = (accountTypeInputEl.value || "").trim() || "account";
  const tag = (tagInputEl.value || "").trim() || "untagged";

  return template
    .replace(/\{index\}/g, String(index))
    .replace(/\{date\}/g, yyyymmdd(now))
    .replace(/\{datetime\}/g, yyyymmddHHmmss(now))
    .replace(/\{tag\}/g, tag)
    .replace(/\{account\}/g, account)
    .replace(/\{source\}/g, sourceName || `proxy${index}`);
}

function renderHistory() {
  const query = historySearchEl.value.trim().toLowerCase();
  const from = dateFromEl.value;
  const to = dateToEl.value;

  const filtered = historyRecords.filter((item) => {
    const haystack = `${item.tag || ""} ${item.note || ""} ${item.formatSummary || ""} ${item.output || ""}`.toLowerCase();
    const queryPass = !query || haystack.includes(query);

    const date = item.createdAt ? item.createdAt.slice(0, 10) : "";
    const fromPass = !from || date >= from;
    const toPass = !to || date <= to;

    return queryPass && fromPass && toPass;
  });

  historyStatsEl.textContent = `Local history: ${historyRecords.length} records. Showing: ${filtered.length}.`;

  if (!filtered.length) {
    historyListEl.innerHTML = '<div class="history-item">No matching history records.</div>';
    return;
  }

  historyListEl.innerHTML = filtered.map((item) => {
    return `
      <article class="history-item" data-id="${safeHtml(item.id)}">
        <div class="history-item-head">
          <strong>${safeHtml(formatDate(item.createdAt))}</strong>
          <div class="history-badges">
            <span class="badge">valid: ${safeHtml(item.validCount)}</span>
            <span class="badge">failed: ${safeHtml(item.failedCount)}</span>
            <span class="badge">protocol: ${safeHtml(item.protocol)}</span>
            ${item.tag ? `<span class="badge">tag: ${safeHtml(item.tag)}</span>` : ""}
            ${item.accountType ? `<span class="badge">account: ${safeHtml(item.accountType)}</span>` : ""}
          </div>
        </div>
        <div class="history-note">${safeHtml(item.note || "No note")}</div>
        <div class="history-note">${safeHtml(item.formatSummary || "")}</div>
        <div class="history-actions">
          <button class="btn" data-action="load" data-id="${safeHtml(item.id)}">Load output</button>
          <button class="btn" data-action="delete" data-id="${safeHtml(item.id)}">Delete record</button>
        </div>
      </article>
    `;
  }).join("");
}

function saveConvertRecord(snapshot) {
  const entry = {
    id: idValue(),
    createdAt: new Date().toISOString(),
    protocol: snapshot.protocol,
    validCount: snapshot.validCount,
    failedCount: snapshot.failedCount,
    formatSummary: snapshot.formatSummary,
    output: snapshot.output,
    input: snapshot.input,
    tag: (tagInputEl.value || "").trim(),
    note: (noteInputEl.value || "").trim(),
    accountType: (accountTypeInputEl.value || "").trim(),
    nameTemplate: (nameTemplateInputEl.value || "").trim()
  };

  historyRecords.unshift(entry);
  historyRecords = historyRecords.slice(0, HISTORY_LIMIT);
  persistHistory();
  renderHistory();
}

async function pushCloud() {
  if (!firebaseReady) {
    setCloudStatus("not ready. Please configure Firebase first.");
    return;
  }

  const syncKey = cleanDocId(syncKeyInputEl.value);

  try {
    await firebaseDb.collection("proxy_history_shared").doc(syncKey).set({
      updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
      syncKey,
      items: historyRecords.slice(0, HISTORY_LIMIT)
    });

    setCloudStatus(`pushed ${historyRecords.length} records with key ${syncKey}.`);
  } catch (error) {
    setCloudStatus(`push failed: ${error.message}`);
  }
}

async function pullCloud() {
  if (!firebaseReady) {
    setCloudStatus("not ready. Please configure Firebase first.");
    return;
  }

  const syncKey = cleanDocId(syncKeyInputEl.value);

  try {
    const doc = await firebaseDb.collection("proxy_history_shared").doc(syncKey).get();
    if (!doc.exists) {
      setCloudStatus(`cloud has no data for key ${syncKey}.`);
      return;
    }

    const data = doc.data() || {};
    const cloudItems = Array.isArray(data.items) ? data.items : [];
    historyRecords = cloudItems.slice(0, HISTORY_LIMIT);
    persistHistory();
    renderHistory();
    setCloudStatus(`pulled ${historyRecords.length} records with key ${syncKey}.`);
  } catch (error) {
    setCloudStatus(`pull failed: ${error.message}`);
  }
}

function convert() {
  const raw = inputEl.value;
  if (!raw.trim()) {
    outputEl.value = "";
    statsEl.textContent = "No input data to convert.";
    return;
  }

  const candidates = explodeCandidates(raw);
  const parsed = [];
  const failed = [];
  const formatCount = new Map();

  for (const item of candidates) {
    const parsedItem = parseOne(item);
    if (!parsedItem) {
      failed.push(item);
      continue;
    }

    parsed.push(parsedItem);
    formatCount.set(parsedItem.format, (formatCount.get(parsedItem.format) || 0) + 1);
  }

  const lines = ["# superproxy:proxylist:v1"];
  parsed.forEach((p, i) => {
    const name = buildProxyName(p, i + 1);
    lines.push(`${p.protocol}://${p.user}:${p.pass}@${p.host}:${p.port} "${name}"`);
  });

  outputEl.value = lines.join("\n");

  const formatSummary = [...formatCount.entries()]
    .map(([k, v]) => `${k}: ${v}`)
    .join(" | ");

  statsEl.textContent = `Detected ${parsed.length} valid lines. Failed: ${failed.length}. ${formatSummary || "Unknown format."}`;

  if (autoSaveHistoryEl.checked) {
    saveConvertRecord({
      input: raw,
      output: outputEl.value,
      protocol: protocolEl.value,
      validCount: parsed.length,
      failedCount: failed.length,
      formatSummary
    });
    statsEl.textContent += " Saved to local history.";
  }

  if (autoCloudSyncEl.checked) {
    pushCloud();
  }
}

function clearAll() {
  inputEl.value = "";
  outputEl.value = "";
  statsEl.textContent = "Input and output cleared.";
}

async function copyText(text, successMessage, failMessage) {
  if (!text.trim()) {
    statsEl.textContent = "No data to copy.";
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    statsEl.textContent = successMessage;
  } catch (_error) {
    statsEl.textContent = failMessage;
  }
}

async function copyInput() {
  await copyText(inputEl.value, "Input copied to clipboard.", "Could not auto-copy input.");
}

async function copyOutput() {
  await copyText(outputEl.value, "Output copied to clipboard.", "Could not auto-copy output.");
}

async function pasteInput() {
  try {
    const text = await navigator.clipboard.readText();
    if (!text) {
      statsEl.textContent = "Clipboard is empty.";
      return;
    }

    inputEl.value = text;
    statsEl.textContent = "Input pasted from clipboard.";
  } catch (_error) {
    statsEl.textContent = "Browser blocked paste permission. Use Ctrl+V manually.";
  }
}

function downloadOutput() {
  if (!outputEl.value.trim()) {
    statsEl.textContent = "No output to download.";
    return;
  }

  const blob = new Blob([outputEl.value], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `superproxy-import-${yyyymmddHHmmss()}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  statsEl.textContent = "Output file downloaded.";
}

function exportHistoryJson() {
  const blob = new Blob([JSON.stringify(historyRecords, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `proxy-history-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function initHistoryEvents() {
  historySearchEl.addEventListener("input", renderHistory);
  dateFromEl.addEventListener("change", renderHistory);
  dateToEl.addEventListener("change", renderHistory);

  clearHistoryBtn.addEventListener("click", () => {
    const ok = window.confirm("Delete all local history records?");
    if (!ok) {
      return;
    }

    historyRecords = [];
    persistHistory();
    renderHistory();
    statsEl.textContent = "All local history records deleted.";
  });

  exportHistoryBtn.addEventListener("click", exportHistoryJson);

  historyListEl.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const action = target.dataset.action;
    const id = target.dataset.id;
    if (!action || !id) {
      return;
    }

    const item = historyRecords.find((x) => x.id === id);
    if (!item) {
      return;
    }

    if (action === "load") {
      outputEl.value = item.output || "";
      inputEl.value = item.input || "";
      tagInputEl.value = item.tag || "";
      noteInputEl.value = item.note || "";
      accountTypeInputEl.value = item.accountType || "";
      nameTemplateInputEl.value = item.nameTemplate || nameTemplateInputEl.value;
      statsEl.textContent = `Loaded record ${formatDate(item.createdAt)}.`;
      return;
    }

    if (action === "delete") {
      historyRecords = historyRecords.filter((x) => x.id !== id);
      persistHistory();
      renderHistory();
      statsEl.textContent = "One history record deleted.";
    }
  });
}

function firebaseIsConfigured() {
  const cfg = window.FIREBASE_CONFIG || {};
  return Boolean(cfg.apiKey && cfg.projectId && cfg.appId);
}

function setCloudStatus(text) {
  cloudStatusEl.textContent = `Cloud: ${text}`;
}

function initFirebase() {
  if (!window.firebase || !firebaseIsConfigured()) {
    setCloudStatus("not configured. Open firebase-config.js and fill your Firebase config.");
    return;
  }

  const app = window.firebase.initializeApp(window.FIREBASE_CONFIG);
  firebaseDb = window.firebase.firestore(app);
  firebaseReady = true;
  setCloudStatus("ready. No login required. Use sync key to sync devices.");
}

function initMainEvents() {
  convertBtn.addEventListener("click", convert);
  clearBtn.addEventListener("click", clearAll);
  pasteInputBtn.addEventListener("click", pasteInput);
  copyInputBtn.addEventListener("click", copyInput);
  copyBtn.addEventListener("click", copyOutput);
  downloadBtn.addEventListener("click", downloadOutput);
  pushCloudBtn.addEventListener("click", pushCloud);
  pullCloudBtn.addEventListener("click", pullCloud);
}

function bootstrap() {
  initMainEvents();
  initHistoryEvents();
  renderHistory();
  initFirebase();

  inputEl.value = [
    "209.38.173.242:31112:zp5911_9ujlob:Upfep1ALtLklKGs9_country-Vietnam_session-XRfjNWv4",
    "209.38.173.242:31112:zp5911_9ujlob:Upfep1ALtLklKGs9_country-Vietnam_session-69hybuSo",
    "proxymart29366:ygHRrKyO@161.248.212.20:29366"
  ].join("\n");
}

bootstrap();
