/**
 * AI API for the static site: Demucs (admin) + Groq songwriter.
 * Caddy proxies /api/ai/* here so Safari does not get index.html.
 */
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.PORT) || 8788;
const BIND = process.env.BIND || "127.0.0.1";
const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const HF_TOKEN = process.env.HUGGINGFACE_API_KEY?.trim() || "";
const GROQ_API_KEY = process.env.GROQ_API_KEY?.trim() || "";
const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODELS = ["openai/gpt-oss-20b", "openai/gpt-oss-120b"];
const PROXY_PUBLIC_ORIGIN = (process.env.PROXY_PUBLIC_ORIGIN || "https://sb.uniquevocal.ru").replace(/\/$/, "");
const MAX_BYTES = 10 * 1024 * 1024;
const TIER_RANK = { none: 0, standard: 1, premium: 2, vip: 3 };

function spaceHost(spaceId) {
  return `https://${spaceId.replace("/", "-").toLowerCase()}.hf.space`;
}

function spaceList() {
  const preferred = process.env.DEMUCS_HF_SPACE?.trim();
  const list = [
    {
      id: preferred || "abidlabs/music-separation",
      host: spaceHost(preferred || "abidlabs/music-separation"),
      endpoint: "inference",
    },
    {
      id: "abidlabs/music-separation",
      host: spaceHost("abidlabs/music-separation"),
      endpoint: "inference",
    },
  ];
  const seen = new Set();
  return list.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function json(res, status, body) {
  if (res.headersSent) return;
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function hfHeaders() {
  return { Authorization: `Bearer ${HF_TOKEN}` };
}

async function sbFetch(path, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("apikey", SERVICE_KEY);
  if (!headers.has("authorization")) {
    headers.set("authorization", `Bearer ${SERVICE_KEY}`);
  }
  const response = await fetch(`${SUPABASE_URL}${path}`, { ...init, headers });
  return response;
}

async function getAuth(bearer) {
  if (!bearer?.startsWith("Bearer ")) return null;
  const token = bearer.slice(7);
  const userRes = await sbFetch("/auth/v1/user", {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!userRes.ok) return null;
  const user = await userRes.json();
  if (!user?.id) return null;
  const profileRes = await sbFetch(
    `/rest/v1/profiles?id=eq.${user.id}&select=*&limit=1`
  );
  const profiles = profileRes.ok ? await profileRes.json() : [];
  const profile = Array.isArray(profiles) ? profiles[0] : null;
  return profile ? { user, profile } : null;
}

async function canUseTool(profile, toolId) {
  if (profile.role === "admin") return true;
  const accessRes = await sbFetch(
    `/rest/v1/ai_tool_access?tool_id=eq.${encodeURIComponent(toolId)}&select=tool_id,min_tier,enabled`
  );
  let minTier = "premium";
  let enabled = true;
  if (accessRes.ok) {
    const rows = await accessRes.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    if (row) {
      minTier = row.min_tier || minTier;
      enabled = row.enabled !== false;
    }
  }
  if (!enabled) return false;
  const have = TIER_RANK[profile.app_sub_tier] ?? 0;
  const need = TIER_RANK[minTier] ?? 0;
  return have >= need;
}

function canUseRemover(profile) {
  return profile.role === "admin";
}

const SONGWRITER_SYSTEM =
  "Ты профессиональный музыкальный продюсер и автор хитов. Твоя задача — помогать вокалистам писать тексты песен, придумывать структуру (Куплет, Бридж, Припев) и рифмы. Давай советы по вокалу (где петь тише (субтон), где использовать бэлтинг, где добавить вибрато). Общайся вдохновляюще, как наставник. Отвечай кратко и структурировано. Пиши только по-русски. Текст песни тоже на русском, если ученик явно не попросил другой язык.";

async function incomingRequest(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BYTES + 512 * 1024) {
      throw new Error("too_large");
    }
    chunks.push(chunk);
  }
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }
  return new Request(`http://127.0.0.1${req.url}`, {
    method: req.method,
    headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : Buffer.concat(chunks),
  });
}

