/**
 * Voice measurement primitives for the 3-D Voice Celebrity Match
 * (client-safe, pure — no DOM/AudioContext dependencies, so it is
 * directly unit-testable with synthetic signals).
 *
 * The live frame-by-frame extraction runs inside
 * `components/ai/TimbreMatcher.tsx` (it needs a live AudioContext/stream):
 * Meyda computes `spectralCentroid` + `spectralFlatness` + `zcr` + `rms` per
 * frame, while `pitchfinder`'s YIN detector computes F0 from RAW PCM tapped
 * via a parallel `AnalyserNode` on the same source — deliberately NOT Meyda's
 * own `buffer` feature, which is the Hanning-WINDOWED signal and destroys
 * exactly the periodicity YIN needs (that mistake made YIN return null on
 * nearly every frame of real singing).
 *
 * This module owns the pure part: gating out near-silent frames, accumulating
 * the per-frame series, reducing them to medians, and converting raw Meyda
 * values onto the same 0-100 axes the stars are authored on.
 *
 * Axes (all 0-100, FIXED calibration — never per-take min/max):
 *   timbreWeight ← spectral centroid (Hz, log map)
 *   airiness     ← high-frequency energy ratio (4–12 kHz), not ZCR
 *   raspiness    ← spectral flatness
 *
 * Air used to be mapped from zero-crossing rate. That is almost always 0 for
 * sung vowels: a 150 Hz chest tone at 44.1 kHz has ZCR ≈ 0.007, below the
 * old 0.015 floor, and ZCR mostly tracks F0 rather than breath. Breath / air
 * lives in the 4–12 kHz band.
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
 * typical mic gain, well below actual singing. Do NOT raise this enough to
 * reject normal (even quiet) singing.
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
 * unpitched still contributes centroid / flatness / zcr samples. Coupling
 * them is what used to produce the bogus "звук не распознан" rejection on
 * perfectly normal singing. F0 is accumulated ONLY from YIN-success frames.
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
 *   600 Hz → 37  (dark baritone — near Frank Sinatra's 20)
 *  1000 Hz → 53
 *  2000 Hz → 77
 *  3000 Hz → 90  (bright pop tenor — near Justin Bieber's 90)
 *
 * KNOWN LIMITATION: the spectral centroid is amplitude-weighted over the FULL
 * band, so a thousand quiet high-frequency bins can outweigh a handful of loud
 * harmonic ones — meaning the microphone's broadband noise floor biases this
 * measurement upwards. Bright and dark voices still separate cleanly at any
 * one noise level (which is what the ranking needs).
 */
export const CENTROID_WEIGHT_MIN_HZ = 200;
export const CENTROID_WEIGHT_MAX_HZ = 4000;

/**
 * Calibration range for Meyda `spectralFlatness` → `raspiness` (0-100).
 *
 * Meyda's flatness is geometricMean / arithmeticMean of the magnitude
 * spectrum, theoretically 0 (pure tone) … 1 (white noise). Clean sung vowels
 * sit ~0.001–0.03; light rasp ~0.04–0.08; heavy rasp / split / distortion
 * ~0.10–0.25. The map is LOGARITHMIC because flatness is roughly log-
 * distributed across real voices — a linear map would squash every clean
 * singer into 0–10.
 *
 *   0.001 → 0    (pure, clean)
 *   0.010 → 37
 *   0.050 → 63
 *   0.250 → 100  (noise-like rasp)
 */
export const FLATNESS_RASP_MIN = 0.001;
export const FLATNESS_RASP_MAX = 0.25;

/**
 * High-frequency energy ratio → airiness (0-100).
 *
 * `hfRatio` is energy in 4–12 kHz divided by energy in 80 Hz–12 kHz, from
 * Meyda's amplitude spectrum (or an equivalent FFT). Dense chest vowels sit
 * ~0.02–0.08; mixed / light ~0.10–0.18; breathy pop ~0.22–0.40.
 *
 *   0.03 → 0     (dense)
 *   0.12 → 35
 *   0.28 → 100   (very breathy)
 */
