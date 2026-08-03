/** Timbre fingerprint extraction from PCM (client-safe). */

import { detectPitchHz, midiFromFrequency } from "@/lib/pitch";
import { estimateGenderFromFormants } from "@/lib/formant-gender";

export type TimbreGender = "female" | "male";

export type TimbreFeatures = {
  /** 12-dim vector, values roughly 0..1 */
  vector: number[];
  pitchMeanMidi: number;
  pitchMedianMidi: number;
  pitchStd: number;
  centroid: number;
  /** Always resolved to male/female for matching. */
  gender: TimbreGender;
  genderConfidence: "high" | "medium" | "low";
  genderSource: "formants" | "pitch" | "api";
  /** @deprecated use `gender` */
  genderHint: TimbreGender | "ambiguous";
};

function mean(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  }
  return sorted[mid] ?? 0;
}

function std(values: number[]) {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(
    values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length
  );
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

/**
 * Lightweight spectral + pitch fingerprint from AudioBuffer.
 * Gender prefers vocal-tract formants over F0 (falsetto-safe).
 */
export async function extractTimbreFeatures(
  audioBuffer: AudioBuffer
): Promise<TimbreFeatures> {
  const channel = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const frameSize = 2048;
  const hop = 1024;

  const pitchesHz: number[] = [];
  const centroids: number[] = [];
  const rolloffs: number[] = [];
  const flatness: number[] = [];
  const energies: number[] = [];
  const zcrs: number[] = [];
  const brightness: number[] = [];

  for (let start = 0; start + frameSize < channel.length; start += hop) {
    const frame = channel.subarray(start, start + frameSize);
    let energy = 0;
    let zc = 0;
    for (let i = 0; i < frame.length; i += 1) {
      const s = frame[i] ?? 0;
      energy += s * s;
      if (i > 0) {
        const prev = frame[i - 1] ?? 0;
        if ((s >= 0 && prev < 0) || (s < 0 && prev >= 0)) zc += 1;
      }
    }
    energy = Math.sqrt(energy / frame.length);
    if (energy < 0.012) continue;

    energies.push(energy);
    zcrs.push(zc / frame.length);

    const mags: number[] = [];
    for (let k = 1; k < frameSize / 2; k += 4) {
      let re = 0;
      let im = 0;
      const w = (2 * Math.PI * k) / frameSize;
      for (let n = 0; n < frame.length; n += 2) {
        const s = frame[n] ?? 0;
        re += s * Math.cos(w * n);
        im -= s * Math.sin(w * n);
      }
      mags.push(Math.hypot(re, im));
    }
    const magSum = mags.reduce((a, b) => a + b, 0) || 1;
    let cent = 0;
    let geo = 0;
    let arith = 0;
    let high = 0;
    let low = 0;
    for (let i = 0; i < mags.length; i += 1) {
      const mag = mags[i] ?? 0;
      const freq = ((i * 4 + 1) * sampleRate) / frameSize;
      cent += freq * mag;
      arith += mag;
      geo += Math.log(mag + 1e-9);
      if (freq >= 2000) high += mag;
      else low += mag;
    }
    centroids.push(cent / magSum);
    brightness.push(high / (low + high + 1e-9));

    const target = magSum * 0.85;
    let roll = sampleRate / 4;
    let cum = 0;
    for (let i = 0; i < mags.length; i += 1) {
      cum += mags[i] ?? 0;
      if (cum >= target) {
        roll = ((i * 4 + 1) * sampleRate) / frameSize;
        break;
      }
    }
    rolloffs.push(roll);
    flatness.push(Math.exp(geo / mags.length) / (arith / mags.length + 1e-9));

    const floatFrame = new Float32Array(frame);
    const hz = detectPitchHz(floatFrame, sampleRate);
    if (hz >= 70 && hz <= 500) pitchesHz.push(hz);
  }

  const pitchMidis = pitchesHz.map((hz) => midiFromFrequency(hz));
  const pitchMeanMidi = mean(pitchMidis) || 55;
  const pitchMedianMidi = median(pitchMidis) || pitchMeanMidi;
  const pitchStdMidi = std(pitchMidis);
  const centroid = mean(centroids) || 1500;
  const rolloff = mean(rolloffs) || 3000;
  const flat = mean(flatness) || 0.2;
  const zcr = mean(zcrs) || 0.05;
  const dyn = std(energies) / (mean(energies) + 1e-6);
  const bright = mean(brightness) || 0.35;

  let vibrato = 0;
  if (pitchesHz.length > 8) {
    const diffs = [];
    for (let i = 1; i < pitchesHz.length; i += 1) {
      diffs.push(Math.abs((pitchesHz[i] ?? 0) - (pitchesHz[i - 1] ?? 0)));
    }
    vibrato = mean(diffs) / (mean(pitchesHz) + 1e-6);
  }

  const formants = estimateGenderFromFormants(channel, sampleRate);
  let gender: TimbreGender;
  let genderConfidence: TimbreFeatures["genderConfidence"];
  let genderSource: TimbreFeatures["genderSource"];

  if (formants && formants.confidence !== "low") {
    gender = formants.gender;
    genderConfidence = formants.confidence;
    genderSource = "formants";
  } else if (formants) {
    gender = formants.gender;
    genderConfidence = "low";
    genderSource = "formants";
  } else {
    gender = pitchMedianMidi >= 58 ? "female" : "male";
    genderConfidence = "low";
    genderSource = "pitch";
  }

  const genderAxis = gender === "female" ? 0.22 : 0.82;

  const vector = [
    clamp01(pitchMedianMidi / 90),
    clamp01(pitchStdMidi / 10),
    clamp01(centroid / 5000),
    clamp01(rolloff / 8000),
    clamp01(flat * 2.5),
    clamp01(zcr * 10),
    clamp01(dyn * 1.2),
    clamp01(vibrato * 50),
    genderAxis,
    clamp01(mean(energies) * 3.5),
    clamp01(bright),
    clamp01((centroid - 900) / 3500),
  ];

  return {
    vector,
    pitchMeanMidi,
    pitchMedianMidi,
    pitchStd: pitchStdMidi,
    centroid,
    gender,
    genderConfidence,
    genderSource,
    genderHint: genderConfidence === "low" ? "ambiguous" : gender,
  };
}

export function pearsonSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let meanA = 0;
  let meanB = 0;
  for (let i = 0; i < n; i += 1) {
    meanA += a[i] ?? 0;
    meanB += b[i] ?? 0;
  }
  meanA /= n;
  meanB /= n;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i += 1) {
    const da = (a[i] ?? 0) - meanA;
    const db = (b[i] ?? 0) - meanB;
    dot += da * db;
    na += da * da;
    nb += db * db;
  }
  if (na < 1e-12 || nb < 1e-12) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function featureDistance(a: number[], b: number[]): number {
  const weights = [1.5, 0.9, 1.3, 1.0, 1.0, 0.7, 0.8, 1.1, 0, 0.6, 1.2, 1.0];
  const n = Math.min(a.length, b.length, weights.length);
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    const w = weights[i] ?? 1;
    if (w <= 0) continue;
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    sum += w * d * d;
  }
  return Math.sqrt(sum);
}

export function rawTimbreAffinity(a: number[], b: number[]): number {
  const dist = featureDistance(a, b);
  const pearson = pearsonSimilarity(a, b);
  const fromDist = Math.exp(-dist * 2.4);
  const fromCorr = (pearson + 1) / 2;
  return 0.55 * fromDist + 0.45 * fromCorr;
}