async function wakeSpace(host) {
  try {
    await fetch(`${host}/gradio_api/info`, {
      headers: hfHeaders(),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    /* cold start */
  }
}

async function uploadToSpace(host, file) {
  const form = new FormData();
  form.append("files", file, file.name);
  const response = await fetch(
    `${host}/gradio_api/upload?upload_id=${randomUUID()}`,
    {
      method: "POST",
      headers: hfHeaders(),
      body: form,
      signal: AbortSignal.timeout(60_000),
    }
  );
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Upload failed (${response.status}): ${text.slice(0, 160)}`);
  }
  const payload = await response.json();
  if (!Array.isArray(payload) || !payload[0]) {
    throw new Error("Upload returned unexpected payload");
  }
  return payload[0];
}

function fileDataToUrl(host, data) {
  if (typeof data === "string") {
    if (data.startsWith("http")) return data;
    return new URL(data, host).href;
  }
  if (!data || typeof data !== "object") return null;
  if (data.url && typeof data.url === "string") {
    return data.url.startsWith("http") ? data.url : new URL(data.url, host).href;
  }
  if (data.path && typeof data.path === "string") {
    if (data.path.startsWith("http")) return data.path;
    return `${host}/gradio_api/file=${encodeURI(data.path)}`;
  }
  return null;
}

async function callGradio(host, endpoint, data) {
  const start = await fetch(`${host}/gradio_api/call/${endpoint}`, {
    method: "POST",
    headers: {
      ...hfHeaders(),
      "content-type": "application/json",
    },
    body: JSON.stringify({ data }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!start.ok) {
    const text = await start.text().catch(() => "");
    throw new Error(`Call failed (${start.status}): ${text.slice(0, 200)}`);
  }
  const started = await start.json();
  if (!started.event_id) throw new Error("Gradio не вернул event_id");

  const stream = await fetch(
    `${host}/gradio_api/call/${endpoint}/${started.event_id}`,
    {
      headers: hfHeaders(),
      signal: AbortSignal.timeout(240_000),
    }
  );
  if (!stream.ok) {
    const text = await stream.text().catch(() => "");
    throw new Error(`Queue failed (${stream.status}): ${text.slice(0, 200)}`);
  }
  const body = await stream.text();
  const blocks = body.split(/\n\n+/);
  let completePayload = null;
  for (const block of blocks) {
    const lines = block.split("\n");
    let eventName = "message";
    const dataLines = [];
    for (const line of lines) {
      if (line.startsWith("event:")) eventName = line.slice(6).trim();
      if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length === 0) continue;
    const payload = dataLines.join("\n");
    if (eventName === "error") {
      throw new Error(`Gradio error: ${payload.slice(0, 240)}`);
    }
    if (eventName === "complete") completePayload = payload;
  }
  if (!completePayload) {
    const dataLines = body
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim());
    completePayload = dataLines.at(-1) ?? null;
  }
  if (!completePayload) {
    throw new Error(`Пустой SSE-ответ Gradio: ${body.slice(0, 200)}`);
  }
  const parsed = JSON.parse(completePayload);
  if (!Array.isArray(parsed)) throw new Error("Gradio complete payload is not an array");
  return parsed;
}

function unwrapOutputs(parsed) {
  let out = parsed;
  while (Array.isArray(out) && out.length === 1 && Array.isArray(out[0])) {
    out = out[0];
  }
  return Array.isArray(out) ? out : [];
}

async function downloadBinary(url) {
  const response = await fetch(url, {
    headers: hfHeaders(),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error(`Stem download ${response.status}`);
  }
  const buf = Buffer.from(await response.arrayBuffer());
  if (!sniffAudio(buf)) {
    throw new Error(`Stem is not audio (${buf.subarray(0, 24).toString("latin1")})`);
  }
  return buf;
}

const STEMS = new Map();
const STEM_TTL_MS = 45 * 60 * 1000;
const MAX_STEM_JOBS = 6;

function pruneStems() {
  const now = Date.now();
  for (const [id, job] of STEMS) {
    if (job.exp < now) STEMS.delete(id);
  }
  while (STEMS.size > MAX_STEM_JOBS) {
    const oldest = STEMS.keys().next().value;
    if (!oldest) break;
    STEMS.delete(oldest);
  }
}

function sniffAudio(buf) {
  if (!buf || buf.length < 16) return null;
  const ascii = buf.subarray(0, 12).toString("latin1");
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WAVE") return "audio/wav";
  if (ascii.startsWith("ID3")) return "audio/mpeg";
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return "audio/mpeg";
  if (ascii.slice(4, 8) === "ftyp") return "audio/mp4";
  return null;
}

function rememberStems(vocalBuf, minusBuf) {
  const vocalMime = sniffAudio(vocalBuf);
  const minusMime = sniffAudio(minusBuf);
  if (!vocalMime || !minusMime) {
    throw new Error("Нейросеть вернула не аудио (пустой или битый файл)");
  }
  pruneStems();
  const id = randomUUID();
  STEMS.set(id, {
    vocal: vocalBuf,
    minus: minusBuf,
    vocalMime,
    minusMime,
    exp: Date.now() + STEM_TTL_MS,
  });
  return id;
}

function sendBuffer(req, res, buf, mime) {
  const total = buf.length;
  const range = String(req.headers.range || "");
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  res.setHeader("content-type", mime);
  res.setHeader("accept-ranges", "bytes");
  res.setHeader("cache-control", "private, max-age=1800");
  if (match) {
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Number(match[2]) : total - 1;
    if (start >= total || end >= total || start > end) {
      res.writeHead(416, { "content-range": `bytes */${total}` });
      res.end();
      return;
    }
    res.writeHead(206, {
      "content-range": `bytes ${start}-${end}/${total}`,
      "content-length": end - start + 1,
    });
    res.end(buf.subarray(start, end + 1));
    return;
  }
  res.writeHead(200, { "content-length": total });
  res.end(buf);
}

async function separateOnSpace(space, file) {
  await wakeSpace(space.host);
  const uploadedPath = await uploadToSpace(space.host, file);
  const outputs = unwrapOutputs(
    await callGradio(space.host, space.endpoint, [
      {
        path: uploadedPath,
        meta: { _type: "gradio.FileData" },
        orig_name: file.name,
        mime_type: file.type || "audio/mpeg",
      },
    ])
  );
  const vocalUrl = fileDataToUrl(space.host, outputs[0]);
  const minusUrl = fileDataToUrl(space.host, outputs[1]);
  if (!vocalUrl || !minusUrl) {
    throw new Error(`${space.id}: нет URL vocals/instrumental`);
  }
  const [vocalBuf, minusBuf] = await Promise.all([
    downloadBinary(vocalUrl),
    downloadBinary(minusUrl),
  ]);
  return { vocalBuf, minusBuf, model: `Demucs v4 · ${space.id}` };
}

async function handleSeparate(req, res) {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json(res, 503, { error: "Сервер нейросети ещё не настроен." });
  }
  if (!HF_TOKEN) {
    return json(res, 503, {
      error: "Сейчас обработка недоступна. Попробуйте позже.",
      code: "missing_hf_key",
    });
  }

  const auth = await getAuth(req.headers.authorization);
  if (!auth) {
    return json(res, 401, { error: "Authentication required" });
  }
  if (!(await canUseRemover(auth.profile))) {
    return json(res, 403, {
      error: "Удаление вокала доступно только администратору.",
      code: "admin_required",
    });
  }

  let request;
  try {
    request = await incomingRequest(req);
  } catch (error) {
    if (error instanceof Error && error.message === "too_large") {
      return json(res, 400, { error: "Файл больше 10MB" });
    }
    throw error;
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return json(res, 400, { error: "Audio file required" });
  }
  if (file.size > MAX_BYTES) {
    return json(res, 400, { error: "Файл больше 10MB" });
  }
  const name = file.name.toLowerCase();
  const type = file.type || "";
  const allowed =
    type.includes("mpeg") ||
    type.includes("wav") ||
    type.includes("x-wav") ||
    type.includes("wave") ||
    name.endsWith(".mp3") ||
    name.endsWith(".wav");
  if (!allowed) {
    return json(res, 400, { error: "Поддерживаются только MP3 и WAV" });
  }

  const attempts = [];
  let lastError = null;
  for (const space of spaceList()) {
    try {
      console.info(`[demucs] trying ${space.id}`);
      const separated = await separateOnSpace(space, file);
      const jobId = rememberStems(separated.vocalBuf, separated.minusBuf);
      return json(res, 200, {
        mode: "demucs",
        model: separated.model,
        space: space.id,
        vocalUrl: `/api/ai/stem/${jobId}/vocal`,
        minusUrl: `/api/ai/stem/${jobId}/minus`,
        vocalMime: STEMS.get(jobId)?.vocalMime || "audio/wav",
        minusMime: STEMS.get(jobId)?.minusMime || "audio/wav",
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      attempts.push(`${space.id}: ${msg}`);
      console.error(`[demucs] ${space.id} failed:`, msg);
      lastError = error;
    }
  }

  return json(res, 503, {
    code: "demucs_unavailable",
    error: "Сейчас обработка недоступна. Попробуйте через пару минут.",
    detail: lastError instanceof Error ? lastError.message : String(lastError ?? ""),
    attempts,
  });
}

async function readJsonBody(req) {
  const request = await incomingRequest(req);
  return request.json();
}

function sanitizeChatMessages(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    if (!item || (item.role !== "user" && item.role !== "assistant")) continue;
    const content = typeof item.content === "string" ? item.content.trim() : "";
    if (!content) continue;
    out.push({ role: item.role, content: content.slice(0, 4000) });
    if (out.length >= 40) break;
  }
  return out;
}

function groqReply(body) {
  const msg = body?.choices?.[0]?.message;
  if (!msg || typeof msg !== "object") return "";
  if (typeof msg.content === "string" && msg.content.trim()) return msg.content.trim();
  if (Array.isArray(msg.content)) {
    const text = msg.content
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("")
      .trim();
    if (text) return text;
  }
  if (typeof msg.reasoning === "string" && msg.reasoning.trim()) {
    return msg.reasoning.trim();
  }
  return "";
}

async function chatOnGroq(history) {
  const messages = [{ role: "system", content: SONGWRITER_SYSTEM }, ...history];
  const attempts = [];
  let lastError = "failed";
  for (const model of GROQ_MODELS) {
    console.info(`[songwriter] trying groq ${model}`);
    const isGptOss = model.startsWith("openai/gpt-oss");
    const response = await fetch(GROQ_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.8,
        messages,
        ...(isGptOss
          ? { max_completion_tokens: 1200, reasoning_effort: "low" }
          : { max_tokens: 900 }),
      }),
      signal: AbortSignal.timeout(45_000),
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok) {
      const reply = groqReply(body);
      if (reply) return { reply, model };
      lastError = "empty_reply";
      attempts.push(`${model}: empty_reply`);
      continue;
    }
    lastError = body?.error?.message || `groq_${response.status}`;
    attempts.push(`${model}: ${String(lastError).slice(0, 160)}`);
    console.error(`[songwriter] ${model} failed:`, lastError);
    if (response.status === 429) {
      const error = new Error("busy");
      error.code = "busy";
      error.attempts = attempts;
      throw error;
    }
    if (response.status === 401 || response.status === 403) {
      const error = new Error("llm_forbidden");
      error.code = "llm_forbidden";
      error.attempts = attempts;
      throw error;
    }
  }
  const error = new Error(lastError);
  error.attempts = attempts;
  throw error;
}

async function handleSongwriter(req, res) {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json(res, 503, { error: "Сервер нейросети ещё не настроен." });
  }
  if (!GROQ_API_KEY) {
    return json(res, 503, {
      error: "Сервер автора песен не настроен. Напишите преподавателю.",
      code: "missing_groq_key",
    });
  }
  const auth = await getAuth(req.headers.authorization);
  if (!auth) {
    return json(res, 401, {
      error: "Сессия истекла. Обновите страницу и войдите снова.",
      code: "unauthorized",
    });
  }
  if (!(await canUseTool(auth.profile, "songwriter"))) {
    return json(res, 403, {
      error: "Твой личный ИИ-продюсер доступен в Premium.",
      code: "premium_required",
    });
  }
  const payload = await readJsonBody(req).catch(() => null);
  const history = sanitizeChatMessages(payload?.messages);
  if (!history.length || history[history.length - 1].role !== "user") {
    return json(res, 400, {
      error: "Напишите, с чем помочь — тема, строка или рифма.",
      code: "empty_prompt",
    });
  }
  try {
    const generated = await chatOnGroq(history);
    return json(res, 200, { reply: generated.reply, model: generated.model });
  } catch (error) {
    const code = error?.code || "failed";
    if (code === "busy") {
      return json(res, 429, {
        code,
        error: "Продюсер сейчас занят. Подождите несколько секунд и повторите.",
        attempts: error.attempts || [],
      });
    }
    if (code === "llm_forbidden") {
      return json(res, 502, {
        code,
        error: "Groq отклонил API-ключ. Создайте новый ключ на console.groq.com и пришлите его.",
        attempts: error.attempts || [],
      });
    }
    return json(res, 503, {
      code,
      error: "Сейчас продюсер недоступен. Попробуйте через пару минут.",
      detail: error instanceof Error ? error.message : String(error ?? ""),
      attempts: error?.attempts || [],
    });
  }
}

const server = createServer((req, res) => {
  const url = req.url || "/";
  const path = url.split("?")[0];
  if (req.method === "GET" && (path === "/api/ai/__health" || path === "/__health")) {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end("ok");
    return;
  }
  const stem = /^\/api\/ai\/stem\/([^/]+)\/(vocal|minus)$/.exec(path);
  if (stem && (req.method === "GET" || req.method === "HEAD")) {
    pruneStems();
    const job = STEMS.get(stem[1]);
    if (!job) {
      json(res, 404, { error: "Файл уже истёк. Разделите трек ещё раз." });
      return;
    }
    const kind = stem[2];
    const buf = kind === "vocal" ? job.vocal : job.minus;
    const mime = kind === "vocal" ? job.vocalMime : job.minusMime;
    if (req.method === "HEAD") {
      res.writeHead(200, {
        "content-type": mime,
        "content-length": buf.length,
        "accept-ranges": "bytes",
      });
      res.end();
      return;
    }
    sendBuffer(req, res, buf, mime);
    return;
  }
  if (req.method === "POST" && path === "/api/ai/separate-vocal") {
    handleSeparate(req, res).catch((error) => {
      console.error("[ai-api]", error);
      json(res, 503, {
        error: "Сейчас обработка недоступна. Попробуйте через пару минут.",
      });
    });
    return;
  }
  if (req.method === "POST" && path === "/api/ai/songwriter-chat") {
    handleSongwriter(req, res).catch((error) => {
      console.error("[ai-api:songwriter]", error);
      json(res, 503, { error: "Сейчас продюсер недоступен. Попробуйте через пару минут." });
    });
    return;
  }
  json(res, 404, { error: "Not found" });
});

server.requestTimeout = 300_000;
server.headersTimeout = 300_000;
server.listen(PORT, BIND, () => {
  console.log(`[ai-api] ${BIND}:${PORT} supabase=${SUPABASE_URL || "(unset)"} hf=${HF_TOKEN ? "yes" : "no"} groq=${GROQ_API_KEY ? "yes" : "no"}`);
});
