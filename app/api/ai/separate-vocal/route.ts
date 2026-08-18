import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/server-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { mixStemsToInstrumental } from "@/lib/wav-stems";
import {
  aiToolDeniedMessage,
  canAccessAiTool,
  fetchAiToolAccess,
} from "@/lib/ai-tools-access";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BYTES = 10 * 1024 * 1024;
const HONEST_OVERLOAD =
  "Сейчас обработка недоступна. Попробуйте через пару минут.";

type SpaceConfig = {
  id: string;
  host: string;
  endpoint: string;
  mode: "two_stem" | "four_stem";
};

function spaceHost(spaceId: string) {
  return `https://${spaceId.replace("/", "-").toLowerCase()}.hf.space`;
}

function spaceList(): SpaceConfig[] {
  const preferred = process.env.DEMUCS_HF_SPACE?.trim();
  const list: SpaceConfig[] = [
    {
      id: preferred || "abidlabs/music-separation",
      host: spaceHost(preferred || "abidlabs/music-separation"),
      endpoint: "inference",
      mode: "two_stem",
    },
    {
      id: "abidlabs/music-separation",
      host: spaceHost("abidlabs/music-separation"),
      endpoint: "inference",
      mode: "two_stem",
    },
    {
      id: "ahk-d/Spleeter-HT-Demucs-Stem-Separation-2025",
      host: spaceHost("ahk-d/Spleeter-HT-Demucs-Stem-Separation-2025"),
      endpoint: "separate_selected_models",
      mode: "four_stem",
    },
  ];
  const seen = new Set<string>();
  return list.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
  };
}

