/** Metrics for the professional vocal test (client-safe). */

import {
  analyzeFrequency,
  centsBetween,
  detectPitchHz,
  midiFromNoteLabel,
  frequencyFromMidi,
  snapToNearbyOctave,
} from "@/lib/pitch";
import type { CatLevel } from "@/types";

export type VocalSample = {
  tMs: number;
  frequencyHz: number | null;
  centsDeviation: number | null;
  /** Cents to target folded into ±600 (octave-invariant). */
  centsFolded: number | null;
  volumeDb: number;
  targetNote: string;
  voiced: boolean;
  /** Reliable voiced frame used for scoring (after onset trim). */
  scoreable: boolean;
};

export type VocalTestMode = "note" | "scale";

export type VocalReport = {
  pitchAccuracy: number;
  toneStability: number;
  breathControl: number;
  overallScore: number;
  samples: VocalSample[];
  targetLabel: string;
  mode: VocalTestMode;
  durationSec: number;
};

/** Soft in-tune window. */
const IN_TUNE_CENTS = 40;
const VOICED_DB = -48;
/** Ignore first N ms of each voiced burst (attack / pitch lock-in). */
const ONSET_TRIM_MS = 250;
const MIN_SCOREABLE = 8;

export function rmsToDb(rms: number): number {
  if (rms <= 1e-8) return -80;
  return 20 * Math.log10(rms);
}

export function computeRms(buffer: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    const v = buffer[i] ?? 0;
    sum += v * v;
  }
  return Math.sqrt(sum / Math.max(1, buffer.length));
}

/** Fold cents into [-600, 600] so octave jumps don't destroy the score. */
export function foldCents(cents: number): number {
  let c = ((cents + 600) % 1200 + 1200) % 1200 - 600;
  if (c > 600) c -= 1200;
  if (c < -600) c += 1200;
  return c;
}

/** Target note for scale C4 → E4 → G4 across the test window. */
export function targetNoteAtTime(
  mode: VocalTestMode,
  tMs: number,
  durationMs: number,
  singleNote: string
): string {
  if (mode === "note") return singleNote;
  const third = durationMs / 3;
  const edge = 200;
  if (tMs < third - edge) return "C4";
  if (tMs < third + edge) return tMs < third ? "C4" : "E4";
  if (tMs < third * 2 - edge) return "E4";
  if (tMs < third * 2 + edge) return tMs < third * 2 ? "E4" : "G4";
  return "G4";
}

export function samplePitchFrame(
  floatBuf: Float32Array,
  sampleRate: number,
  tMs: number,
  targetNote: string,
  previousHz?: number | null
): VocalSample {
  const rms = computeRms(floatBuf);
  const volumeDb = rmsToDb(rms);
  const loudEnough = volumeDb > VOICED_DB;
  let hz = loudEnough ? detectPitchHz(floatBuf, sampleRate) : -1;
  if (hz <= 0) {
    return {
      tMs,
      frequencyHz: null,
      centsDeviation: null,
      centsFolded: null,
      volumeDb,
      targetNote,
      voiced: false,
      scoreable: false,
    };
  }

  const targetHz = frequencyFromMidi(midiFromNoteLabel(targetNote));
  // Prefer continuity with previous frame, else snap toward target pitch class/octave.
  const reference = previousHz && previousHz > 0 ? previousHz : targetHz;
  hz = snapToNearbyOctave(hz, reference);

  const pitch = analyzeFrequency(hz);
  const targetMidi = midiFromNoteLabel(targetNote);
  const cents = centsBetween(hz, targetMidi);
  const folded = foldCents(cents);
  return {
    tMs,
    frequencyHz: Math.round(hz * 10) / 10,
    centsDeviation: Math.round(cents * 10) / 10,
    centsFolded: Math.round(folded * 10) / 10,
    volumeDb: Math.round(volumeDb * 10) / 10,
    targetNote,
    voiced: Boolean(pitch),
    scoreable: false,
  };
}

