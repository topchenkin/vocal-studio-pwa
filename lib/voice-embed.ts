/**
 * Discriminative singing-voice embedding (client-safe).
 * 64-D: pitch / formants / spectrum / dynamics / color fingerprint.
 * Designed so different singing styles land in different regions
 * (unlike name-hash toy vectors that always ranked the same stars).
 */

import {
  detectPitchHzOctaveSafe,
  midiFromFrequency,
  snapToNearbyOctave,
} from "@/lib/pitch";
import { classifySingingGender } from "@/lib/singing-gender";
import type { TimbreGender } from "@/lib/timbre-features";

export const VOICE_EMBED_DIM = 64;

export type VoiceEmbedding = {
  vector: number[];
  gender: TimbreGender;
  genderConfidence: "high" | "medium" | "low";
  pitchMedianMidi: number;
  formantSum: number;
  brightness: number;
  grit: number;
  breathiness: number;
  vibrato: number;
};

function mean(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] ?? 0) : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2;
}

function std(values: number[]) {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length);
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function percentile(values: number[], p: number) {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.floor((s.length - 1) * p)));
  return s[i] ?? 0;
}

/** Bark-ish band edges (Hz) for coarse timbre color. */
const BANDS = [
  80, 150, 250, 350, 500, 700, 1000, 1400, 2000, 2800, 4000, 6000, 9000,
];

function bandEnergies(
  channel: Float32Array,
  sampleRate: number,
  frameSize = 2048
): number[] {
  const energies = new Array(BANDS.length - 1).fill(0);
  let frames = 0;
  const hop = 1024;

  for (let start = 0; start + frameSize < channel.length; start += hop) {
    let rms = 0;
    for (let i = 0; i < frameSize; i += 1) {
      const s = channel[start + i] ?? 0;
      rms += s * s;
    }
    rms = Math.sqrt(rms / frameSize);
    if (rms < 0.004) continue;

    const mags = new Array(frameSize / 2).fill(0);
    for (let k = 1; k < frameSize / 2; k += 2) {
      let re = 0;
      let im = 0;
      const w = (2 * Math.PI * k) / frameSize;
      for (let n = 0; n < frameSize; n += 3) {
        const s = channel[start + n] ?? 0;
        re += s * Math.cos(w * n);
        im -= s * Math.sin(w * n);
      }
      mags[k] = Math.hypot(re, im);
    }

    for (let b = 0; b < BANDS.length - 1; b += 1) {
      const f0 = BANDS[b] ?? 0;
      const f1 = BANDS[b + 1] ?? 0;
      const k0 = Math.floor((f0 * frameSize) / sampleRate);
      const k1 = Math.floor((f1 * frameSize) / sampleRate);
      let e = 0;
      for (let k = k0; k < k1 && k < mags.length; k += 1) e += mags[k] ?? 0;
      energies[b] += e;
    }
    frames += 1;
  }

  if (frames === 0) return energies.map(() => 0);
  const normed = energies.map((e) => e / frames);
  const total = normed.reduce((a, b) => a + b, 0) || 1;
  return normed.map((e) => e / total);
}

/**
 * Extract 64-D singing voice embedding from AudioBuffer.
 */
