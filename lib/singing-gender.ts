/**
 * Gender for SINGING — pitch-first with octave-safe F0.
 *
 * Critical: autocorrelation often reports 2×F0 for low male voices.
 * That used to trigger a hard "female" veto after a female session looked fine.
 */

import {
  detectPitchHzOctaveSafe,
  midiFromFrequency,
  snapToNearbyOctave,
} from "@/lib/pitch";
import type { TimbreGender } from "@/lib/timbre-features";

export type SingingGenderResult = {
  gender: TimbreGender;
  confidence: "high" | "medium" | "low";
  source: "pitch" | "envelope" | "mixed";
  pitchMedianHz: number;
  pitchMedianMidi: number;
  pitchFrames: number;
  f1: number;
  f2: number;
  brightness: number;
  debug: string;
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

function percentile(values: number[], p: number) {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.floor((s.length - 1) * p)));
  return s[i] ?? 0;
}

function frameSpectrum(
  frame: Float32Array,
  sampleRate: number,
  fftSize = 2048
): { mags: number[]; freqs: number[] } {
  const n = Math.min(fftSize, frame.length);
  const mags: number[] = [];
  const freqs: number[] = [];
  const maxBin = Math.min(
    Math.floor(n / 2),
    Math.floor((5000 * n) / sampleRate)
  );

  for (let k = 1; k < maxBin; k += 2) {
    let re = 0;
    let im = 0;
    const w = (2 * Math.PI * k) / n;
    for (let i = 0; i < n; i += 2) {
      const win = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
      const s = (frame[i] ?? 0) * win;
      re += s * Math.cos(w * i);
      im -= s * Math.sin(w * i);
    }
    mags.push(Math.hypot(re, im));
    freqs.push((k * sampleRate) / n);
  }
  return { mags, freqs };
}

function envelopeFormants(
  mags: number[],
  freqs: number[],
  f0Hz: number
): { f1: number; f2: number } | null {
  if (mags.length < 8) return null;
  const df = (freqs[1] ?? 20) - (freqs[0] ?? 0) || 20;
  const spacing = f0Hz > 60 ? f0Hz : 160;
  const radius = Math.max(2, Math.round((spacing * 1.15) / df));

  const env = new Array(mags.length).fill(0);
  for (let i = 0; i < mags.length; i += 1) {
    let s = 0;
    let c = 0;
    for (let k = -radius; k <= radius; k += 1) {
      const j = i + k;
      if (j < 0 || j >= mags.length) continue;
      s += mags[j] ?? 0;
      c += 1;
    }
    env[i] = s / Math.max(1, c);
  }

  const peaks: { f: number; a: number }[] = [];
  for (let i = 2; i < env.length - 2; i += 1) {
    const v = env[i] ?? 0;
    if (
      v > (env[i - 1] ?? 0) &&
      v >= (env[i + 1] ?? 0) &&
      v > (env[i - 2] ?? 0) &&
      v > (env[i + 2] ?? 0)
    ) {
      const f = freqs[i] ?? 0;
      if (f >= 280 && f <= 3200) peaks.push({ f, a: v });
    }
  }
  peaks.sort((a, b) => b.a - a.a);
  if (peaks.length < 2) return null;

  const top = peaks.slice(0, 6).sort((a, b) => a.f - b.f);
  const f1 = top[0]?.f ?? 0;
  let f2 = top[1]?.f ?? 0;
  for (let i = 1; i < top.length; i += 1) {
    const p = top[i]?.f ?? 0;
    if (p - f1 >= 280) {
      f2 = p;
      break;
    }
  }
  if (f2 <= f1) return null;
  return { f1, f2 };
}

function brightnessOf(mags: number[], freqs: number[]): number {
  let low = 0;
  let high = 0;
  for (let i = 0; i < mags.length; i += 1) {
    const f = freqs[i] ?? 0;
    const m = mags[i] ?? 0;
    if (f < 1500) low += m;
    else if (f < 5000) high += m;
  }
  return high / (low + high + 1e-9);
}

/**
 * Stabilize F0 track: octave-safe per frame + snap to running median.
 */
function collectStablePitches(
  channel: Float32Array,
  sampleRate: number
): number[] {
  const frameSize = 2048;
  const hop = 1024;
  const raw: number[] = [];
  let ref = 0;

  for (let start = 0; start + frameSize < channel.length; start += hop) {
    const frame = channel.subarray(start, start + frameSize);
    let energy = 0;
    for (let i = 0; i < frame.length; i += 1) {
      const s = frame[i] ?? 0;
      energy += s * s;
    }
    // Accept quieter frames (weak / hoarse voices)
    if (Math.sqrt(energy / frame.length) < 0.004) continue;

    let hz = detectPitchHzOctaveSafe(new Float32Array(frame), sampleRate);
    if (hz < 70 || hz > 550) continue;
    if (ref > 0) hz = snapToNearbyOctave(hz, ref);
    raw.push(hz);
    // Update ref toward low side of recent pitches (bias against octave-up)
    if (raw.length >= 3) {
      const recent = raw.slice(-5);
      ref = median(recent);
    } else {
      ref = hz;
    }
  }

  if (raw.length < 4) return raw;

  // Only fold globally when distribution is BIMODAL (cluster at f and ~f/2),
  // not when everything consistently sits high (real female / thin voice).
  const med = median(raw);
  if (med >= 200 && med <= 400) {
    const lowCluster = raw.filter((h) => h >= 80 && h <= med * 0.6);
    const highCluster = raw.filter((h) => h >= med * 0.85);
    // Need a real low cluster (≥30% of frames), not forced halving of all highs
    if (
      lowCluster.length >= Math.max(3, raw.length * 0.3) &&
      highCluster.length >= raw.length * 0.35
    ) {
      const medLow = median(lowCluster);
      if (medLow >= 80 && medLow <= 175) {
        return raw.map((h) =>
          h >= 190 && Math.abs(h / 2 - medLow) / medLow < 0.2 ? h / 2 : h
        );
      }
    }
  }

  return raw;
}