export const HF_AIR_MIN = 0.03;
export const HF_AIR_MAX = 0.28;
export const HF_AIR_BAND_LO_HZ = 4000;
export const HF_AIR_BAND_HI_HZ = 12000;

/**
 * Calibration range for zero-crossing RATE → `airiness` (0-100).
 * Fallback only, when no amplitude spectrum is available.
 */
export const ZCR_AIR_MIN = 0.004;
export const ZCR_AIR_MAX = 0.08;

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

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function logMap(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const span = Math.log(max / min);
  return clamp01(Math.log(value / min) / span);
}

function linMap(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return clamp01((value - min) / (max - min));
}

/** Spectral centroid in Hz → 0-100 timbre weight. See the calibration note above. */
export function centroidHzToWeight(centroidHz: number): number {
  return Math.round(logMap(centroidHz, CENTROID_WEIGHT_MIN_HZ, CENTROID_WEIGHT_MAX_HZ) * 100);
}

/** Meyda spectralFlatness (0–1) → 0-100 raspiness. */
export function flatnessToRaspiness(flatness: number): number {
  return Math.round(logMap(flatness, FLATNESS_RASP_MIN, FLATNESS_RASP_MAX) * 100);
}

/**
 * Convert Meyda's `zcr` to a 0–1 rate. Meyda 5.x returns a raw crossing
 * COUNT; if a future build already returns a rate (≤ 1) we leave it as-is.
 */
export function zcrToRate(zcr: number, bufferSize: number): number {
  if (!Number.isFinite(zcr) || zcr < 0) return 0;
  if (zcr > 1 && bufferSize > 0) return zcr / bufferSize;
  return zcr;
}

/** Zero-crossing rate (0–1) → 0-100 airiness. Fallback when no spectrum. */
export function zcrRateToAiriness(zcrRate: number): number {
  return Math.round(linMap(zcrRate, ZCR_AIR_MIN, ZCR_AIR_MAX) * 100);
}

/**
 * Convert a magnitude spectrum (linear amplitude per FFT bin) into the
 * high-frequency energy ratio used for airiness. `fftSize` is the full FFT
 * size (typically 2 × spectrum.length).
 */
export function amplitudeSpectrumToHfRatio(
  spectrum: ArrayLike<number>,
  sampleRate: number,
  fftSize: number
): number {
  if (!spectrum.length || sampleRate <= 0 || fftSize <= 0) return 0;
  const binHz = sampleRate / fftSize;
  const nyquist = sampleRate / 2;
  const airHi = Math.min(HF_AIR_BAND_HI_HZ, nyquist);
  let voiced = 0;
  let air = 0;
  for (let i = 1; i < spectrum.length; i += 1) {
    const hz = i * binHz;
    if (hz < 80 || hz > airHi) continue;
    const mag = spectrum[i] ?? 0;
    const energy = mag * mag;
    if (hz < HF_AIR_BAND_LO_HZ) voiced += energy;
    else air += energy;
  }
  const total = voiced + air;
  if (total <= 0) return 0;
  return air / total;
}

export function hfRatioToAiriness(ratio: number): number {
  return Math.round(linMap(ratio, HF_AIR_MIN, HF_AIR_MAX) * 100);
}

