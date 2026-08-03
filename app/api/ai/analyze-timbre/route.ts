import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/server-auth";
import {
  aiToolDeniedMessage,
  canAccessAiTool,
  fetchAiToolAccess,
} from "@/lib/ai-tools-access";
import { classifySingingGender } from "@/lib/singing-gender";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;

const GENDER_MODELS = [
  process.env.TIMBRE_GENDER_HF_MODEL?.trim(),
  "prithivMLmods/Common-Voice-Gender-Detection",
  "alefiury/wav2vec2-large-xlsr-53-gender-recognition-librispeech",
].filter(Boolean) as string[];

type GenderLabel = "female" | "male";

type HfClass = { label?: string; score?: number };

function parseGenderFromHf(data: unknown): {
  gender: GenderLabel;
  confidence: number;
  raw: HfClass[];
} | null {
  if (!Array.isArray(data) || data.length === 0) return null;
  const rows = data as HfClass[];
  let female = 0;
  let male = 0;
  for (const row of rows) {
    const label = String(row.label ?? "").toLowerCase();
    const score = typeof row.score === "number" ? row.score : 0;
    if (
      label.includes("female") ||
      label === "f" ||
      label.includes("woman") ||
      label === "0"
    ) {
      female = Math.max(female, score);
    }
    if (
      label.includes("male") ||
      label === "m" ||
      label.includes("man") ||
      label === "1"
    ) {
      // avoid matching "female"
      if (!label.includes("female")) male = Math.max(male, score);
    }
  }
  if (female <= 0 && male <= 0) {
    // pick top label literally
    const top = [...rows].sort(
      (a, b) => (b.score ?? 0) - (a.score ?? 0)
    )[0];
    const label = String(top?.label ?? "").toLowerCase();
    if (label.includes("female")) {
      return { gender: "female", confidence: top?.score ?? 0.5, raw: rows };
    }
    if (label.includes("male")) {
      return { gender: "male", confidence: top?.score ?? 0.5, raw: rows };
    }
    return null;
  }
  const gender: GenderLabel = female >= male ? "female" : "male";
  const confidence = Math.max(female, male);
  return { gender, confidence, raw: rows };
}

