const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MUSICGEN_SPACE = "https://facebook-musicgen.hf.space";
const MAX_PROMPT = 400;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function toBase64(bytes: Uint8Array) {
  const chunk = 0x800;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
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

function canGenerate(profile: {
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

function fileUrlFromGradio(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const rec = data as { url?: string | null; path?: string };
  if (typeof rec.url === "string" && rec.url.length > 0) {
    if (rec.url.startsWith("http")) return rec.url;
    return new URL(rec.url, MUSICGEN_SPACE).href;
  }
  if (typeof rec.path === "string" && rec.path.length > 0) {
    if (rec.path.startsWith("http")) return rec.path;
    return `${MUSICGEN_SPACE}/gradio_api/file=${encodeURI(rec.path)}`;
  }
  return null;
}

function extractFile(parsed: unknown): unknown {
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      const found = extractFile(item);
      if (found) return found;
    }
    return null;
  }
  if (parsed && typeof parsed === "object") {
    const rec = parsed as { path?: unknown; url?: unknown };
    if (typeof rec.path === "string" || typeof rec.url === "string") return parsed;
  }
  return null;
}

type SpaceResult =
  | { bytes: Uint8Array; mime: string }
  | { error: string; estimated_time?: number; status: number };

async function bytesFromMusicGenSpace(
  prompt: string,
  hfKey: string
): Promise<SpaceResult> {
  try {
    const woke = await fetch(`${MUSICGEN_SPACE}/gradio_api/info`, {
      headers: authHeaders(hfKey),
      signal: AbortSignal.timeout(20_000),
    });
    if (woke.status >= 500) {
      return { error: "loading", estimated_time: 30, status: 200 };
    }
  } catch {
    return { error: "loading", estimated_time: 25, status: 200 };
  }

  const start = await fetch(`${MUSICGEN_SPACE}/gradio_api/call/predict_batched`, {
    method: "POST",
    headers: {
      ...authHeaders(hfKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ data: [prompt, null] }),
    signal: AbortSignal.timeout(30_000),
  });
  if (start.status === 429) return { error: "busy", status: 429 };
  if (start.status >= 500) {
    return { error: "loading", estimated_time: 30, status: 200 };
  }
  if (!start.ok) {
    const text = await start.text().catch(() => "");
    if (/load|sleep|start|queue/i.test(text)) {
      return { error: "loading", estimated_time: 30, status: 200 };
    }
    return { error: `space_${start.status}`, status: 502 };
  }
  const started = (await start.json()) as { event_id?: string };
  if (!started.event_id) return { error: "space_no_event", status: 502 };

  const stream = await fetch(
    `${MUSICGEN_SPACE}/gradio_api/call/predict_batched/${started.event_id}`,
    {
      headers: authHeaders(hfKey),
      signal: AbortSignal.timeout(150_000),
    }
  );
  if (!stream.ok) return { error: `space_queue_${stream.status}`, status: 502 };
  const body = await stream.text();

  const blocks = body.split(/\n\n+/);
  let completePayload: string | null = null;
  for (const block of blocks) {
    const lines = block.split("\n");
    let eventName = "message";
    const dataLines: string[] = [];
    for (const line of lines) {
      if (line.startsWith("event:")) eventName = line.slice(6).trim();
      if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length === 0) continue;
    const data = dataLines.join("\n");
    if (eventName === "error") {
      if (/load|sleep|start/i.test(data)) {
        return { error: "loading", estimated_time: 30, status: 200 };
      }
      if (/quota|gpu|busy|congest/i.test(data)) {
        return { error: "busy", status: 503 };
      }
      return { error: "space_gpu", status: 503 };
    }
    if (eventName === "complete") completePayload = data;
  }
  if (!completePayload) {
    const dataLines = body
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim());
    completePayload = dataLines.at(-1) ?? null;
  }
  if (!completePayload) return { error: "space_empty", status: 502 };

  let parsed: unknown;
  try {
    parsed = JSON.parse(completePayload);
  } catch {
    return { error: "space_empty", status: 502 };
  }
  const fileUrl = fileUrlFromGradio(extractFile(parsed));
  if (!fileUrl) return { error: "space_no_file", status: 502 };

  const audio = await fetch(fileUrl, {
    headers: authHeaders(hfKey),
    signal: AbortSignal.timeout(60_000),
  });
  if (!audio.ok) return { error: `space_download_${audio.status}`, status: 502 };
  const bytes = new Uint8Array(await audio.arrayBuffer());
  if (bytes.byteLength < 64) return { error: "empty_audio", status: 502 };
  const mime =
    audio.headers.get("content-type")?.split(";")[0]?.trim() || "audio/wav";
  return { bytes, mime };
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
    if (!canGenerate(profile)) return json({ error: "premium_required" }, 403);

    const payload = (await req.json().catch(() => null)) as { prompt?: unknown } | null;
    const prompt = typeof payload?.prompt === "string" ? payload.prompt.trim() : "";
    if (prompt.length < 3) return json({ error: "empty_prompt" }, 400);
    if (prompt.length > MAX_PROMPT) return json({ error: "prompt_too_long" }, 400);

    const hfKey = Deno.env.get("HUGGINGFACE_API_KEY")?.trim();
    if (!hfKey) return json({ error: "missing_hf_key" }, 500);

    const spaced = await bytesFromMusicGenSpace(prompt, hfKey);
    if ("bytes" in spaced) {
      return json({ audioBase64: toBase64(spaced.bytes), mime: spaced.mime });
    }
    if (spaced.error === "loading") {
      return json({ error: "loading", estimated_time: spaced.estimated_time ?? 30 });
    }
    return json({ error: spaced.error || "failed" }, spaced.status || 502);
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed";
    console.error("generate-music failed", message);
    if (/timeout|abort/i.test(message)) return json({ error: "timeout" }, 504);
    return json({ error: "failed" }, 500);
  }
});
