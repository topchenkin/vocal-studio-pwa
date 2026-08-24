/**
 * Voice measurement primitives for the offline Vocal Archetype
 * (client-safe, pure — no DOM/AudioContext dependencies, so it is
 * directly unit-testable with synthetic signals).
 *
 * The live frame-by-frame extraction runs inside
 * `components/ai/TimbreMatcher.tsx` (it needs a live AudioContext/stream):
 * Meyda computes `spectralCentroid` + `spectralFlatness` + `rms` per
 * frame, while `pitchfinder`'s YIN detector computes F0 from RAW PCM tapped
 * via a parallel `AnalyserNode` on the same source — deliberately NOT Meyda's
 * own `buffer` feature, which is the Hanning-WINDOWED signal and destroys
 * exactly the periodicity YIN needs (that mistake made YIN return null on
 * nearly every frame of real singing).
 *
 * This module owns the pure part: gating out near-silent frames, accumulating
 * the per-frame series, reducing them to medians, and converting raw Meyda
 * values onto stable 0-100 axes.
 *
 * Axes (all 0-100, FIXED linear calibration — never per-take min/max):
 *   timbreWeight ← median spectral centroid, 150..2000 Hz
 *   raspiness    ← median spectral flatness, 0..0.1
 *   tessituraSpan← IQR of pitched F0 in semitones, mapped 0–100
 *
 * NOTE: `TimbreGender` is also imported by `app/api/ai/match-voice/route.ts`,
 * `lib/neural-voice-match.ts`, `lib/singing-gender.ts`, `lib/voice-embed.ts`
 * and `lib/artist-timbre-db.ts` — keep this type stable.
 */

export type TimbreGender = "female" | "male";

/**
 * Frames quieter than this (Meyda's `rms`, a 0..1 amplitude-domain value) are
 * treated as silence/room-noise and skipped so they don't drag the medians
 * around. ~0.004 ≈ -48 dBFS — above typical room hiss on a laptop mic, but
 * low enough that quiet / normal singing (often 0.006–0.02) still accumulates.
 * The previous 0.012 floor forced students to shout before any frames passed.
 * Keep in sync with `assessVocalPresence` (~0.0035 active threshold).
 */
export const RMS_NOISE_FLOOR = 0.0025;

/**
 * Minimum number of above-noise-floor frames required before we trust the
 * measurement. With the 2048-sample analysis buffer used in `TimbreMatcher`
 * at ~44.1kHz that's a new frame roughly every ~46ms (~21 frames/sec), so 30
 * frames ≈ 1.4s of real, non-silent singing.
 */
/**
 * ~0.7s of non-silent frames at ~21 fps. Kept low so quiet / soft singing
 * still finalises; extreme silence is caught by vocal-presence instead.
 */
export const MIN_VOICED_FRAMES = 16;

/**
 * Minimum pitched frames for a usable median F0 / tessitura. Decoupled from
 * voiced frames so loud-but-noisy consonants still contribute spectra.
 */
export const MIN_PITCHED_FRAMES = 12;

/**
 * Calibration range for spectral centroid → `timbreWeight` (0-100).
 *
 * These are FIXED constants, not per-recording min/max: normalising a take
 * against its own extremes would be self-referential (every voice would end
 * up spanning the full 0-100 scale) and could not be compared against the
 * hand-authored star weights at all.
 *
 * 150 Hz maps to 0, 1075 Hz to 50 and 2000 Hz to 100. Values outside the
 * interval are strictly clamped.
 */
export const CENTROID_WEIGHT_MIN_HZ = 150;
export const CENTROID_WEIGHT_MAX_HZ = 2000;

/**
 * Calibration range for Meyda `spectralFlatness` → `raspiness` (0-100).
 *
 * Meyda flatness is geometricMean / arithmeticMean of magnitude spectrum:
 * 0 maps to 0, 0.05 to 50 and 0.1 to 100, with strict clamping.
 */
export const FLATNESS_RASP_MIN = 0;
export const FLATNESS_RASP_MAX = 0.1;

/**
 * Calibration range for zero-crossing RATE → `airiness` (0-100).
 */
/**
 * Meyda's `spectralCentroid` is `mu(1, ampSpectrum)` — the amplitude-weighted
 * mean BIN INDEX of the amplitude spectrum, NOT a frequency in Hz. Bin `k` of
 * a `bufferSize`-point FFT sits at `k * sampleRate / bufferSize`, so that is
 * the conversion applied here.
 */