export async function extractVoiceEmbedding(
  audioBuffer: AudioBuffer
): Promise<VoiceEmbedding> {
  const channel = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const frameSize = 2048;
  const hop = 1024;

  const pitchesHz: number[] = [];
  const centroids: number[] = [];
  const rolloffs: number[] = [];
  const flatness: number[] = [];
  const brightness: number[] = [];
  const energies: number[] = [];
  const zcrs: number[] = [];
  const flux: number[] = [];
  let prevMags: number[] | null = null;

  for (let start = 0; start + frameSize < channel.length; start += hop) {
    const frame = channel.subarray(start, start + frameSize);
    let energy = 0;
    let zc = 0;
    let peak = 0;
    for (let i = 0; i < frame.length; i += 1) {
      const s = frame[i] ?? 0;
      energy += s * s;
      peak = Math.max(peak, Math.abs(s));
      if (i > 0) {
        const prev = frame[i - 1] ?? 0;
        if ((s >= 0 && prev < 0) || (s < 0 && prev >= 0)) zc += 1;
      }
    }
    energy = Math.sqrt(energy / frame.length);
    if (energy < 0.004) continue;

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
    flatness.push(Math.exp(geo / mags.length) / (arith / mags.length + 1e-9));

    let cum = 0;
    let roll = sampleRate / 4;
    const target = magSum * 0.85;
    for (let i = 0; i < mags.length; i += 1) {
      cum += mags[i] ?? 0;
      if (cum >= target) {
        roll = ((i * 4 + 1) * sampleRate) / frameSize;
        break;
      }
    }
    rolloffs.push(roll);

    if (prevMags) {
      let f = 0;
      const n = Math.min(prevMags.length, mags.length);
      for (let i = 0; i < n; i += 1) {
        f += Math.abs((mags[i] ?? 0) - (prevMags[i] ?? 0));
      }
      flux.push(f / (magSum + 1e-6));
    }
    prevMags = mags;

    let hz = detectPitchHzOctaveSafe(new Float32Array(frame), sampleRate);
    if (hz >= 70 && hz <= 550) {
      if (pitchesHz.length > 0) {
        hz = snapToNearbyOctave(hz, median(pitchesHz));
      }
      pitchesHz.push(hz);
    }
  }

  const midis = pitchesHz.map((hz) => midiFromFrequency(hz));
  const pitchMedianMidi = median(midis) || 55;
  const pitchMeanMidi = mean(midis) || pitchMedianMidi;
  const pitchStd = std(midis);
  const pitchRange =
    midis.length > 0
      ? percentile(midis, 0.9) - percentile(midis, 0.1)
      : 0;

  // Pitch-first singing gender (raw formant peaks were misreading high F0 as male)
  const singing = classifySingingGender(channel, sampleRate);
  const f1 = singing.f1 || 500;
  const f2 = singing.f2 || 1500;
  const formantSum = f1 + f2;
  const gender: TimbreGender = singing.gender;
  const genderConfidence: VoiceEmbedding["genderConfidence"] =
    singing.confidence;
  const pitchMedianMidiResolved =
    singing.pitchMedianMidi > 0 ? singing.pitchMedianMidi : pitchMedianMidi;

  const bright = mean(brightness);
  const flat = mean(flatness);
  const cent = mean(centroids);
  const roll = mean(rolloffs);
  const zcr = mean(zcrs);
  const dyn = std(energies) / (mean(energies) + 1e-6);
  const crest =
    mean(energies) > 1e-6
      ? Math.max(...energies.map((_, i) => energies[i] ?? 0)) / mean(energies)
      : 1;

  let vibrato = 0;
  if (pitchesHz.length > 10) {
    const diffs = [];
    for (let i = 1; i < pitchesHz.length; i += 1) {
      diffs.push(Math.abs((pitchesHz[i] ?? 0) - (pitchesHz[i - 1] ?? 0)));
    }
    vibrato = mean(diffs) / (mean(pitchesHz) + 1e-6);
  }

  // Heuristic grit / breath — amplify so style shifts move the embedding
  const grit = clamp01(Math.pow(flat * 1.9 + bright * 0.4 + (zcr - 0.04) * 5, 0.85));
  const breathiness = clamp01(Math.pow(flat * 1.3 + bright * 0.55, 0.9));
  const speechiness = clamp01(
    mean(flux) * 2.4 + (pitchStd < 1.2 && pitchRange < 4 ? 0.35 : 0) + (zcr > 0.08 ? 0.2 : 0)
  );

  const bands = bandEnergies(channel, sampleRate);

  const vector = new Array(VOICE_EMBED_DIM).fill(0);
  // 0-7 pitch — steeper mapping so register changes matter
  vector[0] = clamp01((pitchMedianMidiResolved - 40) / 40);
  vector[1] = clamp01((pitchMeanMidi - 40) / 40);
  vector[2] = clamp01(pitchStd / 7);
  vector[3] = clamp01(pitchRange / 12);
  vector[4] = clamp01(pitchesHz.length / 80);
  vector[5] = clamp01((pitchMedianMidiResolved - 45) / 28);
  vector[6] = gender === "female" ? 0.2 : 0.8;
  vector[7] = clamp01(vibrato * 70);
  // 8-15 formants / tract
  vector[8] = clamp01(f1 / 1000);
  vector[9] = clamp01(f2 / 3000);
  vector[10] = clamp01(formantSum / 4000);
  vector[11] = clamp01(f2 / (f1 + 1e-6) / 5);
  vector[12] = gender === "female" ? 0.35 : 0.65;
  vector[13] = clamp01(cent / 4500);
  vector[14] = clamp01(roll / 7500);
  vector[15] = clamp01(Math.pow(bright, 0.85));
  // 16-23 spectral shape / delivery
  vector[16] = clamp01(flat * 3.2);
  vector[17] = clamp01(speechiness);
  vector[18] = clamp01(zcr * 12);
  vector[19] = clamp01(dyn * 1.2);
  vector[20] = clamp01((crest - 1) / 6);
  vector[21] = clamp01(breathiness);
  vector[22] = clamp01(grit);
  vector[23] = clamp01(1 - Math.abs(pitchMedianMidiResolved - 57) / 22);
  // 24-35 band color (12 bands)
  for (let i = 0; i < 12; i += 1) {
    vector[24 + i] = clamp01((bands[i] ?? 0) * 9);
  }
  // 36-47 derived style axes (high weight in similarity)
  vector[36] = clamp01(
    pitchMedianMidiResolved < 50
      ? 0.9
      : pitchMedianMidiResolved < 56
        ? 0.55
        : 0.18
  );
  vector[37] = clamp01(bright * 0.75 + (cent > 2100 ? 0.35 : 0));
  vector[38] = clamp01(grit * 0.9 + (flat > 0.22 ? 0.25 : 0));
  vector[39] = clamp01(breathiness * 0.75 + vibrato * 25);
  vector[40] = clamp01(1 - grit);
  vector[41] = clamp01(pitchRange / 10);
  vector[42] = clamp01(speechiness);
  vector[43] = clamp01(formantSum < 2100 ? 0.75 : formantSum > 2500 ? 0.25 : 0.5);
  vector[44] = clamp01((bands[0] ?? 0) * 11);
  vector[45] = clamp01(((bands[4] ?? 0) + (bands[5] ?? 0)) * 7);
  vector[46] = clamp01(((bands[8] ?? 0) + (bands[9] ?? 0)) * 7);
  vector[47] = clamp01(((bands[10] ?? 0) + (bands[11] ?? 0)) * 9);
  // 48-63 fine fingerprint from band ratios
  for (let i = 0; i < 16; i += 1) {
    const a = bands[i % bands.length] ?? 0;
    const b = bands[(i + 3) % bands.length] ?? 0;
    vector[48 + i] = clamp01(0.5 + (a - b) * 5);
  }

  return {
    vector,
    gender,
    genderConfidence,
    pitchMedianMidi: pitchMedianMidiResolved,
    formantSum,
    brightness: bright,
    grit,
    breathiness,
    vibrato,
  };
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i += 1) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    na += (a[i] ?? 0) ** 2;
    nb += (b[i] ?? 0) ** 2;
  }
  if (na < 1e-12 || nb < 1e-12) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Fair style similarity for artist matching.
 * Uses only measured singing axes (pitch / tract / delivery / bands).
 * Ignores fingerprint dims 48–63 (hash noise that favored “center” stars).
 * Equal weights — no VIP boosts.
 */