/** Mark scoreable frames: voiced + past onset trim inside each continuous burst. */
export function markScoreableSamples(samples: VocalSample[]): VocalSample[] {
  const out = samples.map((s) => ({ ...s, scoreable: false }));
  let burstStart: number | null = null;

  for (let i = 0; i < out.length; i += 1) {
    const sample = out[i]!;
    if (sample.voiced && sample.centsFolded !== null) {
      if (burstStart === null) burstStart = sample.tMs;
      if (sample.tMs - burstStart >= ONSET_TRIM_MS) {
        sample.scoreable = true;
      }
    } else {
      burstStart = null;
    }
  }
  return out;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Continuous pitch accuracy (not binary ±25¢).
 * 0¢ → 100, 25¢ → ~85, 40¢ → ~65, 60¢ → ~30, 100¢+ → ~0
 */
function softPitchCredit(absCents: number): number {
  if (absCents <= 15) return 100;
  if (absCents <= IN_TUNE_CENTS) {
    return 100 - ((absCents - 15) / (IN_TUNE_CENTS - 15)) * 35;
  }
  if (absCents <= 80) {
    return 65 - ((absCents - IN_TUNE_CENTS) / (80 - IN_TUNE_CENTS)) * 55;
  }
  return Math.max(0, 10 - (absCents - 80) / 20);
}

export function calcPitchAccuracy(samples: VocalSample[]): number {
  const scored = samples.filter((s) => s.scoreable && s.centsFolded !== null);
  const pool =
    scored.length >= MIN_SCOREABLE
      ? scored
      : samples.filter((s) => s.voiced && s.centsFolded !== null);
  if (pool.length === 0) return 0;
  const avg =
    pool.reduce(
      (sum, s) => sum + softPitchCredit(Math.abs(s.centsFolded ?? 99)),
      0
    ) / pool.length;
  return clampScore(avg);
}

/**
 * Tone stability from folded-cents std (octave-safe).
 */
export function calcToneStability(samples: VocalSample[]): number {
  const scored = samples.filter((s) => s.scoreable && s.centsFolded !== null);
  const pool =
    scored.length >= MIN_SCOREABLE
      ? scored
      : samples.filter((s) => s.voiced && s.centsFolded !== null);
  if (pool.length < 3) return 0;

  const values = pool.map((s) => s.centsFolded ?? 0);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  const std = Math.sqrt(variance);

  return clampScore(100 - (std / 45) * 100);
}

/**
 * Breath control via interquartile dB range (robust to short dips / AGC).
 */
export function calcBreathControl(samples: VocalSample[]): number {
  const scored = samples.filter((s) => s.scoreable);
  const pool =
    scored.length >= MIN_SCOREABLE ? scored : samples.filter((s) => s.voiced);
  if (pool.length < 3) return 0;

  const dbs = pool.map((s) => s.volumeDb).sort((a, b) => a - b);
  const q1 = dbs[Math.floor(dbs.length * 0.25)] ?? dbs[0]!;
  const q3 = dbs[Math.floor(dbs.length * 0.75)] ?? dbs[dbs.length - 1]!;
  const iqr = Math.max(0, q3 - q1);

  return clampScore(100 - (iqr / 14) * 100);
}

export function buildVocalReport(
  samples: VocalSample[],
  mode: VocalTestMode,
  targetLabel: string,
  durationSec: number
): VocalReport {
  const marked = markScoreableSamples(samples);
  const pitchAccuracy = calcPitchAccuracy(marked);
  const toneStability = calcToneStability(marked);
  const breathControl = calcBreathControl(marked);
  const overallScore = clampScore(
    pitchAccuracy * 0.5 + toneStability * 0.3 + breathControl * 0.2
  );
  return {
    pitchAccuracy,
    toneStability,
    breathControl,
    overallScore,
    samples: marked,
    targetLabel,
    mode,
    durationSec,
  };
}

export function mentorFeedback(
  score: number,
  catLevel: CatLevel | null | undefined
): string {
  const cat =
    catLevel === "star"
      ? "Кот-звезда"
      : catLevel === "pro"
        ? "Джазовый кот"
        : catLevel === "basic"
          ? "Певчий котик"
          : "Мурчащий котик";

  if (score >= 90) {
    return `${cat} мурчит от восторга: интонация почти студийная. Сохрани эту опору и добавь чуть больше свободы в окончаниях фраз.`;
  }
  if (score >= 75) {
    return `${cat} доволен: ноты в целом уверенные. Подтяни стабильность тона на длинных звуках — меньше «плавания» по частоте.`;
  }
  if (score >= 55) {
    return `${cat} подбадривает: база есть. Следи за дыханием — провалы по громкости тянут оценку вниз. Пой на опоре, без зажима.`;
  }
  return `${cat} рядом и не осуждает: сейчас важнее спокойно попадать в центр ноты. Повтори тест тише и ровнее — точность вырастет быстрее силы.`;
}

export function formatReportChatMessage(report: VocalReport): string {
  const modeLabel =
    report.mode === "scale" ? "гамма C4–E4–G4" : `нота ${report.targetLabel}`;
  return [
    "📊 Отчёт вокалиста (AI-тест)",
    `Режим: ${modeLabel} · ${report.durationSec}с`,
    `Итог: ${report.overallScore}/100`,
    `• Точность нот: ${report.pitchAccuracy}%`,
    `• Стабильность тона: ${report.toneStability}%`,
    `• Удержание дыхания: ${report.breathControl}%`,
  ].join("\n");
}
