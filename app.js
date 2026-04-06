const inputEl = document.getElementById("input");
const outputEl = document.getElementById("output");
const statsEl = document.getElementById("stats");
const protocolEl = document.getElementById("protocol");
const keepNamesEl = document.getElementById("keepNames");

const convertBtn = document.getElementById("convertBtn");
const clearBtn = document.getElementById("clearBtn");
const copyBtn = document.getElementById("copyBtn");
const downloadBtn = document.getElementById("downloadBtn");

function normalizeInput(raw) {
  return raw
    .replace(/\r/g, "\n")
    .replace(/[;,|]+/g, " ")
    .trim();
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

function convert() {
  const raw = inputEl.value;
  if (!raw.trim()) {
    outputEl.value = "";
    statsEl.textContent = "Chưa có dữ liệu để convert.";
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
    const name = keepNamesEl.checked && p.sourceName ? p.sourceName : `proxy${i + 1}`;
    lines.push(`${p.protocol}://${p.user}:${p.pass}@${p.host}:${p.port} "${name}"`);
  });

  outputEl.value = lines.join("\n");

  const formatSummary = [...formatCount.entries()]
    .map(([k, v]) => `${k}: ${v}`)
    .join(" | ");

  statsEl.textContent = `Đã nhận diện ${parsed.length} dòng hợp lệ. Lỗi: ${failed.length}. ${formatSummary || "Không xác định format."}`;
}

function clearAll() {
  inputEl.value = "";
  outputEl.value = "";
  statsEl.textContent = "Đã xóa dữ liệu.";
}

async function copyOutput() {
  if (!outputEl.value.trim()) {
    statsEl.textContent = "Chưa có output để copy.";
    return;
  }

  try {
    await navigator.clipboard.writeText(outputEl.value);
    statsEl.textContent = "Đã copy output vào clipboard.";
  } catch (error) {
    statsEl.textContent = "Không copy được tự động. Hãy copy thủ công.";
  }
}

function downloadOutput() {
  if (!outputEl.value.trim()) {
    statsEl.textContent = "Chưa có output để tải.";
    return;
  }

  const blob = new Blob([outputEl.value], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "superproxy-import.txt";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  statsEl.textContent = "Đã tải file superproxy-import.txt";
}

convertBtn.addEventListener("click", convert);
clearBtn.addEventListener("click", clearAll);
copyBtn.addEventListener("click", copyOutput);
downloadBtn.addEventListener("click", downloadOutput);

inputEl.value = [
  "209.38.173.242:31112:zp5911_9ujlob:Upfep1ALtLklKGs9_country-Vietnam_session-XRfjNWv4",
  "209.38.173.242:31112:zp5911_9ujlob:Upfep1ALtLklKGs9_country-Vietnam_session-69hybuSo",
  "proxymart29366:ygHRrKyO@161.248.212.20:29366"
].join("\n");
