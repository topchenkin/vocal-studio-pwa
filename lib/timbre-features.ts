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
 *   raspiness    ← robust harmonic-noise evidence, piecewise calibration
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
export const MIN_RELIABLE_RASP_FRAMES = 16;

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
 * Boundaries for robust harmonic-noise evidence:
 * Meyda flatness * sqrt(1 - normalized autocorrelation at F0).
 *
 * Deterministic Meyda 5.6.3 calibration (48 kHz, FFT 2048, hop 1024) put the
 * p35 evidence at 0..0.0014 for clean/phone-floor/consonant-burst signals,
 * 0.012..0.016 for moderate/breathy noise and 0.079+ for strong noise.
 * Raw flatness alone was 0.07..0.15 for clean signals with a tiny broadband
 * floor, proving the old 0.012/0.04 thresholds were not microphone-safe.
 */
export const FLATNESS_CLEAN_MAX = 0.004;
export const FLATNESS_LIGHT_RASP_MAX = 0.05;
export const FLATNESS_STRONG_MAX = 0.16;
export const FEMALE_FLATNESS_LIGHT_RASP_MAX = 0.06;
export const RASP_PERCENTILE = 0.35;
export const MAX_VOICED_ZCR = 0.12;
export const MIN_PERIODICITY = 0.35;

export type RaspLabel =
  | "Чистый"
  | "С лёгкой хрипотцой"
  | "Выраженная хрипотца";

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

/**
 * Robust harmonic-noise evidence → a strict 0..100 axis and display category.
 *
 * The input is deliberately not raw flatness: flatness is multiplied by the
 * square root of periodicity loss, then reduced with p35 over reliable voiced
 * frames. This keeps a stationary microphone floor from masquerading as rasp.
 */
export function mapFlatnessToRasp(robustRaspEvidence: number): {
  raspiness: number;
  label: RaspLabel;
} {
  const flatness = clamp(robustRaspEvidence, 0, 1);
  if (flatness <= FLATNESS_CLEAN_MAX) {
    return {
      raspiness: Math.round(
        clampAndMap(flatness, 0, FLATNESS_CLEAN_MAX) * 0.3
      ),
      label: "Чистый",
    };
  }
  if (flatness <= FLATNESS_LIGHT_RASP_MAX) {
    return {
      raspiness: Math.round(
        34 +
          clampAndMap(
            flatness,
            FLATNESS_CLEAN_MAX,
            FLATNESS_LIGHT_RASP_MAX
          ) *
            0.32
      ),
      label: "С лёгкой хрипотцой",
    };
  }
  return {
    raspiness: Math.round(
      67 +
        clampAndMap(
          Math.min(flatness, FLATNESS_STRONG_MAX),
          FLATNESS_LIGHT_RASP_MAX,
          FLATNESS_STRONG_MAX
        ) *
          0.33
    ),
    label: "Выраженная хрипотца",
  };
}

export type RaspCalibration = {
  rawEvidence: number;
  compensatedEvidence: number;
  compensationFactor: number;
  thresholdSet: "male-legacy-v1" | "female-phone-f0-v1";
  cleanMax: number;
  lightMax: number;
};

/**
 * Converts the female phone-capture evidence bands onto the legacy male axis.
 *
 * The male axis is intentionally identity. Female thresholds reflect the
 * measured clean floor from sparse, formant-shaped spectra; the small F0 term
 * follows the observed clean p35 envelope after fractional-lag periodicity.
 */
export function calibrateRaspEvidence(
  rawEvidence: number,
  gender: TimbreGender | undefined,
  medianF0Hz: number
): RaspCalibration {
  const raw = clamp(rawEvidence, 0, 1);
  if (gender !== "female") {
    return {
      rawEvidence: raw,
      compensatedEvidence: raw,
      compensationFactor: 1,
      thresholdSet: "male-legacy-v1",
      cleanMax: FLATNESS_CLEAN_MAX,
      lightMax: FLATNESS_LIGHT_RASP_MAX,
    };
  }

  const f0 = clamp(medianF0Hz, 200, 600);
  const cleanMax = clamp(0.021 - (f0 - 200) * 0.000005, 0.019, 0.021);
  let compensatedEvidence: number;
  if (raw <= cleanMax) {
    compensatedEvidence = (raw / cleanMax) * FLATNESS_CLEAN_MAX;
  } else if (raw <= FEMALE_FLATNESS_LIGHT_RASP_MAX) {
    compensatedEvidence =
      FLATNESS_CLEAN_MAX +
      ((raw - cleanMax) /
        (FEMALE_FLATNESS_LIGHT_RASP_MAX - cleanMax)) *
        (FLATNESS_LIGHT_RASP_MAX - FLATNESS_CLEAN_MAX);
  } else {
    compensatedEvidence =
      FLATNESS_LIGHT_RASP_MAX +
      ((raw - FEMALE_FLATNESS_LIGHT_RASP_MAX) /
        (FLATNESS_STRONG_MAX - FEMALE_FLATNESS_LIGHT_RASP_MAX)) *
        (FLATNESS_STRONG_MAX - FLATNESS_LIGHT_RASP_MAX);
  }
  compensatedEvidence = clamp(compensatedEvidence, 0, 1);
  return {
    rawEvidence: raw,
    compensatedEvidence,
    compensationFactor: raw > 0 ? compensatedEvidence / raw : 1,
    thresholdSet: "female-phone-f0-v1",
    cleanMax,
    lightMax: FEMALE_FLATNESS_LIGHT_RASP_MAX,
  };
}

