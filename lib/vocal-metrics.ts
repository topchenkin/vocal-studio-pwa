/** Metrics for the professional vocal test (client-safe). */

import {
  centsBetween,
  midiFromNoteLabel,
  type PitchFrame,
} from "@/lib/pitch";
import type { CatLevel } from "@/types";

export type VocalSample = {
  tMs: number;
  frequencyHz: number | null;
  volumeDb: number;
  targetNote: string;
  /** Cents deviation from the *target* note, folded into ±600 (octave-invariant). */
  centsToTarget: number | null;
  voiced: boolean;
  /** Reliable voiced frame used for scoring (after onset trim / transitions). */
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
  /** True when the take was too quiet / had too few voiced frames to score. */
  tooQuiet: boolean;
};

/**
 * Pro-test "green" band: samples within ±20¢ of the target note count as
 * accurate. This is the literal definition used by `calcPitchAccuracy`.
 */
export const TEST_IN_TUNE_CENTS = 20;

/** Ignore attack / pitch lock-in at the start of each voiced burst. */
const ONSET_TRIM_MS = 180;
/** Scale note-change windows are not scored (glide between targets). */
const SCALE_TRANSITION_MS = 400;
const MIN_SCOREABLE = 4;

/** Fold cents into [-600, 600] so octave jumps don't destroy the score. */
export function foldCents(cents: number): number {
  let c = (((cents + 600) % 1200) + 1200) % 1200 - 600;
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

/** Turn raw captured DSP frames into scoring samples against the target-note timeline. */
export function buildSamplesFromFrames(
  frames: PitchFrame[],
  mode: VocalTestMode,
  durationMs: number,
  singleNote: string
): VocalSample[] {
  return frames.map((frame) => {
    const target = targetNoteAtTime(mode, frame.tMs, durationMs, singleNote);
    if (!frame.voiced || frame.frequencyHz === null) {
      return {
        tMs: frame.tMs,
        frequencyHz: null,
        volumeDb: frame.db,
        targetNote: target,
        centsToTarget: null,
        voiced: false,
        scoreable: false,
      };
    }
    const targetMidi = midiFromNoteLabel(target);
    const centsToTarget = foldCents(centsBetween(frame.frequencyHz, targetMidi));
    return {
      tMs: frame.tMs,
      frequencyHz: frame.frequencyHz,
      volumeDb: frame.db,
      targetNote: target,
      centsToTarget,
      voiced: true,
      scoreable: false,
    };
  });
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
    if (sample.voiced && sample.centsToTarget !== null) {
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
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Standard deviation (population) — 0 for <2 samples so the math never blows up. */
function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = mean(values.map((v) => (v - avg) ** 2));
  return Math.sqrt(variance);
}

function scoreablePool(samples: VocalSample[]): VocalSample[] {
  const scored = samples.filter((s) => s.scoreable && s.centsToTarget !== null);
  if (scored.length >= MIN_SCOREABLE) return scored;
  return samples.filter((s) => s.voiced && s.centsToTarget !== null);
}

/**
 * Точность (accuracy): доля замеров, попавших в зелёную зону
 * |centsToTarget| < TEST_IN_TUNE_CENTS (20¢) относительно ноты/ступени
 * гаммы, актуальной в этот момент времени. Прямой процент — без сглаживающих
 * кривых, чтобы результат было легко объяснить ученику.
 */
export function calcPitchAccuracy(samples: VocalSample[]): number {
  const pool = scoreablePool(samples);
  if (pool.length === 0) return 0;
  const inTune = pool.filter(
    (s) => Math.abs(s.centsToTarget ?? 9999) < TEST_IN_TUNE_CENTS
  ).length;
  return clampScore((inTune / pool.length) * 100);
}

/**
 * Дыхание (breath control): чем меньше разброс (стандартное отклонение)
 * громкости на протяжении удержанной ноты, тем стабильнее опора дыхания.
 * Нет эталонных данных, поэтому константы подобраны из типичных диапазонов
 * dB-разброса для удержанных нот:
 *  - BREATH_STDDEV_GOOD_DB = 2.5 dB → ровное, поставленное дыхание → счёт 100
 *  - BREATH_STDDEV_POOR_DB = 14 dB  → заметные "просадки"/скачки громкости → счёт 0
 * Между ними — линейная интерполяция.
 */
const BREATH_STDDEV_GOOD_DB = 2.5;
const BREATH_STDDEV_POOR_DB = 14;

export function calcBreathControl(samples: VocalSample[]): number {
  const scored = samples.filter((s) => s.scoreable);
  const pool = scored.length >= MIN_SCOREABLE ? scored : samples.filter((s) => s.voiced);
  if (pool.length < 3) return 0;

  const deviation = stdDev(pool.map((s) => s.volumeDb));
  const score =
    100 *
    (1 -
      (deviation - BREATH_STDDEV_GOOD_DB) /
        (BREATH_STDDEV_POOR_DB - BREATH_STDDEV_GOOD_DB));
  return clampScore(score);
}

/**
 * Стабильность тона: стандартное отклонение отклонения в центах от целевой
 * ноты. Лёгкое вибрато — это нормальная особенность живого голоса и не
 * должно "убивать" оценку, поэтому нижняя граница не равна нулю:
 *  - STABILITY_STDDEV_GOOD_CENTS = 10¢ → почти прямой тон / лёгкое вибрато → счёт 100
 *  - STABILITY_STDDEV_POOR_CENTS = 70¢ → голос "плавает" между нотами → счёт 0
 */
const STABILITY_STDDEV_GOOD_CENTS = 10;
const STABILITY_STDDEV_POOR_CENTS = 70;

export function calcToneStability(samples: VocalSample[]): number {
  const scored = samples.filter((s) => s.scoreable && s.centsToTarget !== null);
  const voiced = samples.filter((s) => s.voiced && s.centsToTarget !== null);
  const pool = scored.length >= 3 ? scored : voiced;
  if (pool.length === 0) return 0;

  const deviation = stdDev(pool.map((s) => s.centsToTarget ?? 0));
  const score =
    100 *
    (1 -
      (deviation - STABILITY_STDDEV_GOOD_CENTS) /
        (STABILITY_STDDEV_POOR_CENTS - STABILITY_STDDEV_GOOD_CENTS));
  return clampScore(score);
}

export function buildVocalReport(
  frames: PitchFrame[],
  frameStatsTooQuiet: boolean,
  mode: VocalTestMode,
  targetNote: string,
  durationSec: number
): VocalReport {
  const durationMs = Math.max(1000, durationSec * 1000);
  const rawSamples = buildSamplesFromFrames(frames, mode, durationMs, targetNote);
  const marked = markScoreableSamples(rawSamples, mode, durationMs);
  const targetLabel = mode === "scale" ? "C4–E4–G4" : targetNote;

  if (frameStatsTooQuiet) {
    return {
      pitchAccuracy: 0,
      toneStability: 0,
      breathControl: 0,
      overallScore: 0,
      samples: marked,
      targetLabel,
      mode,
      durationSec,
      tooQuiet: true,
    };
  }

  const pitchAccuracy = calcPitchAccuracy(marked);
  const toneStability = calcToneStability(marked);
  const breathControl = calcBreathControl(marked);
  // Weights: pitch accuracy matters most for an intonation test; tone
  // stability and breath control split the remaining half evenly.
  const overallScore = clampScore(
    pitchAccuracy * 0.5 + toneStability * 0.25 + breathControl * 0.25
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
    tooQuiet: false,
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