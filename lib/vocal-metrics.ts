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

/**
 * Pro-test “green” band — a bit tighter than live tuner (±45¢),
 * still realistic for teachers (~±8–11 Hz mid-voice).
 */
export const TEST_IN_TUNE_CENTS = 35;

const VOICED_DB = -48;
/** Ignore attack / pitch lock-in at the start of each voiced burst. */
const ONSET_TRIM_MS = 320;
/** Scale note-change windows are not scored (glide between targets). */
const SCALE_TRANSITION_MS = 480;
const MIN_SCOREABLE = 6;
/** Std below this is treated as natural shimmer / light vibrato, not instability. */
const NATURAL_VIBRATO_STD_CENTS = 22;
/** Loudness IQR below this is ignored (AGC / mic noise). */
const NATURAL_DYNAMICS_IQR_DB = 5;

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
  const edge = SCALE_TRANSITION_MS;
  if (tMs < third - edge) return "C4";
  if (tMs < third + edge) return tMs < third ? "C4" : "E4";
  if (tMs < third * 2 - edge) return "E4";
  if (tMs < third * 2 + edge) return tMs < third * 2 ? "E4" : "G4";
  return "G4";
}

/** True while the singer is expected to glide between scale steps. */
export function isScaleTransition(
  mode: VocalTestMode,
  tMs: number,
  durationMs: number
): boolean {
  if (mode !== "scale") return false;
  const third = durationMs / 3;
  return (
    Math.abs(tMs - third) < SCALE_TRANSITION_MS ||
    Math.abs(tMs - third * 2) < SCALE_TRANSITION_MS
  );
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

/**
 * Mark scoreable frames: voiced + past onset trim, excluding scale transitions.
 */
export function markScoreableSamples(
  samples: VocalSample[],
  mode: VocalTestMode = "note",
  durationMs = 10_000
): VocalSample[] {
  const out = samples.map((s) => ({ ...s, scoreable: false }));
  let burstStart: number | null = null;

  for (let i = 0; i < out.length; i += 1) {
    const sample = out[i]!;
    if (sample.voiced && sample.centsFolded !== null) {
      if (burstStart === null) burstStart = sample.tMs;
      const pastOnset = sample.tMs - burstStart >= ONSET_TRIM_MS;
      const inTransition = isScaleTransition(mode, sample.tMs, durationMs);
      if (pastOnset && !inTransition) {
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
 * Pitch credit for the pro test.
 * Slightly stricter than live ±45¢, but a clean teacher take lands 90+.
 * 0–18¢ → 100, 35¢ → ~93, 55¢ → ~78, 80¢ → ~55
 */
function softPitchCredit(absCents: number): number {
  if (absCents <= 18) return 100;
  if (absCents <= TEST_IN_TUNE_CENTS) {
    return 100 - ((absCents - 18) / (TEST_IN_TUNE_CENTS - 18)) * 7;
  }
  if (absCents <= 70) {
    return 93 - ((absCents - TEST_IN_TUNE_CENTS) / (70 - TEST_IN_TUNE_CENTS)) * 33;
  }
  return Math.max(20, 60 - (absCents - 70) / 2.5);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  }
  return sorted[mid] ?? 0;
}

export function calcPitchAccuracy(samples: VocalSample[]): number {
  const scored = samples.filter((s) => s.scoreable && s.centsFolded !== null);
  const pool =
    scored.length >= MIN_SCOREABLE
      ? scored
      : samples.filter((s) => s.voiced && s.centsFolded !== null);
  if (pool.length === 0) return 0;

  const credits = pool.map((s) =>
    softPitchCredit(Math.abs(s.centsFolded ?? 99))
  );
  // Median resists a few bad frames / mic glitches better than mean.
  const med = median(credits);
  const mean = credits.reduce((a, b) => a + b, 0) / credits.length;
  // Blend: mostly median, a bit of mean so sustained drift still matters.
  return clampScore(med * 0.65 + mean * 0.35);
}

/**
 * Tone stability — light vibrato must not kill the score.
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

  const excess = Math.max(0, std - NATURAL_VIBRATO_STD_CENTS);
  return clampScore(100 - (excess / 55) * 100);
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

  const excess = Math.max(0, iqr - NATURAL_DYNAMICS_IQR_DB);
  return clampScore(100 - (excess / 20) * 100);
}

export function buildVocalReport(
  samples: VocalSample[],
  mode: VocalTestMode,
  targetLabel: string,
  durationSec: number
): VocalReport {
  const durationMs = Math.max(1000, durationSec * 1000);
  const marked = markScoreableSamples(samples, mode, durationMs);
  const pitchAccuracy = calcPitchAccuracy(marked);
  const toneStability = calcToneStability(marked);
  const breathControl = calcBreathControl(marked);
  // Pitch dominates; stability/breath shouldn't block a strong 90+ take.
  const overallScore = clampScore(
    pitchAccuracy * 0.55 + toneStability * 0.25 + breathControl * 0.2
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
