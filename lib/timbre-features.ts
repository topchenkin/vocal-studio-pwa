/**
 * Timbre acoustic-fingerprint types + extraction helpers (client-safe).
 *
 * The actual frame-by-frame extraction runs live via `Meyda.createMeydaAnalyzer`
 * inside `components/ai/TimbreMatcher.tsx` (it needs the live AudioContext/stream,
 * so it can't live in a pure lib function) — Meyda extracts `mfcc` +
 * `spectralCentroid` per frame, and (from raw PCM tapped via a parallel
 * `AnalyserNode` on the same source — deliberately NOT Meyda's own `buffer`
 * feature, which is the windowed, not raw, signal and breaks pitch detection)
 * `pitchfinder`'s YIN detector (`createYinDetector` from `lib/pitch.ts`) extracts
 * the fundamental frequency F0. This module owns the *pure* pieces: accumulating
 * those per-frame values into a robust (median-based) fingerprint, deriving the
 * 0-100 radar axes from it, and the pure gender-from-pitch classifier.
 *
 * NOTE: `TimbreGender` is also imported by `app/api/ai/analyze-timbre/route.ts`,
 * `app/api/ai/match-voice/route.ts` and `lib/neural-voice-match.ts` (dead in
 * production since API routes don't exist in the static export, but still part
 * of the TS build) — keep this type stable even though the rest of this file
 * has been rewritten for the new Meyda + YIN pipeline.
 */

export type TimbreGender = "female" | "male";

/** Averaged (median-based) MFCC + spectral-centroid + F0 signature captured during a live take. */
export type AcousticFingerprint = {
  /**
   * Per-dimension MEDIAN of each MFCC coefficient across all voiced frames
   * (Meyda default: 13 coefficients, c0..c12). Median — not mean — so a few
   * momentarily louder/quieter syllables can't drag the whole fingerprint
   * around (that was the root of the old "results jump around based on mic
   * volume" complaint).
   */
  mfcc: number[];
  /** Median spectral centroid (Hz) across all voiced frames — "center of mass" of the spectrum. */
  centroid: number;
  /**
   * Median fundamental frequency (Hz), computed only from frames where the
   * `pitchfinder` YIN detector actually found a pitch (a strict subset of the
   * voiced/non-silent frames — some voiced frames are unpitched, e.g.
   * breathy attacks). Feeds `detectGenderFromF0`. 0 if no frame yielded a
   * usable pitch (shouldn't happen once `finalize()` has already required
   * `MIN_PITCHED_FRAMES`).
   */
  medianF0: number;
  /** Number of frames that passed the noise-floor gate and were used for the mfcc/centroid medians. */
  frameCount: number;
  /** Number of those frames where YIN found an F0 — i.e. contributed to `medianF0`. */
  pitchedFrameCount: number;
  /** Mean RMS (0..1 amplitude) across voiced frames — used for the breathiness heuristic. */
  rmsMean: number;
  /** Variance of RMS across voiced frames — loudness instability, also used for breathiness. */
  rmsVariance: number;
};

/**
 * Frames quieter than this (Meyda's `rms`, a 0..1 amplitude-domain value, roughly
 * the frame's RMS amplitude) are treated as silence/room-noise and skipped so they
 * don't dilute the fingerprint. ~0.012 is roughly -38 dBFS — quiet room
 * noise / breathing on a typical mic gain, well below actual singing.
 *
 * This is the SAME silence gate applied uniformly to every statistic derived
 * from a frame (MFCC median AND F0 median) — a frame either passes it and
 * contributes to both, or it's skipped entirely (see `addFrame`).
 */
export const RMS_NOISE_FLOOR = 0.012;

/**
 * Minimum number of voiced frames required before we trust the fingerprint.
 * With the 2048-sample analysis buffer used in `TimbreMatcher` at ~44.1kHz
 * that's a new frame roughly every ~46ms (~21 frames/sec), so 30 frames ≈
 * 1.4s of real, non-silent singing — enough to compute a stable per-dimension
 * median without demanding the whole 10s take be loud.
 */
