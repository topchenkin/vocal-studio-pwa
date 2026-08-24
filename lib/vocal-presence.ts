/** Detect singing/speech vs knocks, silence, pure noise (client-safe). */

import { detectPitchHzOctaveSafe } from "@/lib/pitch";

export type VocalPresenceResult = {
  ok: boolean;
  reason?: string;
  voicedRatio: number;
  crestFactor: number;
  activeRatio: number;
};

function rmsOf(frame: Float32Array) {
  let e = 0;
  for (let i = 0; i < frame.length; i += 1) {
    const s = frame[i] ?? 0;
    e += s * s;
  }
  return Math.sqrt(e / Math.max(1, frame.length));
}

function peakOf(frame: Float32Array) {
  let p = 0;
  for (let i = 0; i < frame.length; i += 1) {
    p = Math.max(p, Math.abs(frame[i] ?? 0));
  }
  return p;
}

/** Mid-band energy ratio — hoarse/weak voices still light up 300–3400 Hz. */
function midBandRatio(frame: Float32Array, sampleRate: number): number {
  const n = Math.min(1024, frame.length);
  let mid = 0;
  let all = 0;
  const maxBin = Math.floor(n / 2);
  for (let k = 1; k < maxBin; k += 3) {
    let re = 0;
    let im = 0;
    const w = (2 * Math.PI * k) / n;
    for (let i = 0; i < n; i += 4) {
      const s = frame[i] ?? 0;
      re += s * Math.cos(w * i);
      im -= s * Math.sin(w * i);
    }
    const mag = Math.hypot(re, im);
    const freq = (k * sampleRate) / n;
    all += mag;
    if (freq >= 300 && freq <= 3400) mid += mag;
  }
  return mid / (all + 1e-9);
}

/**
 * Vocal-activity gate. Accepts quiet / hoarse / breathy singing
 * (not only strong clear pitched tones).
 */
export function assessVocalPresence(
  audioBuffer: AudioBuffer
): VocalPresenceResult {
  const channel = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const frameSize = 2048;
  const hop = 1024;

  let active = 0;
  let voiced = 0;
  let vocalish = 0; // pitched OR mid-band sustained (hoarse)
  let total = 0;
  let globalPeak = 0;
  let energySum = 0;
  let energyCount = 0;
  let consecutiveVocal = 0;
  let maxVocalRun = 0;

  for (let start = 0; start + frameSize < channel.length; start += hop) {
    const frame = channel.subarray(start, start + frameSize);
    const floatFrame =
      frame instanceof Float32Array ? frame : new Float32Array(frame);
    const rms = rmsOf(floatFrame);
    const peak = peakOf(floatFrame);
    globalPeak = Math.max(globalPeak, peak);
    total += 1;

    // Quiet threshold lowered for weak voices
    if (rms < 0.0035) {
      consecutiveVocal = 0;
      continue;
    }

    active += 1;
    energySum += rms * rms;
    energyCount += 1;

    const hz = detectPitchHzOctaveSafe(floatFrame, sampleRate);
    const pitched = hz >= 70 && hz <= 550;
    if (pitched) voiced += 1;

    // Hoarse/breathy: little clear F0 but energy in speech/sing band
    const mid = midBandRatio(floatFrame, sampleRate);
    const isVocalish = pitched || (rms >= 0.004 && mid >= 0.35);
    if (isVocalish) {
      vocalish += 1;
      consecutiveVocal += 1;
      maxVocalRun = Math.max(maxVocalRun, consecutiveVocal);
    } else {
      consecutiveVocal = 0;
    }
  }

  const voicedRatio = total > 0 ? voiced / total : 0;
  const vocalishRatio = total > 0 ? vocalish / total : 0;
  const activeRatio = total > 0 ? active / total : 0;
  const meanRms = energyCount > 0 ? Math.sqrt(energySum / energyCount) : 0;
  const crestFactor = meanRms > 1e-6 ? globalPeak / meanRms : 99;

  // Extreme silence / knocks only — quiet normal singing must pass.
  if (activeRatio < 0.03 || meanRms < 0.0025) {
    return {
      ok: false,
      reason:
        "Слишком тихо или почти тишина. Подойдите ближе к микрофону и спойте пару фраз обычным голосом — кричать не нужно.",
      voicedRatio,
      crestFactor,
      activeRatio,
    };
  }

  // Impulsive knocks only
  if (crestFactor >= 14 && vocalishRatio < 0.06 && voicedRatio < 0.05) {
    return {
      ok: false,
      reason:
        "Похоже на стук/шум, а не на голос. Нужна запись пения или речи (несколько секунд).",
      voicedRatio,
      crestFactor,
      activeRatio,
    };
  }

  // Accept either clear pitch OR sustained vocal-band energy (hoarse/weak)
  if (vocalishRatio < 0.04 && voicedRatio < 0.03) {
    return {
      ok: false,
      reason:
        "Мало голосового сигнала. Спойте гласные или короткую фразу ближе к микрофону.",
      voicedRatio,
      crestFactor,
      activeRatio,
    };
  }

  if (maxVocalRun < 1) {
    return {
      ok: false,
      reason:
        "Голос слишком обрывистый. Спойте непрерывно хотя бы пару секунд.",
      voicedRatio,
      crestFactor,
      activeRatio,
    };
  }

  return {
    ok: true,
    voicedRatio: Math.max(voicedRatio, vocalishRatio),
    crestFactor,
    activeRatio,
  };
}