export function centroidBinToHz(
  binIndex: number,
  sampleRate: number,
  bufferSize: number
): number {
  if (!Number.isFinite(binIndex) || bufferSize <= 0) return 0;
  return (binIndex * sampleRate) / bufferSize;
}

/** Clamp a finite value to a closed interval. Non-finite input becomes min. */
export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) {
    throw new RangeError("clamp requires finite max >= min");
  }
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function clamp01(x: number): number {
  return clamp(x, 0, 1);
}

/** Map a fixed input interval linearly to strict [0,100], clamping both ends. */
export function clampAndMap(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    throw new RangeError("clampAndMap requires finite max > min");
  }
  return clamp(((value - min) / (max - min)) * 100, 0, 100);
}

/** Spectral centroid in Hz → 0-100 timbre weight. See the calibration note above. */
export function centroidHzToWeight(centroidHz: number): number {
  return Math.round(
    clampAndMap(centroidHz, CENTROID_WEIGHT_MIN_HZ, CENTROID_WEIGHT_MAX_HZ)
  );
}

/** Meyda spectralFlatness (0–1) → 0-100 raspiness. */
export function flatnessToRaspiness(flatness: number): number {
  return Math.round(clampAndMap(flatness, FLATNESS_RASP_MIN, FLATNESS_RASP_MAX));
}

/**
 * Linear interpolation percentile. `p` is 0..1.
 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(1, p)) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const a = sorted[lo] ?? 0;
  const b = sorted[hi] ?? a;
  return a + (b - a) * (idx - lo);
}

/**
 * Per-take adaptive gate. The low decile estimates room noise; the median cap
 * prevents a take that starts singing immediately from setting its own voice
 * as the noise floor. The absolute floor remains quiet-singing friendly.
 */
export function deriveAdaptiveNoiseGate(rmsValues: number[]): {
  noiseFloorRms: number;
  thresholdRms: number;
  medianRms: number;
} {
  const valid = rmsValues.filter((x) => Number.isFinite(x) && x >= 0);
  const noiseFloorRms = percentile(valid, 0.1);
  const medianRms = percentile(valid, 0.5);
  const adaptive = noiseFloorRms * 1.8;
  const voiceFriendlyCap = medianRms > 0 ? medianRms * 0.55 : RMS_NOISE_FLOOR;
  return {
    noiseFloorRms,
    medianRms,
    thresholdRms: clamp(
      Math.min(adaptive, voiceFriendlyCap),
      RMS_NOISE_FLOOR,
      0.012
    ),
  };
}

function hzToMidi(hz: number): number {
  if (!Number.isFinite(hz) || hz <= 0) return 0;
  return 69 + 12 * Math.log2(hz / 440);
}

/**
 * Pitch IQR (semitones) → 0–100 tessitura width.
 * ~2 st of a narrow pop hook → ~22; an octave of melody → ~78.
 */
export function pitchIqrToSpan(p25Hz: number, p75Hz: number): number {
  const iqr = Math.max(0, hzToMidi(p75Hz) - hzToMidi(p25Hz));
  return Math.round(clamp01(1 - Math.exp(-iqr / 8)) * 100);
}

/** Robust summary of a single take. */
export type VoiceMeasurement = {
  /** Median fundamental frequency in Hz across pitched frames — drives the Vocal Fach. */
  medianHz: number;
  /** 25th / 75th percentile F0 — tessitura width, not just the centre. */
  p25Hz: number;
  p75Hz: number;
  /** Median spectral centroid in Hz across non-silent frames. */
  medianCentroidHz: number;
  p75CentroidHz: number;
  /** Median Meyda spectralFlatness (0–1) across non-silent frames. */
  medianFlatness: number;
  p75Flatness: number;
  /** Median centroid → 0-100, same scale as the stars' `timbreWeight`. */
  userWeight: number;
  /** Median flatness → 0-100, same scale as the stars' `raspiness`. */
  userRaspiness: number;
  /** Pitch IQR mapped 0–100, same scale as the stars' `tessituraSpan`. */
  tessituraSpan: number;
  /** Frames that passed the noise-floor gate. */
  frameCount: number;
  /** Subset of those where YIN also found an F0. */
  pitchedFrameCount: number;
  /** All analysis frames considered before the adaptive gate. */
  totalFrameCount: number;
  /** Low-percentile RMS estimate of the recording's room-noise floor. */
  noiseFloorRms: number;
  /** Adaptive RMS threshold actually used for this take. */
  noiseGateRms: number;
  /** Median RMS of frames accepted as voiced/pitched. */
  medianVoicedRms: number;
};