export function classifySingingGender(
  channel: Float32Array,
  sampleRate: number
): SingingGenderResult {
  const pitchesHz = collectStablePitches(channel, sampleRate);
  const frameSize = 2048;
  const hop = 2048;
  const f1s: number[] = [];
  const f2s: number[] = [];
  const brights: number[] = [];
  let spectrumN = 0;

  for (let start = 0; start + frameSize < channel.length; start += hop) {
    const frame = channel.subarray(start, start + frameSize);
    let energy = 0;
    for (let i = 0; i < frame.length; i += 1) {
      const s = frame[i] ?? 0;
      energy += s * s;
    }
    if (Math.sqrt(energy / frame.length) < 0.004) continue;

    spectrumN += 1;
    if (spectrumN % 2 !== 0) continue;
    const hz = detectPitchHzOctaveSafe(new Float32Array(frame), sampleRate);
    const { mags, freqs } = frameSpectrum(frame, sampleRate, frameSize);
    brights.push(brightnessOf(mags, freqs));
    const formants = envelopeFormants(mags, freqs, hz > 0 ? hz : 160);
    if (formants) {
      f1s.push(formants.f1);
      f2s.push(formants.f2);
    }
  }

  const pitchMedianHz = median(pitchesHz);
  const pitchMedianMidi =
    pitchMedianHz > 0 ? midiFromFrequency(pitchMedianHz) : 0;
  const pitchP25 = percentile(pitchesHz, 0.25);
  const pitchP75 = percentile(pitchesHz, 0.75);
  const bright = mean(brights);
  const f1 = median(f1s);
  const f2 = median(f2s);
  const formantSum = f1 > 0 && f2 > 0 ? f1 + f2 : 0;

  let femaleScore = 0;
  let maleScore = 0;

  // Pitch votes — balanced, no hard one-sided veto
  if (pitchesHz.length >= 4) {
    if (pitchMedianHz <= 155) maleScore += 4;
    else if (pitchMedianHz <= 175) maleScore += 3;
    else if (pitchMedianHz <= 195) maleScore += 1;
    else if (pitchMedianHz >= 250) femaleScore += 4;
    else if (pitchMedianHz >= 220) femaleScore += 3;
    else if (pitchMedianHz >= 200) femaleScore += 2;
    else {
      // 195–200 ambiguous — use spread
      if (pitchP25 <= 170) maleScore += 2;
      if (pitchP75 >= 230) femaleScore += 2;
    }

    // Low quartile is a strong male signal (chest voice)
    if (pitchP25 > 0 && pitchP25 <= 150) maleScore += 2;
    if (pitchP75 >= 260) femaleScore += 1;
  }

  // Envelope — secondary. Ignore bogus harmonic-as-formant reads.
  const formantsTrustworthy =
    formantSum >= 2000 &&
    !(pitchMedianHz >= 180 && formantSum < pitchMedianHz * 5);
  if (formantsTrustworthy) {
    if (formantSum >= 2800) femaleScore += 2;
    else if (formantSum >= 2550) femaleScore += 1;
    else if (formantSum <= 2100) maleScore += 2;
    else if (formantSum <= 2350) maleScore += 1;
  }

  if (bright >= 0.45) femaleScore += 1;
  else if (bright > 0 && bright <= 0.25) maleScore += 1;

  // Clear pitch bands decide gender even on ties / weak envelope
  if (pitchesHz.length >= 4 && pitchMedianHz >= 210 && pitchP25 >= 195) {
    femaleScore += 3;
  }
  if (pitchesHz.length >= 4 && pitchMedianHz <= 170 && pitchP75 <= 195) {
    maleScore += 3;
  }

  let gender: TimbreGender = femaleScore > maleScore ? "female" : "male";
  if (femaleScore === maleScore) {
    gender =
      pitchMedianHz > 0
        ? pitchMedianHz >= 200
          ? "female"
          : "male"
        : bright >= 0.4
          ? "female"
          : "male";
  }

  // Soft consistency clamps
  if (pitchMedianHz > 0 && pitchMedianHz <= 160 && gender === "female") {
    gender = "male";
    maleScore += 3;
  }
  if (pitchMedianHz >= 210 && pitchP25 >= 195 && gender === "male") {
    gender = "female";
    femaleScore += 3;
  }

  const margin = Math.abs(femaleScore - maleScore);
  const confidence: SingingGenderResult["confidence"] =
    margin >= 4
      ? "high"
      : margin >= 2 || pitchesHz.length >= 8
        ? "medium"
        : "low";

  const source: SingingGenderResult["source"] =
    pitchesHz.length >= 4
      ? formantSum > 0
        ? "mixed"
        : "pitch"
      : formantSum > 0
        ? "envelope"
        : "mixed";

  const debug = [
    `F0̃=${pitchMedianHz ? pitchMedianHz.toFixed(0) : "—"}Hz`,
    `p25=${pitchP25 ? pitchP25.toFixed(0) : "—"}`,
    `n=${pitchesHz.length}`,
    `F1+F2=${formantSum ? formantSum.toFixed(0) : "—"}`,
    `votes f${femaleScore}/m${maleScore}`,
  ].join(" · ");

  return {
    gender,
    confidence,
    source,
    pitchMedianHz,
    pitchMedianMidi,
    pitchFrames: pitchesHz.length,
    f1,
    f2,
    brightness: bright,
    debug,
  };
}
