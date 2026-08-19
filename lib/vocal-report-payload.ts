import type { VocalReport, VocalTestMode } from "@/lib/vocal-metrics";

export type VocalReportPayload = {
  v: 1;
  overallScore: number;
  pitchAccuracy: number;
  toneStability: number;
  breathControl: number;
  mode: VocalTestMode;
  targetLabel: string;
  durationSec: number;
  cents: number[];
};

const CHART_POINTS = 40;

function normalizePayload(
  parsed: Partial<VocalReportPayload>
): VocalReportPayload | null {
  if (parsed.v !== 1 || typeof parsed.overallScore !== "number") return null;
  return {
    v: 1,
    overallScore: parsed.overallScore,
    pitchAccuracy: Number(parsed.pitchAccuracy) || 0,
    toneStability: Number(parsed.toneStability) || 0,
    breathControl: Number(parsed.breathControl) || 0,
    mode: parsed.mode === "scale" ? "scale" : "note",
    targetLabel: String(parsed.targetLabel || ""),
    durationSec: Number(parsed.durationSec) || 10,
    cents: Array.isArray(parsed.cents)
      ? parsed.cents.map((value) => Number(value) || 0)
      : [],
  };
}

export function toVocalReportPayload(report: VocalReport): VocalReportPayload {
  const voiced = report.samples.filter((sample) => sample.centsToTarget !== null);
  const cents: number[] = [];
  if (voiced.length > 0) {
    for (let i = 0; i < CHART_POINTS; i += 1) {
      const index = Math.round(
        (i / Math.max(1, CHART_POINTS - 1)) * (voiced.length - 1)
      );
      cents.push(Math.round(voiced[index]?.centsToTarget ?? 0));
    }
  }
  return {
    v: 1,
    overallScore: report.overallScore,
    pitchAccuracy: report.pitchAccuracy,
    toneStability: report.toneStability,
    breathControl: report.breathControl,
    mode: report.mode,
    targetLabel: report.targetLabel,
    durationSec: report.durationSec,
    cents,
  };
}

export function stringifyVocalReportPayload(payload: VocalReportPayload): string {
  return JSON.stringify(payload);
}

/** Human line for notifications + JSON the chat UI renders as a card. */
export function vocalReportChatText(payload: VocalReportPayload): string {
  const modeLabel =
    payload.mode === "scale" ? "гамма C4–E4–G4" : `нота ${payload.targetLabel}`;
  return `📊 Отчёт вокалиста · ${payload.overallScore}/100 · ${modeLabel}\n${stringifyVocalReportPayload(payload)}`.slice(
    0,
    2000
  );
}

export function parseVocalReportPayload(
  raw: unknown
): VocalReportPayload | null {
  if (raw == null) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return normalizePayload(raw as Partial<VocalReportPayload>);
  }
  if (typeof raw !== "string") return null;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return normalizePayload(
      JSON.parse(raw.slice(start, end + 1)) as Partial<VocalReportPayload>
    );
  } catch {
    return null;
  }
}