/** Robust (median-based) summary of a single take. */
export type VoiceMeasurement = {
  /** Median fundamental frequency in Hz across pitched frames — drives the Vocal Fach. */
  medianHz: number;
  /** Median spectral centroid in Hz across non-silent frames. */
  medianCentroidHz: number;
  /** Median Meyda spectralFlatness (0–1) across non-silent frames. */
  medianFlatness: number;
  /** Median zero-crossing rate (0–1) across non-silent frames. */
  medianZcrRate: number;
  /** Median high-frequency energy ratio (0–1) when a spectrum was supplied. */
  medianHfRatio: number;
  /** `medianCentroidHz` mapped onto the same 0-100 scale as the stars' `timbreWeight`. */
  userWeight: number;
  /** ZCR mapped onto the same 0-100 scale as the stars' `airiness`. */
  userAiriness: number;
  /** Flatness mapped onto the same 0-100 scale as the stars' `raspiness`. */
  userRaspiness: number;
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
 * Accumulates the per-frame series captured live during the take, gating out
 * near-silent frames via `RMS_NOISE_FLOOR`, and reduces them to medians.
 * Median rather than mean so a couple of momentarily louder/brighter
 * syllables can't drag the whole result around.
 *
 * Decoupling: centroid / flatness / zcr come from RMS-voiced frames; F0
 * comes only from YIN-success frames.
 */
export class VoiceMeasurementAccumulator {
  private centroidBins: number[] = [];
  private flatness: number[] = [];
  private zcrRates: number[] = [];
  private hfRatios: number[] = [];
  private pitchHz: number[] = [];
  private frames = 0;

  constructor(
    private readonly sampleRate: number,
    private readonly bufferSize: number
  ) {}

  /**
   * Feed one analysis frame. `centroidBin`, `rms`, `spectralFlatness` and
   * `zcr` come from Meyda; `f0Hz` comes from running YIN over raw PCM for
   * roughly the same window (null when YIN found no usable pitch — such a
   * frame STILL contributes its timbre features, see `MIN_PITCHED_FRAMES`).
   * Malformed values are ignored.
   */
  addFrame(
    centroidBin: number | undefined,
    rms: number | undefined,
    f0Hz?: number | null,
    spectralFlatness?: number,
    zcr?: number,
    amplitudeSpectrum?: ArrayLike<number>
  ): void {
    if (typeof rms !== "number" || !Number.isFinite(rms) || rms < RMS_NOISE_FLOOR) {
      return; // silence gate
    }
    this.frames += 1;

    if (typeof centroidBin === "number" && Number.isFinite(centroidBin) && centroidBin > 0) {
      this.centroidBins.push(centroidBin);
    }
    if (typeof spectralFlatness === "number" && Number.isFinite(spectralFlatness) && spectralFlatness >= 0) {
      this.flatness.push(spectralFlatness);
    }
    if (typeof zcr === "number" && Number.isFinite(zcr) && zcr >= 0) {
      this.zcrRates.push(zcrToRate(zcr, this.bufferSize));
    }
    if (amplitudeSpectrum && amplitudeSpectrum.length > 0) {
      const ratio = amplitudeSpectrumToHfRatio(
        amplitudeSpectrum,
        this.sampleRate,
        this.bufferSize
      );
      if (Number.isFinite(ratio) && ratio >= 0) this.hfRatios.push(ratio);
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

  /** Medians + derived 3-D vector, or null when the take carried too little usable signal. */
  finalize(): VoiceMeasurement | null {
    if (this.frames < MIN_VOICED_FRAMES) return null;
    if (this.pitchHz.length < MIN_PITCHED_FRAMES) return null;
    if (this.centroidBins.length === 0) return null;
    if (this.flatness.length === 0) return null;
    if (this.hfRatios.length === 0 && this.zcrRates.length === 0) return null;

    const medianCentroidHz = centroidBinToHz(
      median(this.centroidBins),
      this.sampleRate,
      this.bufferSize
    );
    const medianFlatness = median(this.flatness);
    const medianZcrRate = median(this.zcrRates);
    const medianHfRatio = median(this.hfRatios);
    const userAiriness =
      this.hfRatios.length > 0
        ? hfRatioToAiriness(medianHfRatio)
        : zcrRateToAiriness(medianZcrRate);

    return {
      medianHz: median(this.pitchHz),
      medianCentroidHz,
      medianFlatness,
      medianZcrRate,
      medianHfRatio,
      userWeight: centroidHzToWeight(medianCentroidHz),
      userAiriness,
      userRaspiness: flatnessToRaspiness(medianFlatness),
      frameCount: this.frames,
      pitchedFrameCount: this.pitchHz.length,
    };
  }
}