async function classifyGenderHf(
  wavBytes: ArrayBuffer,
  apiKey: string
): Promise<{
  gender: GenderLabel;
  confidence: number;
  model: string;
  raw: HfClass[];
} | null> {
  const errors: string[] = [];
  for (const model of GENDER_MODELS) {
    const endpoints = [
      `https://router.huggingface.co/hf-inference/models/${model}`,
      `https://api-inference.huggingface.co/models/${model}`,
    ];
    for (const url of endpoints) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "audio/wav",
            Accept: "application/json",
          },
          body: wavBytes,
          signal: AbortSignal.timeout(45_000),
        });
        const text = await response.text();
        let data: unknown = null;
        try {
          data = JSON.parse(text);
        } catch {
          errors.push(`${model}: non-json ${response.status}`);
          continue;
        }
        if (!response.ok) {
          const errMsg =
            typeof data === "object" &&
            data &&
            "error" in data &&
            typeof (data as { error: unknown }).error === "string"
              ? (data as { error: string }).error
              : `HTTP ${response.status}`;
          // Model loading — retry once briefly
          if (/loading|currently loading/i.test(errMsg)) {
            await new Promise((r) => setTimeout(r, 4000));
            continue;
          }
          errors.push(`${model}: ${errMsg}`);
          continue;
        }
        const parsed = parseGenderFromHf(data);
        if (parsed) {
          return {
            gender: parsed.gender,
            confidence: parsed.confidence,
            model,
            raw: parsed.raw,
          };
        }
        errors.push(`${model}: unexpected payload`);
      } catch (err) {
        errors.push(
          `${model}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }
  console.warn("[analyze-timbre] HF gender failed:", errors.join(" | "));
  return null;
}

/** Minimal WAV PCM decode for formant fallback (mono/stereo 16-bit). */
function decodeWavPcm(buf: ArrayBuffer): { samples: Float32Array; sampleRate: number } | null {
  const view = new DataView(buf);
  if (view.byteLength < 44) return null;
  const riff = String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3)
  );
  if (riff !== "RIFF") return null;

  let offset = 12;
  let sampleRate = 16000;
  let numChannels = 1;
  let bitsPerSample = 16;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= view.byteLength) {
    const id = String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3)
    );
    const size = view.getUint32(offset + 4, true);
    if (id === "fmt ") {
      numChannels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      bitsPerSample = view.getUint16(offset + 22, true);
    } else if (id === "data") {
      dataOffset = offset + 8;
      dataSize = size;
      break;
    }
    offset += 8 + size + (size % 2);
  }
  if (dataOffset < 0 || bitsPerSample !== 16) return null;

  const samplesCount = Math.floor(dataSize / 2);
  const interleaved = new Float32Array(samplesCount);
  for (let i = 0; i < samplesCount; i += 1) {
    interleaved[i] = view.getInt16(dataOffset + i * 2, true) / 32768;
  }
  if (numChannels === 1) {
    return { samples: interleaved, sampleRate };
  }
  const mono = new Float32Array(Math.floor(samplesCount / numChannels));
  for (let i = 0; i < mono.length; i += 1) {
    let s = 0;
    for (let ch = 0; ch < numChannels; ch += 1) {
      s += interleaved[i * numChannels + ch] ?? 0;
    }
    mono[i] = s / numChannels;
  }
  return { samples: mono, sampleRate };
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

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Ожидается файл file" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "Файл слишком большой (макс. 8 МБ)" },
        { status: 400 }
      );
    }

    const wavBytes = await file.arrayBuffer();
    const apiKey = process.env.HUGGINGFACE_API_KEY?.trim();

    const localGenderRaw = String(form.get("localGender") ?? "");
    const localPitchHz = Number(form.get("localPitchHz") ?? 0);
    const localConfidence = String(form.get("localConfidence") ?? "");
    const clientGender: GenderLabel | null =
      localGenderRaw === "female" || localGenderRaw === "male"
        ? localGenderRaw
        : null;

    let gender: GenderLabel | null = null;
    let confidence = 0;
    let source: "hf_model" | "pitch" | "client" | "mixed" = "pitch";
    let model: string | null = null;
    let debug = "";

    const decoded = decodeWavPcm(wavBytes);
    const singing = decoded
      ? classifySingingGender(decoded.samples, decoded.sampleRate)
      : null;
    if (singing) {
      gender = singing.gender;
      confidence =
        singing.confidence === "high"
          ? 0.85
          : singing.confidence === "medium"
            ? 0.7
            : 0.55;
      source = singing.source === "pitch" ? "pitch" : "mixed";
      debug = singing.debug;
    }

    // Prefer client octave-safe classifier when confident (same code path as UI)
    if (clientGender && (localConfidence === "high" || localConfidence === "medium")) {
      gender = clientGender;
      confidence = Math.max(
        confidence,
        localConfidence === "high" ? 0.88 : 0.72
      );
      source = "client";
      debug = `client ${clientGender} F0̃=${localPitchHz || "—"} · ${debug}`;
    }

    // Soft F0 clamps from SERVER octave-safe pitch (not raw client number alone)
    const f0 = singing?.pitchMedianHz ?? 0;
    if (f0 > 0 && f0 <= 160) {
      gender = "male";
      confidence = Math.max(confidence, 0.9);
      source = "pitch";
      debug = `F0 clamp male ${f0.toFixed(0)}Hz · ${debug}`;
    } else if (f0 >= 260 && (singing?.pitchFrames ?? 0) >= 6) {
      gender = "female";
      confidence = Math.max(confidence, 0.9);
      source = "pitch";
      debug = `F0 clamp female ${f0.toFixed(0)}Hz · ${debug}`;
    }

    // HF soft confirm only — never flip a clear F0 decision
    if (apiKey && gender) {
      const clear =
        (f0 > 0 && f0 <= 160) || (f0 >= 260 && (singing?.pitchFrames ?? 0) >= 6);
      if (!clear) {
        const hf = await classifyGenderHf(wavBytes, apiKey);
        if (hf && hf.confidence >= 0.75 && hf.gender === gender) {
          confidence = Math.min(0.98, confidence + 0.08);
          source = "hf_model";
          model = hf.model;
        } else if (hf && hf.confidence >= 0.9 && singing?.confidence === "low") {
          gender = hf.gender;
          confidence = hf.confidence;
          source = "hf_model";
          model = hf.model;
        }
      }
    } else if (apiKey && !gender) {
      const hf = await classifyGenderHf(wavBytes, apiKey);
      if (hf) {
        gender = hf.gender;
        confidence = hf.confidence;
        source = "hf_model";
        model = hf.model;
      }
    }

    if (!gender) {
      return NextResponse.json(
        {
          error:
            "Не удалось определить пол голоса. Спойте чётче в микрофон (без колонок).",
          code: "gender_failed",
        },
        { status: 422 }
      );
    }

    const confidenceLabel =
      confidence >= 0.8 ? "high" : confidence >= 0.62 ? "medium" : "low";

    // Optional: recognize commercial track (Ed Sheeran from speakers, etc.)
    let recognized: {
      artist: string;
      title: string;
      score: number | null;
    } | null = null;
    const auddToken = process.env.AUDD_API_TOKEN?.trim();
    if (auddToken) {
      try {
        const auddForm = new FormData();
        auddForm.append("api_token", auddToken);
        auddForm.append(
          "file",
          new Blob([wavBytes], { type: "audio/wav" }),
          "clip.wav"
        );
        auddForm.append("return", "apple_music");
        const auddRes = await fetch("https://api.audd.io/", {
          method: "POST",
          body: auddForm,
          signal: AbortSignal.timeout(20_000),
        });
        const auddJson = (await auddRes.json()) as {
          result?: { artist?: string; title?: string; song_link?: string } | null;
          status?: string;
        };
        if (auddJson.result?.artist) {
          recognized = {
            artist: auddJson.result.artist,
            title: auddJson.result.title ?? "",
            score: null,
          };
        }
      } catch (err) {
        console.warn("[analyze-timbre] AudD:", err);
      }
    }

    return NextResponse.json(
      {
        gender,
        confidence,
        confidenceLabel,
        source,
        model,
        debug,
        recognized,
        dbHint: "voice_embed_v4_pitch",
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          Pragma: "no-cache",
        },
      }
    );
  } catch (err) {
    console.error("[analyze-timbre]", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Ошибка анализа тембра",
      },
      { status: 500 }
    );
  }
}