export function fairVoiceSimilarity(a: number[], b: number[]): number {
  // Style dims that both user DSP and artist profiles populate meaningfully
  const DIMS = [
    0, 1, 5, 7, // pitch + vibrato
    8, 9, 10, 13, 15, // formants / brightness
    16, 17, 21, 22, // flat / speechy / breath / grit
    36, 37, 38, 39, 40, 41, 42, // style axes
    24, 25, 26, 30, 32, 34, // sparse band color
  ];
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const i of DIMS) {
    const da = (a[i] ?? 0.45) - 0.45;
    const db = (b[i] ?? 0.45) - 0.45;
    dot += da * db;
    na += da * da;
    nb += db * db;
  }
  if (na < 1e-12 || nb < 1e-12) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Weighted centered cosine. Optional per-dim weight override (genre-aware).
 * Emphasizes pitch / formant / style dims; downweights fine fingerprint noise.
 */
export function voiceSimilarity(
  a: number[],
  b: number[],
  weightFn?: (dim: number) => number
): number {
  if (!weightFn) return fairVoiceSimilarity(a, b);
  const n = Math.min(a.length, b.length, VOICE_EMBED_DIM);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i += 1) {
    if (i >= 48) continue; // never use fingerprint noise for ranking
    const w = weightFn(i);
    const da = ((a[i] ?? 0) - 0.45) * w;
    const db = ((b[i] ?? 0) - 0.45) * w;
    dot += da * db;
    na += da * da;
    nb += db * db;
  }
  if (na < 1e-12 || nb < 1e-12) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
