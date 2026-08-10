/**
 * Voice measurement primitives for the "Vocal Fach + Timbre Weight" celebrity
 * matcher (client-safe, pure — no DOM/AudioContext dependencies, so it is
 * directly unit-testable with synthetic signals).
 *
 * The live frame-by-frame extraction runs inside
 * `components/ai/TimbreMatcher.tsx` (it needs a live AudioContext/stream):
 * Meyda computes `spectralCentroid` + `rms` per frame, while `pitchfinder`'s
 * YIN detector computes F0 from RAW PCM tapped via a parallel `AnalyserNode`
 * on the same source — deliberately NOT Meyda's own `buffer` feature, which is
 * the Hanning-WINDOWED signal and destroys exactly the periodicity YIN needs
 * (that mistake made YIN return null on nearly every frame of real singing).
 *
 * This module owns the pure part: gating out near-silent frames, accumulating
 * the two per-frame series, reducing them to medians, and converting the
 * median spectral centroid into the 0-100 timbre weight used for matching.
 *
 * NOTE: `TimbreGender` is also imported by `app/api/ai/match-voice/route.ts`,
 * `lib/neural-voice-match.ts`, `lib/singing-gender.ts`, `lib/voice-embed.ts`
 * and `lib/artist-timbre-db.ts` — keep this type stable.
 */

export type TimbreGender = "female" | "male";

/**
 * Frames quieter than this (Meyda's `rms`, a 0..1 amplitude-domain value) are
 * treated as silence/room-noise and skipped so they don't drag the medians
 * around. ~0.012 is roughly -38 dBFS — quiet room noise / breathing on a
 * typical mic gain, well below actual singing.
 */
export const RMS_NOISE_FLOOR = 0.012;

/**
 * Minimum number of above-noise-floor frames required before we trust the
 * measurement. With the 2048-sample analysis buffer used in `TimbreMatcher`
 * at ~44.1kHz that's a new frame roughly every ~46ms (~21 frames/sec), so 30
 * frames ≈ 1.4s of real, non-silent singing.
 */
export const MIN_VOICED_FRAMES = 30;

/**
 * Minimum number of *pitched* frames (frames where YIN additionally found an
 * F0) required before `medianHz` is trustworthy enough to classify a Vocal
 * Fach from. Deliberately smaller than `MIN_VOICED_FRAMES` — not every voiced
 * frame carries a clean, YIN-detectable pitch (breath noise, consonants) —
 * but still ~1s of clearly pitched singing, which rejects an all-noise take.
 *
 * These two gates are DECOUPLED on purpose: a frame that is loud enough but
 * unpitched still contributes a spectral-centroid sample. Coupling them is
 * what used to produce the bogus "звук не распознан" rejection on perfectly
 * normal singing.
 */
export const MIN_PITCHED_FRAMES = 20;

/**
 * Calibration range for spectral centroid → `timbreWeight` (0-100).
 *
 * These are FIXED constants, not per-recording min/max: normalising a take
 * against its own extremes would be self-referential (every voice would end
 * up spanning the full 0-100 scale) and could not be compared against the
 * hand-authored star weights at all.
 *
 * 200 Hz is below where any sung voice's spectral centre of mass sits even for
 * the darkest bass (a very dark male chest voice measures ~400-700 Hz through
 * a typical mic); 4000 Hz is above the brightest, most ringing/breathy female
 * pop timbre (~2500-3500 Hz). Anything outside is clamped.
 *
 * The mapping is LOGARITHMIC in frequency (≈4.32 octaves across the range)
 * rather than linear, because perceived brightness tracks octaves, not Hz —
 * and because a linear map would squash almost every real voice into the
 * bottom third of the scale. Sanity points on this curve:
 *   600 Hz → 37  (dark baritone — near Frank Sinatra's 30)
 *  1000 Hz → 53
 *  2000 Hz → 77
 *  3000 Hz → 90  (bright pop tenor — near Justin Bieber's 90)
 *
 * KNOWN LIMITATION: the spectral centroid is amplitude-weighted over the FULL
 * band, so a thousand quiet high-frequency bins can outweigh a handful of loud
 * harmonic ones — meaning the microphone's broadband noise floor biases this
 * measurement upwards. Measured on a synthetic dark 120Hz voice at 48kHz, the
 * median centroid moves 860Hz → 1350Hz → 2240Hz as the noise floor goes
 * -74 → -62 → -54 dBFS. Bright and dark voices still separate cleanly at any
 * one noise level (which is what the ranking needs), but the absolute weight
 * of a quiet-mic take and a noisy-mic take are not directly comparable. Fixing
 * that properly would require band-limiting the centroid to the vocal range
 * rather than using Meyda's full-band figure.
 */