/** Backward-compatible numeric projection. */
export function flatnessToRaspiness(flatness: number): number {
  return mapFlatnessToRasp(flatness).raspiness;
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
 * Normalized autocorrelation at the detected F0 period. A periodic harmonic
 * vowel approaches 1; broadband/noisy energy lowers the value.
 */
export function normalizedPeriodicity(
  frame: Float32Array,
  sampleRate: number,
  pitchHz: number | null
): number {
  if (!pitchHz || !Number.isFinite(pitchHz) || pitchHz <= 0) return 0;
  const exactLag = sampleRate / pitchHz;
  if (exactLag < 2 || exactLag >= frame.length / 2) return 0;

  // Integer rounding creates up to half a sample of phase error. At soprano
  // F0 (short periods, sparse high harmonics) that error is a materially
  // larger fraction of a cycle than it is for male F0. Interpolate at the
  // fractional lag instead of snapping the autocorrelation to an integer.
  const whole = Math.floor(exactLag);
  const fraction = exactLag - whole;
  let xy = 0;
  let xx = 0;
  let yy = 0;
  const limit = frame.length - whole - 1;
  for (let index = 0; index < limit; index += 1) {
    const x = frame[index] ?? 0;
    const y0 = frame[index + whole] ?? 0;
    const y1 = frame[index + whole + 1] ?? y0;
    const y = y0 + (y1 - y0) * fraction;
    xy += x * y;
    xx += x * x;
    yy += y * y;
  }
  if (xx <= 0 || yy <= 0) return 0;
  return clamp(xy / Math.sqrt(xx * yy), 0, 1);
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
  /** Raw Meyda flatness distribution across reliable sustained voiced frames. */
  p10Flatness: number;
  p25Flatness: number;
  medianFlatness: number;
  p75Flatness: number;
  /** p35 raw flatness, logged independently from the final combined evidence. */
  robustFlatness: number;
  /** Raw p35 of flatness * sqrt(periodicity loss), before gender/F0 calibration. */
  rawRobustRaspEvidence: number;
  /** Gender/F0-calibrated evidence on the legacy male mapping axis. */
  robustRaspEvidence: number;
  raspCompensationFactor: number;
  raspThresholdSet: RaspCalibration["thresholdSet"];
  raspCleanThreshold: number;
  raspLightThreshold: number;
  p25Periodicity: number;
  medianPeriodicity: number;
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
  /** Frames accepted for rasp after pitch/range/ZCR/periodicity/transient gates. */
  reliableRaspFrameCount: number;
  /** Above-RMS frames rejected by one of the reliability gates. */
  rejectedRaspFrameCount: number;
  rejectedRaspReasons: {
    belowNoise: number;
    missingPitch: number;
    pitchRange: number;
    transient: number;
    zcr: number;
    periodicity: number;
  };
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
  private raspEvidence: number[] = [];
  private periodicity: number[] = [];
  private frames = 0;
  private rejectedRaspFrames = 0;
  private totalFrames = 0;
  private rejectedReasons = {
    belowNoise: 0,
    missingPitch: 0,
    pitchRange: 0,
    transient: 0,
    zcr: 0,
    periodicity: 0,
  };

  constructor(
    private readonly sampleRate: number,
    private readonly bufferSize: number,
    private readonly noiseGateRms = RMS_NOISE_FLOOR,
    private readonly noiseFloorRms = 0,
    private readonly gender?: TimbreGender
  ) {}

  /** Explicitly clear every per-take DSP array/counter before reuse. */
  reset(): void {
    this.centroidBins = [];
    this.flatness = [];
    this.pitchHz = [];
    this.voicedRms = [];
    this.raspEvidence = [];
    this.periodicity = [];
    this.frames = 0;
    this.rejectedRaspFrames = 0;
    this.totalFrames = 0;
    this.rejectedReasons = {
      belowNoise: 0,
      missingPitch: 0,
      pitchRange: 0,
      transient: 0,
      zcr: 0,
      periodicity: 0,
    };
  }

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
    spectralFlatness?: number,
    zcr?: number,
    periodicity?: number,
    transient = false
  ): void {
    this.totalFrames += 1;
    if (typeof rms !== "number" || !Number.isFinite(rms) || rms < this.noiseGateRms) {
      this.rejectedReasons.belowNoise += 1;
      return;
    }

    // A measured F0 is required for Fach anyway. Restricting all three timbre
    // axes to these frames also keeps room hiss and unpitched knocks out.
    if (typeof f0Hz !== "number" || !Number.isFinite(f0Hz) || f0Hz <= 0) {
      this.rejectedRaspFrames += 1;
      this.rejectedReasons.missingPitch += 1;
      return;
    }
    const pitchValue = f0Hz;
    const [minPitch, maxPitch] =
      this.gender === "female"
        ? [130, 1100]
        : this.gender === "male"
          ? [70, 520]
          : [70, 1100];
    if (pitchValue < minPitch || pitchValue > maxPitch) {
      this.rejectedRaspFrames += 1;
      this.rejectedReasons.pitchRange += 1;
      return;
    }
    if (transient) {
      this.rejectedRaspFrames += 1;
      this.rejectedReasons.transient += 1;
      return;
    }
    if (typeof zcr === "number" && Number.isFinite(zcr) && zcr > MAX_VOICED_ZCR) {
      this.rejectedRaspFrames += 1;
      this.rejectedReasons.zcr += 1;
      return;
    }
    if (
      typeof periodicity === "number" &&
      Number.isFinite(periodicity) &&
      periodicity < MIN_PERIODICITY
    ) {
      this.rejectedRaspFrames += 1;
      this.rejectedReasons.periodicity += 1;
      return;
    }

    this.frames += 1;
    this.voicedRms.push(rms);

    if (typeof centroidBin === "number" && Number.isFinite(centroidBin) && centroidBin > 0) {
      this.centroidBins.push(centroidBin);
    }
    if (typeof spectralFlatness === "number" && Number.isFinite(spectralFlatness) && spectralFlatness >= 0) {
      this.flatness.push(spectralFlatness);
      const periodicityValue =
        typeof periodicity === "number" && Number.isFinite(periodicity)
          ? clamp(periodicity, 0, 1)
          : 0;
      this.periodicity.push(periodicityValue);
      this.raspEvidence.push(
        spectralFlatness * Math.sqrt(Math.max(0, 1 - periodicityValue))
      );
    }
    this.pitchHz.push(pitchValue);
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
    if (this.raspEvidence.length < MIN_RELIABLE_RASP_FRAMES) return null;
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
    const p10Flatness = percentile(this.flatness, 0.1);
    const p25Flatness = percentile(this.flatness, 0.25);
    const medianFlatness = median(this.flatness);
    const p75Flatness = percentile(this.flatness, 0.75);
    const robustFlatness = percentile(this.flatness, RASP_PERCENTILE);
    const rawRobustRaspEvidence = percentile(this.raspEvidence, RASP_PERCENTILE);
    const p25Hz = percentile(this.pitchHz, 0.25);
    const p75Hz = percentile(this.pitchHz, 0.75);
    const medianHz = median(this.pitchHz);
    const raspCalibration = calibrateRaspEvidence(
      rawRobustRaspEvidence,
      this.gender,
      medianHz
    );
    const robustRaspEvidence = raspCalibration.compensatedEvidence;
    const userWeight = centroidHzToWeight(medianCentroidHz);
    const userRaspiness = flatnessToRaspiness(robustRaspEvidence);

    return {
      medianHz,
      p25Hz,
      p75Hz,
      medianCentroidHz,
      p75CentroidHz,
      p10Flatness,
      p25Flatness,
      medianFlatness,
      p75Flatness,
      robustFlatness,
      rawRobustRaspEvidence,
      robustRaspEvidence,
      raspCompensationFactor: raspCalibration.compensationFactor,
      raspThresholdSet: raspCalibration.thresholdSet,
      raspCleanThreshold: raspCalibration.cleanMax,
      raspLightThreshold: raspCalibration.lightMax,
      p25Periodicity: percentile(this.periodicity, 0.25),
      medianPeriodicity: median(this.periodicity),
      userWeight: Math.max(0, Math.min(100, userWeight)),
      userRaspiness: Math.max(0, Math.min(100, userRaspiness)),
      tessituraSpan: pitchIqrToSpan(p25Hz, p75Hz),
      frameCount: this.frames,
      pitchedFrameCount: this.pitchHz.length,
      reliableRaspFrameCount: this.raspEvidence.length,
      rejectedRaspFrameCount: this.rejectedRaspFrames,
      rejectedRaspReasons: { ...this.rejectedReasons },
      totalFrameCount: this.totalFrames,
      noiseFloorRms: this.noiseFloorRms,
      noiseGateRms: this.noiseGateRms,
      medianVoicedRms: median(this.voicedRms),
    };
  }
}
