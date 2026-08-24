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
 *   timbreWeight ← spectral centroid (Hz, log map), blended median + p75
 *   airiness     ← mid↔air HF energy ratio (0.5–2.2 vs 2.2–8 kHz), not ZCR
 *   raspiness    ← spectral flatness, blended median + p75 so grit *moments*
 *                  (rock rasp, belt distortion) actually move the vector
 *   tessituraSpan← IQR of pitched F0 in semitones, mapped 0–100
 *
 * Using the median ALONE collapsed every 10-second take onto the same
 * “average vowel” point, so the nearest stars never changed. Style lives
 * in the upper tail of flatness/centroid and in how wide the melody is.
 *
 * Air used to be mapped from zero-crossing rate. That is almost always 0 for
 * sung vowels: a 150 Hz chest tone at 44.1 kHz has ZCR ≈ 0.007, below the
 * old 0.015 floor, and ZCR mostly tracks F0 rather than breath. Breath / air
 * lives in the upper mid band (~2.5–10 kHz on consumer mics).
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
export const RMS_NOISE_FLOOR = 0.004;

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
 * `hfRatio` is energy in the air band divided by (mid + air), from Meyda's
 * amplitude spectrum. Mid is ~0.5–2.2 kHz (formants), NOT 80 Hz–airHi: the
 * fundamental + strong low harmonics otherwise crush the ratio to ≪ 0.02 on
 * every take → airiness stuck near 0 regardless of breathy vs clear singing.
 *
 * Air band 2.2–8 kHz: consumer / laptop mics roll off hard above ~6–8 kHz;
 * breath / air cues for amateur singing live mostly there.
 *
 * Log map (same family as centroid / flatness) so typical laptop ratios
 * separate: dense chest ~0.02 → low teens, breathy ~0.12 → high 70s.
 */
export const HF_AIR_MIN = 0.015;
export const HF_AIR_MAX = 0.18;
/** Lower edge of the “air” band (Hz). */
export const HF_AIR_BAND_LO_HZ = 2200;
/** Upper edge of the “air” band (Hz). */
export const HF_AIR_BAND_HI_HZ = 8000;
/** Lower edge of the mid/formant band used in the denominator (Hz). */
export const HF_AIR_MID_LO_HZ = 500;

/**
 * Calibration range for zero-crossing RATE → `airiness` (0-100).
 * Fallback only, when no amplitude spectrum is available.
 */
export const ZCR_AIR_MIN = 0.003;
export const ZCR_AIR_MAX = 0.06;

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
  // Meyda's ampSpectrum is bufferSize/2 (or /2+1). Prefer an fftSize that
  // matches the supplied spectrum so a wrong bufferSize can't map every bin
  // into the mid band and force airiness to 0.
  const inferredFft = Math.max(2, (spectrum.length - 1) * 2);
  const resolvedFft =
    Math.abs(inferredFft - fftSize) <= 2 ? fftSize : Math.max(fftSize, inferredFft);
  const binHz = sampleRate / resolvedFft;
  const nyquist = sampleRate / 2;
  const airHi = Math.min(HF_AIR_BAND_HI_HZ, nyquist);
  let mid = 0;
  let air = 0;
  for (let i = 1; i < spectrum.length; i += 1) {
    const hz = i * binHz;
    if (hz < HF_AIR_MID_LO_HZ || hz > airHi) continue;
    const mag = Math.abs(spectrum[i] ?? 0);
    if (!Number.isFinite(mag)) continue;
    const energy = mag * mag;
    if (hz < HF_AIR_BAND_LO_HZ) mid += energy;
    else air += energy;
  }
  const total = mid + air;
  if (total <= 0) return 0;
  return air / total;
}

export function hfRatioToAiriness(ratio: number): number {
  return Math.round(logMap(ratio, HF_AIR_MIN, HF_AIR_MAX) * 100);
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

/**
 * Matching axes blend median (stable colour) with a lighter p75 (style peaks).
 * Rasp used to be 30/70 median/p75 — mic hiss spikes flattened the spectrum
 * and pushed almost every laptop take into “rock grit” territory. Median-led
 * rasp keeps grit when it is sustained, without inventing rasp from noise.
 */
export const WEIGHT_MEDIAN_MIX = 0.55;
export const WEIGHT_P75_MIX = 0.45;
export const RASP_MEDIAN_MIX = 0.7;
export const RASP_P75_MIX = 0.3;
/** Air: lean on p75 so breathy peaks / airy consonants actually move the axis. */
export const AIR_MEDIAN_MIX = 0.4;
export const AIR_P75_MIX = 0.6;

/** Robust summary of a single take — medians plus style-sensitive tails. */
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
  /** Median zero-crossing rate (0–1) across non-silent frames. */
  medianZcrRate: number;
  /** Median high-frequency energy ratio (0–1) when a spectrum was supplied. */
  medianHfRatio: number;
  /** 75th percentile HF energy ratio (0–1). */
  p75HfRatio: number;
  /** Count of frames that contributed an HF ratio. */
  hfFrameCount: number;
  /** Blended centroid → 0-100, same scale as the stars' `timbreWeight`. */
  userWeight: number;
  /** HF-ratio (or ZCR fallback) → 0-100, same scale as the stars' `airiness`. */
  userAiriness: number;
  /** Blended flatness → 0-100, same scale as the stars' `raspiness`. */
  userRaspiness: number;
  /** Pitch IQR mapped 0–100, same scale as the stars' `tessituraSpan`. */
  tessituraSpan: number;
  /** Frames that passed the noise-floor gate. */
  frameCount: number;
  /** Subset of those where YIN also found an F0. */
  pitchedFrameCount: number;
};