export const MIN_VOICED_FRAMES = 30;

/**
 * Minimum number of *pitched* frames (voiced frames where YIN additionally
 * found an F0) required before we trust `medianF0` enough to run
 * `detectGenderFromF0` on it. Deliberately smaller than `MIN_VOICED_FRAMES`
 * since not every voiced frame carries a clean, YIN-detectable pitch (breath
 * noise, consonants, etc.), but still enough (~1s of clearly pitched singing)
 * to reject a take that's all noise/whisper with no real melodic content.
 */
export const MIN_PITCHED_FRAMES = 20;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? (sorted[mid] ?? 0)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/**
 * Accumulates per-frame Meyda features (`mfcc`, `spectralCentroid`, `rms`) plus
 * a per-frame `pitchfinder` YIN F0 reading into raw sample lists (not running
 * sums), gating out near-silent frames via `RMS_NOISE_FLOOR`. `finalize()`
 * then reduces those lists to per-dimension MEDIANS — see `AcousticFingerprint`
 * for why median beats mean here. Used live during the 10s recording so no
 * post-hoc re-analysis pass over raw audio is needed.
 */
export class FingerprintAccumulator {
  private mfccFrames: number[][] = [];
  private centroidFrames: number[] = [];
  private f0Frames: number[] = [];
  private rmsSum = 0;
  private rmsSumSq = 0;
  private frames = 0;

  /**
   * Feed one analysis frame. `mfcc`/`centroid`/`rms` come from Meyda;
   * `f0Hz` comes from running `createYinDetector`'s detector on raw PCM for
   * roughly the same time window (tapped separately from Meyda's own
   * windowed buffer — see `TimbreMatcher`) — null/undefined when YIN didn't
   * find a usable pitch in this frame. Silently ignores malformed frames;
   * near-silent frames are excluded from EVERY statistic (MFCC median,
   * centroid median, AND F0 median) — see `RMS_NOISE_FLOOR`.
   */
  addFrame(
    mfcc: number[] | undefined,
    centroid: number | undefined,
    rms: number | undefined,
    f0Hz?: number | null
  ): void {
    if (!Array.isArray(mfcc) || mfcc.length === 0) return;
    if (typeof rms !== "number" || !Number.isFinite(rms) || rms < RMS_NOISE_FLOOR) {
      return; // silence guard — excluded from ALL aggregation, not just MFCC
    }
    if (typeof centroid !== "number" || !Number.isFinite(centroid)) return;

    this.mfccFrames.push(mfcc.map((v) => (Number.isFinite(v) ? v : 0)));
    this.centroidFrames.push(centroid);
    this.rmsSum += rms;
    this.rmsSumSq += rms * rms;
    this.frames += 1;

    if (typeof f0Hz === "number" && Number.isFinite(f0Hz) && f0Hz > 0) {
      this.f0Frames.push(f0Hz);
    }
  }

  get frameCount(): number {
    return this.frames;
  }

  get pitchedFrameCount(): number {
    return this.f0Frames.length;
  }

  /** Returns the median-based fingerprint, or null if too few voiced/pitched frames were captured. */
  finalize(): AcousticFingerprint | null {
    if (this.frames < MIN_VOICED_FRAMES || this.mfccFrames.length === 0) return null;
    if (this.f0Frames.length < MIN_PITCHED_FRAMES) return null;

    const dims = this.mfccFrames[0]?.length ?? 0;
    const medianMfcc: number[] = [];
    for (let i = 0; i < dims; i += 1) {
      medianMfcc.push(median(this.mfccFrames.map((frame) => frame[i] ?? 0)));
    }

    const rmsMean = this.rmsSum / this.frames;
    const rmsVariance = Math.max(0, this.rmsSumSq / this.frames - rmsMean * rmsMean);

    return {
      mfcc: medianMfcc,
      centroid: median(this.centroidFrames),
      medianF0: median(this.f0Frames),
      frameCount: this.frames,
      pitchedFrameCount: this.f0Frames.length,
      rmsMean,
      rmsVariance,
    };
  }
}