async function wakeSpace(host: string, token: string) {
  try {
    await fetch(`${host}/gradio_api/info`, {
      headers: authHeaders(token),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    // ignore — cold start may still succeed on call
  }
}

async function uploadToSpace(
  host: string,
  token: string,
  file: File
): Promise<{ path: string; url?: string; orig_name: string; mime_type: string }> {
  const form = new FormData();
  form.append("files", file, file.name);

  const response = await fetch(`${host}/gradio_api/upload?upload_id=${randomUUID()}`, {
    method: "POST",
    headers: authHeaders(token),
    body: form,
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Upload failed (${response.status}): ${text.slice(0, 160)}`);
  }

  const payload = (await response.json()) as string[] | { error?: string };
  if (!Array.isArray(payload) || !payload[0]) {
    throw new Error(
      `Upload returned unexpected payload: ${JSON.stringify(payload).slice(0, 160)}`
    );
  }

  return {
    path: payload[0],
    orig_name: file.name,
    mime_type: file.type || "audio/mpeg",
  };
}

type FileData = {
  path?: string;
  url?: string | null;
  orig_name?: string;
  mime_type?: string;
  meta?: { _type: string };
};

function fileDataToUrl(host: string, data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const rec = data as FileData;
  if (rec.url && typeof rec.url === "string") {
    if (rec.url.startsWith("http")) return rec.url;
    return new URL(rec.url, host).href;
  }
  if (rec.path && typeof rec.path === "string") {
    if (rec.path.startsWith("http")) return rec.path;
    // Gradio serves uploaded/generated files via this path
    return `${host}/gradio_api/file=${encodeURI(rec.path)}`;
  }
  return null;
}

async function callGradioEndpoint(
  host: string,
  token: string,
  endpoint: string,
  data: unknown[]
): Promise<unknown[]> {
  const start = await fetch(`${host}/gradio_api/call/${endpoint}`, {
    method: "POST",
    headers: {
      ...authHeaders(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ data }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!start.ok) {
    const text = await start.text().catch(() => "");
    throw new Error(`Call failed (${start.status}): ${text.slice(0, 200)}`);
  }

  const started = (await start.json()) as { event_id?: string };
  if (!started.event_id) {
    throw new Error("Gradio не вернул event_id");
  }

  const stream = await fetch(
    `${host}/gradio_api/call/${endpoint}/${started.event_id}`,
    {
      headers: authHeaders(token),
      signal: AbortSignal.timeout(240_000),
    }
  );

  if (!stream.ok) {
    const text = await stream.text().catch(() => "");
    throw new Error(`Queue failed (${stream.status}): ${text.slice(0, 200)}`);
  }

  const body = await stream.text();
  // Gradio SSE blocks separated by blank lines: event + data (data may be multi-line JSON)
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
      throw new Error(`Gradio error: ${data.slice(0, 240)}`);
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

  if (!completePayload) {
    throw new Error(`Пустой SSE-ответ Gradio: ${body.slice(0, 200)}`);
  }

  const parsed = JSON.parse(completePayload) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("Gradio complete payload is not an array");
  }
  return parsed;
}

async function downloadBinary(url: string, token: string): Promise<ArrayBuffer> {
  const response = await fetch(url, {
    headers: authHeaders(token),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error(`Stem download ${response.status}: ${url.slice(0, 100)}`);
  }
  return response.arrayBuffer();
}

async function uploadStem(
  userId: string,
  kind: "vocal" | "minus",
  buffer: Buffer,
  mime: string
) {
  const admin = getSupabaseAdmin();
  const ext = mime.includes("mpeg") || mime.includes("mp3") ? "mp3" : "wav";
  const objectPath = `ai-stems/${userId}/${kind}-${randomUUID()}.${ext}`;
  const { error } = await admin.storage.from("chat-media").upload(objectPath, buffer, {
    contentType: mime,
    upsert: false,
  });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data, error: signError } = await admin.storage
    .from("chat-media")
    .createSignedUrl(objectPath, 60 * 60 * 24);
  if (signError || !data?.signedUrl) {
    throw new Error(signError?.message || "Signed URL failed");
  }
  return { url: data.signedUrl, path: objectPath };
}

async function separateOnSpace(space: SpaceConfig, token: string, file: File) {
  await wakeSpace(space.host, token);
  const uploaded = await uploadToSpace(space.host, token, file);
  const fileData = {
    path: uploaded.path,
    meta: { _type: "gradio.FileData" as const },
    orig_name: file.name,
    mime_type: file.type || "audio/mpeg",
  };

  const payload =
    space.mode === "two_stem"
      ? [fileData]
      : [fileData, true, false];

  const outputs = await callGradioEndpoint(
    space.host,
    token,
    space.endpoint,
    payload
  );

  if (space.mode === "two_stem") {
    const vocalUrl = fileDataToUrl(space.host, outputs[0]);
    const minusUrl = fileDataToUrl(space.host, outputs[1]);
    if (!vocalUrl || !minusUrl) {
      throw new Error(`${space.id}: нет URL vocals/instrumental`);
    }
    const [vocalBuf, minusBuf] = await Promise.all([
      downloadBinary(vocalUrl, token),
      downloadBinary(minusUrl, token),
    ]);
    return {
      vocalBuf: Buffer.from(vocalBuf),
      minusBuf: Buffer.from(minusBuf),
      model: `Demucs v4 (2-stem) · ${space.id}`,
    };
  }

  const urls = [0, 1, 2, 3].map((i) => fileDataToUrl(space.host, outputs[i]));
  const [drumUrl, bassUrl, otherUrl, vocalUrl] = urls;
  if (!vocalUrl || !drumUrl || !bassUrl || !otherUrl) {
    throw new Error(`${space.id}: нет URL 4 stems`);
  }
  const [vocalBuf, drumBuf, bassBuf, otherBuf] = await Promise.all([
    downloadBinary(vocalUrl, token),
    downloadBinary(drumUrl, token),
    downloadBinary(bassUrl, token),
    downloadBinary(otherUrl, token),
  ]);
  return {
    vocalBuf: Buffer.from(vocalBuf),
    minusBuf: mixStemsToInstrumental([drumBuf, bassBuf, otherBuf]),
    model: `Demucs v4 (4-stem mix) · ${space.id}`,
  };
}

function humanizeError(error: unknown, attempts: string[] = []) {
  const detail =
    error instanceof Error ? error.message : String(error ?? "unknown");

  if (/HUGGINGFACE_API_KEY/i.test(detail)) {
    return {
      code: "missing_hf_key",
      error: "Сейчас обработка недоступна. Попробуйте позже.",
      detail,
      attempts,
    };
  }

  return {
    code: "demucs_unavailable",
    error: HONEST_OVERLOAD,
    detail,
    attempts,
  };
}

export async function POST(request: NextRequest) {
  const attempts: string[] = [];

  try {
    const auth = await getRequestUser(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const access = await fetchAiToolAccess(auth.admin);
    if (
      !canAccessAiTool(
        "remover",
        auth.profile.app_sub_tier,
        auth.profile.role === "admin",
        access
      )
    ) {
      return NextResponse.json(
        { error: aiToolDeniedMessage("remover", access) },
        { status: 403 }
      );
    }

    const apiKey = process.env.HUGGINGFACE_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        humanizeError(new Error("HUGGINGFACE_API_KEY missing")),
        { status: 503 }
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Audio file required" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Файл больше 10MB" }, { status: 400 });
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
      return NextResponse.json(
        { error: "Поддерживаются только MP3 и WAV" },
        { status: 400 }
      );
    }

    let lastError: unknown = null;
    for (const space of spaceList()) {
      try {
        console.info(`[demucs] trying ${space.id} via REST…`);
        const separated = await separateOnSpace(space, apiKey, file);
        const [vocal, minus] = await Promise.all([
          uploadStem(auth.user.id, "vocal", separated.vocalBuf, "audio/wav"),
          uploadStem(auth.user.id, "minus", separated.minusBuf, "audio/wav"),
        ]);

        return NextResponse.json({
          mode: "demucs",
          model: separated.model,
          space: space.id,
          vocalUrl: vocal.url,
          minusUrl: minus.url,
          vocalPath: vocal.path,
          minusPath: minus.path,
          vocalMime: "audio/wav",
          minusMime: "audio/wav",
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        attempts.push(`${space.id}: ${msg}`);
        console.error(`[demucs] ${space.id} failed:`, msg);
        lastError = error;
      }
    }

    return NextResponse.json(humanizeError(lastError, attempts), { status: 503 });
  } catch (error) {
    console.error("separate-vocal Demucs failed:", error);
    return NextResponse.json(humanizeError(error, attempts), { status: 503 });
  }
}
