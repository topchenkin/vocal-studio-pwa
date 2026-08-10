/**
 * Timbre acoustic-fingerprint types + extraction helpers (client-safe).
 *
 * The actual frame-by-frame extraction runs live via `Meyda.createMeydaAnalyzer`
 * inside `components/ai/TimbreMatcher.tsx` (it needs the live AudioContext/stream,
 * so it can't live in a pure lib function). This module owns the *pure* pieces:
 * accumulating frames into an averaged fingerprint, and deriving the 0-100 radar
 * axes from that fingerprint.
 *
 * NOTE: `TimbreGender` is also imported by `app/api/ai/analyze-timbre/route.ts`,
 * `app/api/ai/match-voice/route.ts` and `lib/neural-voice-match.ts` (dead in
 * production since API routes don't exist in the static export, but still part
 * of the TS build) — keep this type stable even though the rest of this file
 * has been rewritten for the new Meyda pipeline.
 */

export type TimbreGender = "female" | "male";

/** Averaged MFCC + spectral-centroid signature captured during a live take. */
export type AcousticFingerprint = {
  /** Mean of each MFCC coefficient across all voiced frames (Meyda default: 13 coefficients, c0..c12). */
  mfcc: number[];
  /** Mean spectral centroid (Hz) across all voiced frames — "center of mass" of the spectrum. */
  centroid: number;
  /** Number of frames that passed the noise-floor gate and were used in the average. */
  frameCount: number;
  /** Mean RMS (0..1 amplitude) across voiced frames — used for the breathiness heuristic. */
  rmsMean: number;
  /** Variance of RMS across voiced frames — loudness instability, also used for breathiness. */
  rmsVariance: number;
};

/**
 * Frames quieter than this (Meyda's `rms`, a 0..1 amplitude-domain value, roughly
 * the frame's RMS amplitude) are treated as silence/room-noise and skipped so they
 * don't dilute the averaged fingerprint. ~0.012 is roughly -38 dBFS — quiet room
 * noise / breathing on a typical mic gain, well below actual singing.
 */
export const RMS_NOISE_FLOOR = 0.012;

/**
 * Minimum number of voiced frames required before we trust the averaged fingerprint.
 * With a 1024-sample analysis buffer at ~44.1kHz that's a new frame roughly every
 * ~23ms (~43 frames/sec), so 30 frames ≈ 0.7s of real, non-silent singing — enough
 * to smooth out short-term noise without demanding the whole 10s take be loud.
 */
export const MIN_VOICED_FRAMES = 30;

/**
 * Accumulates per-frame Meyda features (`mfcc`, `spectralCentroid`, `rms`) into a
 * running average, gating out near-silent frames via `RMS_NOISE_FLOOR`. Used live
 * during the 10s recording so no post-hoc re-analysis pass is needed.
 */
export class FingerprintAccumulator {
  private mfccSum: number[] = [];
  private centroidSum = 0;
  private rmsSum = 0;
  private rmsSumSq = 0;
  private frames = 0;

  /** Feed one Meyda callback frame. Silently ignores malformed/near-silent frames. */
  addFrame(
    mfcc: number[] | undefined,
    centroid: number | undefined,
    rms: number | undefined
  ): void {
    if (!Array.isArray(mfcc) || mfcc.length === 0) return;
    if (typeof rms !== "number" || !Number.isFinite(rms) || rms < RMS_NOISE_FLOOR) {
      return; // silence guard — don't let quiet/no-signal frames pollute the average
    }
    if (typeof centroid !== "number" || !Number.isFinite(centroid)) return;

    if (this.mfccSum.length === 0) this.mfccSum = new Array(mfcc.length).fill(0);
    const n = Math.min(mfcc.length, this.mfccSum.length);
    for (let i = 0; i < n; i += 1) {
      const v = mfcc[i];
      this.mfccSum[i] += Number.isFinite(v) ? v : 0;
    }
    this.centroidSum += centroid;
    this.rmsSum += rms;
    this.rmsSumSq += rms * rms;
    this.frames += 1;
  }

  get frameCount(): number {
    return this.frames;
  }

  /** Returns the averaged fingerprint, or null if too few voiced frames were captured. */
  finalize(): AcousticFingerprint | null {
    if (this.frames < MIN_VOICED_FRAMES || this.mfccSum.length === 0) return null;
    const rmsMean = this.rmsSum / this.frames;
    const rmsVariance = Math.max(0, this.rmsSumSq / this.frames - rmsMean * rmsMean);
    return {
      mfcc: this.mfccSum.map((sum) => sum / this.frames),
      centroid: this.centroidSum / this.frames,
      frameCount: this.frames,
      rmsMean,
      rmsVariance,
    };
  }
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
