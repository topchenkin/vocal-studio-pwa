import { NextRequest, NextResponse } from "next/server";
import { Client } from "@gradio/client";
import { getRequestUser } from "@/lib/server-auth";
import {
  aiToolDeniedMessage,
  canAccessAiTool,
  fetchAiToolAccess,
} from "@/lib/ai-tools-access";
import {
  bucketNeuralMatches,
  type NeuralRawMatch,
} from "@/lib/neural-voice-match";
import type { TimbreGender } from "@/lib/timbre-features";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BYTES = 8 * 1024 * 1024;

function spaceHost(spaceId: string) {
  return `https://${spaceId.replace("/", "-").toLowerCase()}.hf.space`;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getRequestUser(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const access = await fetchAiToolAccess(auth.admin);
    if (
      !canAccessAiTool(
        "timbre",
        auth.profile.app_sub_tier,
        auth.profile.role === "admin",
        access
      )
    ) {
      return NextResponse.json(
        { error: aiToolDeniedMessage("timbre", access) },
        { status: 403 }
      );
    }

    const spaceId =
      process.env.VOICE_MATCH_HF_SPACE?.trim() ||
      process.env.TIMBRE_VOICE_MATCH_SPACE?.trim();
    const apiKey = process.env.HUGGINGFACE_API_KEY?.trim();

    if (!spaceId) {
      return NextResponse.json(
        {
          error: "Сравнение временно недоступно. Попробуйте позже.",
          code: "space_not_configured",
        },
        { status: 503 }
      );
    }
    if (!apiKey) {
      return NextResponse.json(
        {
          error: "Сравнение временно недоступно. Попробуйте позже.",
          code: "hf_key_missing",
        },
        { status: 503 }
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    const genderRaw = String(form.get("gender") ?? "male");
    const gender: TimbreGender = genderRaw === "female" ? "female" : "male";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Ожидается файл file" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Файл слишком большой" }, { status: 400 });
    }

    const host = spaceHost(spaceId);
    // Wake cold Space
    try {
      await fetch(`${host}/gradio_api/info`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(25_000),
      });
    } catch {
      /* cold start */
    }

    const bytes = await file.arrayBuffer();
    const blob = new Blob([bytes], { type: file.type || "audio/wav" });

    const client = await Client.connect(spaceId, {
      token: apiKey as `hf_${string}`,
    });

    let result: { data: unknown };
    try {
      result = (await client.predict("/match", {
        audio: blob,
        top_n: 100,
      })) as { data: unknown };
    } catch {
      // Older Gradio Interfaces expose /predict
      result = (await client.predict("/predict", {
        audio: blob,
        top_n: 100,
      })) as { data: unknown };
    }

    const rawOut = Array.isArray(result.data) ? result.data[0] : result.data;
    const text =
      typeof rawOut === "string" ? rawOut : JSON.stringify(rawOut ?? {});
    let parsed: {
      error?: string;
      engine?: string;
      matches?: NeuralRawMatch[];
    } = {};
    try {
      parsed = JSON.parse(text) as typeof parsed;
    } catch {
      return NextResponse.json(
        { error: "Space вернул не-JSON", detail: text.slice(0, 400) },
        { status: 502 }
      );
    }

    if (parsed.error && (!parsed.matches || parsed.matches.length === 0)) {
      return NextResponse.json(
        { error: parsed.error, code: "nn_failed" },
        { status: 502 }
      );
    }

    const matches = (parsed.matches ?? [])
      .filter((m) => m && typeof m.name === "string" && typeof m.score === "number")
      .sort((a, b) => b.score - a.score);

    if (matches.length === 0) {
      return NextResponse.json(
        { error: "Нейросеть не вернула совпадений", code: "nn_empty" },
        { status: 502 }
      );
    }

    const bucketed = bucketNeuralMatches(matches, gender, 5);

    return NextResponse.json(
      {
        gender,
        ...bucketed,
        engine: parsed.engine ?? bucketed.engine ?? "resemblyzer",
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (err) {
    console.error("[match-voice]", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Ошибка нейросетевого сравнения голоса",
        code: "nn_exception",
      },
      { status: 500 }
    );
  }
}