function median(values: number[]): number {
  return percentile(values, 0.5);
}

/**
 * Accumulates the per-frame series captured live during the take, gating out
 * near-silent frames via `RMS_NOISE_FLOOR`.
 *
 * Decoupling: centroid / flatness come from RMS-voiced frames; F0
 * comes only from YIN-success frames.
 */
export class VoiceMeasurementAccumulator {
  private centroidBins: number[] = [];
  private flatness: number[] = [];
  private pitchHz: number[] = [];
  private voicedRms: number[] = [];
  private frames = 0;
  private totalFrames = 0;

  constructor(
    private readonly sampleRate: number,
    private readonly bufferSize: number,
    private readonly noiseGateRms = RMS_NOISE_FLOOR,
    private readonly noiseFloorRms = 0
  ) {}

  /**
   * Feed one analysis frame. `centroidBin`, `rms` and `spectralFlatness`
   * come from Meyda; `f0Hz` comes from running YIN over raw PCM for
   * roughly the same window (null when YIN found no usable pitch — such a
   * frame STILL contributes its timbre features, see `MIN_PITCHED_FRAMES`).
   * Malformed values are ignored.
   */
  addFrame(
    centroidBin: number | undefined,
    rms: number | undefined,
    f0Hz?: number | null,
    spectralFlatness?: number
  ): void {
    this.totalFrames += 1;
    if (typeof rms !== "number" || !Number.isFinite(rms) || rms < this.noiseGateRms) return;

    // A measured F0 is required for Fach anyway. Restricting all three timbre
    // axes to these frames also keeps room hiss and unpitched knocks out.
    const pitched =
      typeof f0Hz === "number" && Number.isFinite(f0Hz) && f0Hz > 0;
    if (!pitched) return;

    this.frames += 1;
    this.voicedRms.push(rms);

    if (typeof centroidBin === "number" && Number.isFinite(centroidBin) && centroidBin > 0) {
      this.centroidBins.push(centroidBin);
    }
    if (typeof spectralFlatness === "number" && Number.isFinite(spectralFlatness) && spectralFlatness >= 0) {
      this.flatness.push(spectralFlatness);
    }
    this.pitchHz.push(f0Hz as number);
  }

  get frameCount(): number {
    return this.frames;
  }

  get pitchedFrameCount(): number {
    return this.pitchHz.length;
  }

  /** Medians + style tails + derived matching vector, or null if too little signal. */
  finalize(): VoiceMeasurement | null {
    if (this.frames < MIN_VOICED_FRAMES) return null;
    if (this.pitchHz.length < MIN_PITCHED_FRAMES) return null;
    if (this.centroidBins.length === 0) return null;
    if (this.flatness.length === 0) return null;
    const medianCentroidHz = centroidBinToHz(
      median(this.centroidBins),
      this.sampleRate,
      this.bufferSize
    );
    const p75CentroidHz = centroidBinToHz(
      percentile(this.centroidBins, 0.75),
      this.sampleRate,
      this.bufferSize
    );
    const medianFlatness = median(this.flatness);
    const p75Flatness = percentile(this.flatness, 0.75);
    const p25Hz = percentile(this.pitchHz, 0.25);
    const p75Hz = percentile(this.pitchHz, 0.75);
    const userWeight = centroidHzToWeight(medianCentroidHz);
    const userRaspiness = flatnessToRaspiness(medianFlatness);

    return {
      medianHz: median(this.pitchHz),
      p25Hz,
      p75Hz,
      medianCentroidHz,
      p75CentroidHz,
      medianFlatness,
      p75Flatness,
      userWeight: Math.max(0, Math.min(100, userWeight)),
      userRaspiness: Math.max(0, Math.min(100, userRaspiness)),
      tessituraSpan: pitchIqrToSpan(p25Hz, p75Hz),
      frameCount: this.frames,
      pitchedFrameCount: this.pitchHz.length,
      totalFrameCount: this.totalFrames,
      noiseFloorRms: this.noiseFloorRms,
      noiseGateRms: this.noiseGateRms,
      medianVoicedRms: median(this.voicedRms),
    };
  }
}