export const CENTROID_WEIGHT_MIN_HZ = 200;
export const CENTROID_WEIGHT_MAX_HZ = 4000;

/**
 * Meyda's `spectralCentroid` is `mu(1, ampSpectrum)` — the amplitude-weighted
 * mean BIN INDEX of the amplitude spectrum, NOT a frequency in Hz. Bin `k` of
 * a `bufferSize`-point FFT sits at `k * sampleRate / bufferSize`, so that is
 * the conversion applied here. (The previous version of this file compared the
 * raw bin index against Hz-scaled constants, which silently made its
 * brightness axis meaningless.)
 */
export function centroidBinToHz(
  binIndex: number,
  sampleRate: number,
  bufferSize: number
): number {
  if (!Number.isFinite(binIndex) || bufferSize <= 0) return 0;
  return (binIndex * sampleRate) / bufferSize;
}

/** Spectral centroid in Hz → 0-100 timbre weight. See the calibration note above. */
export function centroidHzToWeight(centroidHz: number): number {
  if (!Number.isFinite(centroidHz) || centroidHz <= 0) return 0;
  const span = Math.log2(CENTROID_WEIGHT_MAX_HZ / CENTROID_WEIGHT_MIN_HZ);
  const position = Math.log2(centroidHz / CENTROID_WEIGHT_MIN_HZ) / span;
  return Math.round(Math.max(0, Math.min(1, position)) * 100);
}

/** Robust (median-based) summary of a single take. */
export type VoiceMeasurement = {
  /** Median fundamental frequency in Hz across pitched frames — drives the Vocal Fach. */
  medianHz: number;
  /** Median spectral centroid in Hz across non-silent frames. */
  medianCentroidHz: number;
  /** `medianCentroidHz` mapped onto the same 0-100 scale as the stars' `timbreWeight`. */
  userWeight: number;
  /** Frames that passed the noise-floor gate. */
  frameCount: number;
  /** Subset of those where YIN also found an F0. */
  pitchedFrameCount: number;
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? (sorted[mid] ?? 0)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/**
 * Accumulates the two per-frame series (spectral centroid + YIN F0) captured
 * live during the take, gating out near-silent frames via `RMS_NOISE_FLOOR`,
 * and reduces them to medians. Median rather than mean so a couple of
 * momentarily louder/brighter syllables can't drag the whole result around.
 */
export class VoiceMeasurementAccumulator {
  private centroidBins: number[] = [];
  private pitchHz: number[] = [];
  private frames = 0;

  constructor(
    private readonly sampleRate: number,
    private readonly bufferSize: number
  ) {}

  /**
   * Feed one analysis frame. `centroidBin` and `rms` come from Meyda;
   * `f0Hz` comes from running YIN over raw PCM for roughly the same window
   * (null when YIN found no usable pitch — such a frame STILL contributes its
   * centroid, see `MIN_PITCHED_FRAMES`). Malformed values are ignored.
   */
  addFrame(
    centroidBin: number | undefined,
    rms: number | undefined,
    f0Hz?: number | null
  ): void {
    if (typeof rms !== "number" || !Number.isFinite(rms) || rms < RMS_NOISE_FLOOR) {
      return; // silence gate
    }
    this.frames += 1;

    if (typeof centroidBin === "number" && Number.isFinite(centroidBin) && centroidBin > 0) {
      this.centroidBins.push(centroidBin);
    }
    if (typeof f0Hz === "number" && Number.isFinite(f0Hz) && f0Hz > 0) {
      this.pitchHz.push(f0Hz);
    }
  }

  get frameCount(): number {
    return this.frames;
  }

  get pitchedFrameCount(): number {
    return this.pitchHz.length;
  }

  /** Medians + derived weight, or null when the take carried too little usable signal. */
  finalize(): VoiceMeasurement | null {
    if (this.frames < MIN_VOICED_FRAMES) return null;
    if (this.pitchHz.length < MIN_PITCHED_FRAMES) return null;
    if (this.centroidBins.length === 0) return null;

    const medianCentroidHz = centroidBinToHz(
      median(this.centroidBins),
      this.sampleRate,
      this.bufferSize
    );

    return {
      medianHz: median(this.pitchHz),
      medianCentroidHz,
      userWeight: centroidHzToWeight(medianCentroidHz),
      frameCount: this.frames,
      pitchedFrameCount: this.pitchHz.length,
    };
  }
}