/**
 * Automatic gender detection from the take's median fundamental frequency.
 * EXACT rule as specified — deliberately no secondary signals (formants,
 * brightness, etc.): a median F0 below 175Hz reads as a typical adult male
 * chest/modal register, at or above it as typical adult female range. The
 * student can always override this via the UI toggle if it's wrong for their
 * voice — see `TimbreMatcher`'s gender-toggle state.
 */
export function detectGenderFromF0(medianF0Hz: number): TimbreGender {
  return medianF0Hz < 175 ? "male" : "female";
}

export type RadarAxes = {
  /** 0-100: darker/lower voices score higher — inverse of normalized spectral centroid. */
  depth: number;
  /** 0-100: directly proportional to spectral centroid within a typical singing-voice range. */
  brightness: number;
  /** 0-100: breathiness/"air" — high-frequency MFCC energy + loudness variance across frames. */
  air: number;
};

/**
 * Reasonable normalization range for a singing voice's spectral centroid, in Hz.
 * Deep chest-voice male vocals sit near the low end; airy/bright female or
 * falsetto vocals sit near the high end. There is no universal ground-truth
 * calibration for this (no reference measurement corpus available), so these
 * are documented, tunable constants rather than measured values.
 */
const CENTROID_FLOOR_HZ = 500;
const CENTROID_CEIL_HZ = 4000;

/**
 * Higher-order cepstral coefficients (index >= this) capture fine, noise-like
 * high-frequency spectral detail. We use the ratio of their magnitude vs the
 * lower/mid coefficients (which capture the coarse formant/spectral envelope)
 * as a proxy for breathiness: unvoiced "air" in the airstream shows up as
 * broadband high-frequency energy rather than clean low-order harmonic shape.
 */
const AIR_MFCC_START_INDEX = 6;

/** Loudness (RMS) coefficient-of-variation treated as the "very breathy/unstable" ceiling. */
const AIR_LOUDNESS_CV_CEIL = 0.6;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Maps an Acoustic Fingerprint to the 3 radar-chart axes (Глубина / Яркость / Воздух),
 * each on a 0-100 scale. See the constants above for the exact heuristic — there is no
 * ground-truth calibration data available, so these are documented, reasonable proxies,
 * not measured psychoacoustic constants.
 */
export function computeRadarAxes(fp: AcousticFingerprint): RadarAxes {
  const centroidNorm = clamp01(
    (fp.centroid - CENTROID_FLOOR_HZ) / (CENTROID_CEIL_HZ - CENTROID_FLOOR_HZ)
  );
  const brightness = Math.round(centroidNorm * 100);
  const depth = Math.round((1 - centroidNorm) * 100);

  const highCoeffs = fp.mfcc.slice(AIR_MFCC_START_INDEX);
  const lowCoeffs = fp.mfcc.slice(1, AIR_MFCC_START_INDEX); // skip c0 (overall log-energy, not spectral shape)
  const highEnergy = highCoeffs.length
    ? highCoeffs.reduce((a, b) => a + Math.abs(b), 0) / highCoeffs.length
    : 0;
  const lowEnergy = lowCoeffs.length
    ? lowCoeffs.reduce((a, b) => a + Math.abs(b), 0) / lowCoeffs.length
    : 1;
  // *2 stretches the typically-observed 0..~0.5 high/(low+high) ratio to roughly 0..1
  const highRatio = clamp01((highEnergy / (lowEnergy + highEnergy + 1e-6)) * 2);

  const loudnessCv = fp.rmsMean > 1e-6 ? Math.sqrt(fp.rmsVariance) / fp.rmsMean : 0;
  const cvNorm = clamp01(loudnessCv / AIR_LOUDNESS_CV_CEIL);

  const air = Math.round(clamp01(0.65 * highRatio + 0.35 * cvNorm) * 100);

  return { depth, brightness, air };
}
