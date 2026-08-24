/**
 * Offline (post-recording) voice feature extraction for «Звёздный двойник».
 *
 * Deliberately runs AFTER the take ends so we can spend analysis time on the
 * full PCM buffer (overlapping frames, YIN on 4096 windows, Meyda spectra)
 * instead of racing live callbacks. Libraries used honestly:
 *   - meyda: rms, spectralCentroid, spectralFlatness, zcr, amplitudeSpectrum
 *   - pitchfinder (YIN via lib/pitch): F0
 * No fabricated axes — every displayed parameter maps to a measured feature.
 */

import type { MeydaFeaturesObject } from "meyda";
import { createYinDetector } from "@/lib/pitch";
import {
  VoiceMeasurementAccumulator,
  type VoiceMeasurement,
  RMS_NOISE_FLOOR,
} from "@/lib/timbre-features";

const SPECTRAL_BUFFER = 2048;
const PITCH_WINDOW = 4096;
const HOP = 1024;

const FEATURES = [
  "spectralCentroid",
  "spectralFlatness",
  "zcr",
  "rms",
  "amplitudeSpectrum",
] as const;

type MeydaExtract = {
  bufferSize: number;
  sampleRate: number;
  extract: (
    features: readonly string[] | string,
    signal: Float32Array
  ) => Partial<MeydaFeaturesObject> | null;
};

async function loadMeyda(): Promise<MeydaExtract> {
  const mod = (await import("meyda")) as unknown as {
    default?: MeydaExtract;
    extract?: MeydaExtract["extract"];
    bufferSize?: number;
    sampleRate?: number;
  };
  const Meyda = (mod.default ?? mod) as MeydaExtract;
  if (typeof Meyda.extract !== "function") {
    throw new Error("Анализ тембра недоступен в этом браузере");
  }
  return Meyda;
}

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      (
        window as Window & {
          requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => void;
        }
      ).requestIdleCallback(() => resolve(), { timeout: 32 });
    } else {
      setTimeout(resolve, 0);
    }
  });
}

/**
 * Full-buffer analysis. Returns null only when there is too little usable
 * voiced/pitched content (same gates as VoiceMeasurementAccumulator.finalize).
 */
export async function analyzeVoiceBuffer(
  audioBuffer: AudioBuffer
): Promise<VoiceMeasurement | null> {
  const channel = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  if (channel.length < SPECTRAL_BUFFER) return null;

  const Meyda = await loadMeyda();
  Meyda.bufferSize = SPECTRAL_BUFFER;
  Meyda.sampleRate = sampleRate;

  const yin = createYinDetector(sampleRate);
  const accumulator = new VoiceMeasurementAccumulator(sampleRate, SPECTRAL_BUFFER);

  const spectralFrame = new Float32Array(SPECTRAL_BUFFER);
  const pitchFrame = new Float32Array(PITCH_WINDOW);
  let framesSeen = 0;

  for (let start = 0; start + SPECTRAL_BUFFER <= channel.length; start += HOP) {
    spectralFrame.set(channel.subarray(start, start + SPECTRAL_BUFFER));

    const features = Meyda.extract(FEATURES as unknown as string[], spectralFrame);
    if (!features) continue;

    let f0: number | null = null;
    const pitchStart = Math.max(0, start + SPECTRAL_BUFFER - PITCH_WINDOW);
    if (pitchStart + PITCH_WINDOW <= channel.length) {
      pitchFrame.set(channel.subarray(pitchStart, pitchStart + PITCH_WINDOW));
      f0 = yin(pitchFrame);
    }

    // Rasp from broadband mic hiss without a voice fundamental is not rasp —
    // only feed flatness when the frame is clearly voiced (RMS) OR pitched.
    const rms = features.rms;
    const voicedEnough =
      typeof rms === "number" &&
      Number.isFinite(rms) &&
      rms >= RMS_NOISE_FLOOR * 1.25;
    const pitched = typeof f0 === "number" && f0 > 0;
    const flatness =
      voicedEnough || pitched ? features.spectralFlatness : undefined;

    accumulator.addFrame(
      features.spectralCentroid,
      features.rms,
      f0,
      flatness,
      features.zcr,
      features.amplitudeSpectrum
    );

    framesSeen += 1;
    if (framesSeen % 24 === 0) await yieldToUi();
  }

  return accumulator.finalize();
}