function median(values: number[]): number {
  return percentile(values, 0.5);
}

/**
 * Accumulates the per-frame series captured live during the take, gating out
 * near-silent frames via `RMS_NOISE_FLOOR`.
 *
 * Ranking uses a *blend* of median (stable timbre colour) and the 75th
 * percentile (style peaks: grit, belt brightness, wider melody). A pure
 * median washed rock rasp and pop belt back into the same “average vowel”.
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
    // Prefer pitched / clearly-voiced frames for air so room hiss doesn't
    // invent breath, but still accept high-RMS unpitched frames (breathy
    // onsets often fail YIN).
    const pitched =
      typeof f0Hz === "number" && Number.isFinite(f0Hz) && f0Hz > 0;
    const voicedAir = pitched || rms >= RMS_NOISE_FLOOR * 1.5;
    if (voicedAir && amplitudeSpectrum && amplitudeSpectrum.length > 0) {
      const ratio = amplitudeSpectrumToHfRatio(
        amplitudeSpectrum,
        this.sampleRate,
        this.bufferSize
      );
      if (Number.isFinite(ratio) && ratio >= 0) this.hfRatios.push(ratio);
    }
    if (pitched) {
      this.pitchHz.push(f0Hz as number);
    }
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
    if (this.hfRatios.length === 0 && this.zcrRates.length === 0) return null;

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
    const medianZcrRate = median(this.zcrRates);
    const medianHfRatio = this.hfRatios.length > 0 ? median(this.hfRatios) : 0;
    const p75HfRatio =
      this.hfRatios.length > 0 ? percentile(this.hfRatios, 0.75) : 0;
    const p25Hz = percentile(this.pitchHz, 0.25);
    const p75Hz = percentile(this.pitchHz, 0.75);
    // Prefer HF-ratio (breath lives in mid↔air). Blend median + p75 so breathy
    // peaks move the axis. If HF stays near zero, blend in ZCR rather than
    // locking airiness at 0.
    let userAiriness: number;
    if (this.hfRatios.length > 0) {
      const fromHf = Math.round(
        AIR_MEDIAN_MIX * hfRatioToAiriness(medianHfRatio) +
          AIR_P75_MIX * hfRatioToAiriness(p75HfRatio)
      );
      if (fromHf > 0 || this.zcrRates.length === 0) {
        userAiriness = fromHf;
      } else {
        const fromZcr = zcrRateToAiriness(medianZcrRate);
        userAiriness = Math.round(0.35 * fromHf + 0.65 * fromZcr);
      }
    } else {
      userAiriness = zcrRateToAiriness(medianZcrRate);
    }

    const userWeight = Math.round(
      WEIGHT_MEDIAN_MIX * centroidHzToWeight(medianCentroidHz) +
        WEIGHT_P75_MIX * centroidHzToWeight(p75CentroidHz)
    );
    const userRaspiness = Math.round(
      RASP_MEDIAN_MIX * flatnessToRaspiness(medianFlatness) +
        RASP_P75_MIX * flatnessToRaspiness(p75Flatness)
    );

    return {
      medianHz: median(this.pitchHz),
      p25Hz,
      p75Hz,
      medianCentroidHz,
      p75CentroidHz,
      medianFlatness,
      p75Flatness,
      medianZcrRate,
      medianHfRatio,
      p75HfRatio,
      hfFrameCount: this.hfRatios.length,
      userWeight: Math.max(0, Math.min(100, userWeight)),
      userAiriness: Math.max(0, Math.min(100, userAiriness)),
      userRaspiness: Math.max(0, Math.min(100, userRaspiness)),
      tessituraSpan: pitchIqrToSpan(p25Hz, p75Hz),
      frameCount: this.frames,
      pitchedFrameCount: this.pitchHz.length,
    };
  }
}
