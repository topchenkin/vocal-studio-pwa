const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const HF_MODEL_URL =
  "https://api-inference.huggingface.co/models/facebook/musicgen-small";
const MAX_PROMPT = 400;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function toBase64(bytes: Uint8Array) {
  const chunk = 0x2000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function userIdFromJwt(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  const url = Deno.env.get("SUPABASE_URL") || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: {
      Authorization: auth,
      apikey: anon,
    },
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  try {
    const userId = await userIdFromJwt(req);
    if (!userId) {
      return json({ error: "unauthorized" }, 401);
    }
    const profile = await loadProfile(userId);
    if (!canGenerate(profile)) {
      return json({ error: "premium_required" }, 403);
    }

    const payload = (await req.json().catch(() => null)) as {
      prompt?: unknown;
    } | null;
    const prompt =
      typeof payload?.prompt === "string" ? payload.prompt.trim() : "";
    if (prompt.length < 3) {
      return json({ error: "empty_prompt" }, 400);
    }
    if (prompt.length > MAX_PROMPT) {
      return json({ error: "prompt_too_long" }, 400);
    }

    const hfKey = Deno.env.get("HUGGINGFACE_API_KEY")?.trim();
    if (!hfKey) {
      return json({ error: "missing_hf_key" }, 500);
    }

    const hf = await fetch(HF_MODEL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${hfKey}`,
        "Content-Type": "application/json",
        Accept: "audio/flac, audio/wav, audio/*, application/json",
      },
      body: JSON.stringify({ inputs: prompt }),
      signal: AbortSignal.timeout(55_000),
    });

    const contentType = hf.headers.get("content-type") || "";
    if (contentType.includes("application/json") || hf.status === 503) {
      const body = (await hf.json().catch(() => ({}))) as {
        error?: string;
        estimated_time?: number;
      };
      const loading =
        hf.status === 503 ||
        /load/i.test(String(body.error || ""));
      if (loading) {
        const estimated =
          typeof body.estimated_time === "number" &&
          Number.isFinite(body.estimated_time)
            ? Math.max(1, Math.round(body.estimated_time))
            : 20;
        return json({ error: "loading", estimated_time: estimated });
      }
      return json(
        { error: body.error || `huggingface_${hf.status}` },
        hf.ok ? 500 : hf.status
      );
    }

    if (!hf.ok) {
      return json({ error: `huggingface_${hf.status}` }, 502);
    }

    const bytes = new Uint8Array(await hf.arrayBuffer());
    if (bytes.byteLength < 64) {
      return json({ error: "empty_audio" }, 502);
    }
    return json({
      audioBase64: toBase64(bytes),
      mime: contentType.split(";")[0]?.trim() || "audio/flac",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed";
    if (/timeout|abort/i.test(message)) {
      return json({ error: "timeout" }, 504);
    }
    return json({ error: "failed" }, 500);
  }
});
