const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT =
  "Ты профессиональный музыкальный продюсер и автор хитов. Твоя задача — помогать вокалистам писать тексты песен, придумывать структуру (Куплет, Бридж, Припев) и рифмы. Давай советы по вокалу (где петь тише (субтон), где использовать бэлтинг, где добавить вибрато). Общайся вдохновляюще, как наставник. Отвечай кратко и структурировано.";

const MAX_MESSAGES = 40;
const MAX_CONTENT = 4000;
const GROQ_MODELS = [
  "llama3-8b-8192",
  "llama-3.1-8b-instant",
  "openai/gpt-oss-20b",
];
const OPENAI_MODELS = ["gpt-4o-mini", "gpt-4.1-mini"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function userIdFromJwt(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  const url = Deno.env.get("SUPABASE_URL") || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: anon },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { id?: string };
  return typeof body.id === "string" ? body.id : null;
}

async function loadProfile(userId: string) {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const response = await fetch(
    `${url}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=role,app_sub_tier,app_sub_expires_at`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    }
  );
  if (!response.ok) return null;
  const rows = (await response.json()) as Array<{
    role?: string;
    app_sub_tier?: string;
    app_sub_expires_at?: string | null;
  }>;
  return rows[0] ?? null;
}

function canUse(profile: {
  role?: string;
  app_sub_tier?: string;
  app_sub_expires_at?: string | null;
} | null) {
  if (!profile) return false;
  if (profile.role === "admin") return true;
  const expired =
    typeof profile.app_sub_expires_at === "string" &&
    profile.app_sub_expires_at.length > 0 &&
    new Date(profile.app_sub_expires_at).getTime() <= Date.now();
  const tier = expired ? "none" : profile.app_sub_tier;
  return tier === "premium" || tier === "vip";
}

type ChatMessage = { role: "user" | "assistant"; content: string };

function sanitizeMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as { role?: unknown; content?: unknown };
    const role = rec.role === "assistant" ? "assistant" : rec.role === "user" ? "user" : null;
    if (!role) continue;
    const content = typeof rec.content === "string" ? rec.content.trim() : "";
    if (!content) continue;
    out.push({ role, content: content.slice(0, MAX_CONTENT) });
    if (out.length >= MAX_MESSAGES) break;
  }
  return out;
}

async function completeChat(
  url: string,
  apiKey: string,
  models: string[],
  messages: Array<{ role: string; content: string }>
): Promise<{ reply?: string; error?: string; status?: number }> {
  let lastStatus = 502;
  let lastError = "failed";
  for (const model of models) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.8,
        max_tokens: 900,
        messages,
      }),
      signal: AbortSignal.timeout(45_000),
    });
    lastStatus = response.status;
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
      choices?: Array<{ message?: { content?: string } }>;
    };
    if (response.ok) {
      const reply = body.choices?.[0]?.message?.content?.trim() || "";
      if (reply) return { reply };
      lastError = "empty_reply";
      continue;
    }
    lastError = body.error?.message || `llm_${response.status}`;
    if (response.status === 401 || response.status === 403) {
      return { error: "llm_forbidden", status: response.status };
    }
    if (response.status === 429) return { error: "busy", status: 429 };
    if (response.status !== 400 && response.status !== 404) break;
  }
  return { error: lastError, status: lastStatus };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  try {
    const userId = await userIdFromJwt(req);
    if (!userId) return json({ error: "unauthorized" }, 401);
    const profile = await loadProfile(userId);
    if (!canUse(profile)) return json({ error: "premium_required" }, 403);

    const payload = (await req.json().catch(() => null)) as {
      messages?: unknown;
    } | null;
    const history = sanitizeMessages(payload?.messages);
    if (history.length === 0) return json({ error: "empty_prompt" }, 400);
    if (history.at(-1)?.role !== "user") {
      return json({ error: "empty_prompt" }, 400);
    }

    const groqKey = Deno.env.get("GROQ_API_KEY")?.trim();
    const openaiKey = Deno.env.get("OPENAI_API_KEY")?.trim();
    const messages = [{ role: "system", content: SYSTEM_PROMPT }, ...history];

    let result: { reply?: string; error?: string; status?: number };
    if (groqKey) {
      result = await completeChat(
        "https://api.groq.com/openai/v1/chat/completions",
        groqKey,
        GROQ_MODELS,
        messages
      );
    } else if (openaiKey) {
      result = await completeChat(
        "https://api.openai.com/v1/chat/completions",
        openaiKey,
        OPENAI_MODELS,
        messages
      );
    } else {
      return json({ error: "missing_llm_key" }, 500);
    }

    if (result.reply) return json({ reply: result.reply });
    if (result.error === "busy") return json({ error: "busy" }, 429);
    if (result.error === "llm_forbidden") return json({ error: "llm_forbidden" }, 502);
    return json({ error: result.error || "failed" }, result.status || 502);
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed";
    console.error("songwriter-chat failed", message);
    if (/timeout|abort/i.test(message)) return json({ error: "timeout" }, 504);
    return json({ error: "failed" }, 500);
  }
});
