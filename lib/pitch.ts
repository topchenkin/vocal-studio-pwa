/** Musical pitch helpers + autocorrelation detector (client-safe). */

export const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

export const NOTE_NAMES_RU: Record<(typeof NOTE_NAMES)[number], string> = {
  C: "До",
  "C#": "До#",
  D: "Ре",
  "D#": "Ре#",
  E: "Ми",
  F: "Фа",
  "F#": "Фа#",
  G: "Соль",
  "G#": "Соль#",
  A: "Ля",
  "A#": "Ля#",
  B: "Си",
};

export type DetectedPitch = {
  frequency: number;
  note: string;
  noteIndex: number;
  octave: number;
  midi: number;
  cents: number;
};

/** MIDI note number → frequency (A4 = 440). */
export function frequencyFromMidi(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function midiFromFrequency(frequency: number): number {
  return 69 + 12 * Math.log2(frequency / 440);
}

export function noteLabelFromMidi(midi: number): string {
  const rounded = Math.round(midi);
  const name = NOTE_NAMES[((rounded % 12) + 12) % 12];
  const octave = Math.floor(rounded / 12) - 1;
  return `${name}${octave}`;
}

export function describeNote(note: string): string {
  const match = note.match(/^([A-G]#?)(-?\d+)$/);
  if (!match) return note;
  const name = match[1] as (typeof NOTE_NAMES)[number];
  const octave = match[2];
  return `${NOTE_NAMES_RU[name] ?? name} ${octave}`;
}

/**
 * Autocorrelation pitch detection.
 * Returns -1 when signal is too quiet / unreliable.
 */
export function detectPitchHz(
  buffer: Float32Array,
  sampleRate: number
): number {
  const SIZE = buffer.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i += 1) {
    const val = buffer[i] ?? 0;
    rms += val * val;
  }
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return -1;

  let r1 = 0;
  let r2 = SIZE - 1;
  const thres = 0.2;
  for (let i = 0; i < SIZE / 2; i += 1) {
    if (Math.abs(buffer[i] ?? 0) < thres) {
      r1 = i;
      break;
    }
  }
  for (let i = 1; i < SIZE / 2; i += 1) {
    if (Math.abs(buffer[SIZE - i] ?? 0) < thres) {
      r2 = SIZE - i;
      break;
    }
  }

  const buf = buffer.slice(r1, r2);
  const bufSize = buf.length;
  if (bufSize < 2) return -1;

  const c = new Float32Array(bufSize);
  for (let i = 0; i < bufSize; i += 1) {
    let sum = 0;
    for (let j = 0; j < bufSize - i; j += 1) {
      sum += (buf[j] ?? 0) * (buf[j + i] ?? 0);
    }
    c[i] = sum;
  }

  let d = 0;
  while (d < bufSize - 1 && (c[d] ?? 0) > (c[d + 1] ?? 0)) d += 1;
  let maxVal = -1;
  let maxPos = -1;
  for (let i = d; i < bufSize; i += 1) {
    const val = c[i] ?? 0;
    if (val > maxVal) {
      maxVal = val;
      maxPos = i;
    }
  }
  if (maxPos <= 0 || maxVal < 0.01) return -1;

  let T0 = maxPos;
  const x1 = c[T0 - 1] ?? 0;
  const x2 = c[T0] ?? 0;
  const x3 = c[T0 + 1] ?? 0;
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  if (a) T0 = T0 - b / (2 * a);

  const frequency = sampleRate / T0;
  if (frequency < 70 || frequency > 1200) return -1;
  return frequency;
}

/**
 * Autocorrelation F0 with careful octave-up correction.
 * Low male + strong 2nd harmonic → naive peak at 2×F0 → false "female".
 * Only fold down ONE octave when the half-frequency peak is nearly as strong
 * as the winner — never prefer arbitrary subharmonics (that broke female F0).
 */
export function detectPitchHzOctaveSafe(
  buffer: Float32Array,
  sampleRate: number
): number {
  const SIZE = buffer.length;
  let energy = 0;
  for (let i = 0; i < SIZE; i += 1) energy += (buffer[i] ?? 0) ** 2;
  const rms = Math.sqrt(energy / SIZE);
  if (rms < 0.004 || energy < 1e-8) return -1;

  const minLag = Math.floor(sampleRate / 500);
  const maxLag = Math.min(SIZE - 2, Math.floor(sampleRate / 70));
  if (maxLag <= minLag + 2) return detectPitchHz(buffer, sampleRate);

  const corrAt = (lag: number) => {
    let corr = 0;
    const n = SIZE - lag;
    for (let i = 0; i < n; i += 2) {
      corr += (buffer[i] ?? 0) * (buffer[i + lag] ?? 0);
    }
    return corr / energy;
  };

  // Find strongest peak in range
  let bestLag = -1;
  let bestCorr = 0;
  let prev = 0;
  let prev2 = 0;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    const corr = corrAt(lag);
    if (lag > minLag + 1 && prev > prev2 && prev >= corr && prev > bestCorr) {
      bestCorr = prev;
      bestLag = lag - 1;
    }
    prev2 = prev;
    prev = corr;
  }

  if (bestLag < 0 || bestCorr < 0.12) {
    return detectPitchHz(buffer, sampleRate);
  }

  let hz = sampleRate / bestLag;

  // Octave-up fix: fold only when (a) half-lag corr is strong AND
  // (b) spectrum actually has energy at f/2 (true fundamental present).
  // Pure high female F0 has weak spectrum at f/2 → do NOT fold.
  if (hz >= 190 && hz <= 420) {
    const halfLag = bestLag * 2;
    if (halfLag <= maxLag) {
      const halfCorr = corrAt(halfLag);
      if (halfCorr >= bestCorr * 0.9) {
        const halfHz = sampleRate / halfLag;
        if (halfHz >= 75 && halfHz <= 200) {
          const specFull = spectralMagNear(buffer, sampleRate, hz);
          const specHalf = spectralMagNear(buffer, sampleRate, halfHz);
          if (specHalf >= specFull * 0.55) {
            hz = halfHz;
          }
        }
      }
    }
  }

  if (hz < 70 || hz > 600) return -1;
  return hz;
}

/** Relative spectral magnitude near targetHz (Goertzel-ish). */
function spectralMagNear(
  buffer: Float32Array,
  sampleRate: number,
  targetHz: number
): number {
  const n = Math.min(2048, buffer.length);
  const k = Math.round((targetHz * n) / sampleRate);
  if (k < 1 || k >= n / 2) return 0;
  let re = 0;
  let im = 0;
  const w = (2 * Math.PI * k) / n;
  for (let i = 0; i < n; i += 2) {
    const s = buffer[i] ?? 0;
    re += s * Math.cos(w * i);
    im -= s * Math.sin(w * i);
  }
  return Math.hypot(re, im);
}

/**
 * Snap detected pitch to the octave closest to a reference (previous frame / target).
 * Autocorrelation often jumps ±1 octave; this keeps singing scores honest.
 */
export function snapToNearbyOctave(frequency: number, referenceHz: number): number {
  if (!Number.isFinite(frequency) || frequency <= 0) return frequency;
  if (!Number.isFinite(referenceHz) || referenceHz <= 0) return frequency;
  let best = frequency;
  let bestDist = Math.abs(Math.log2(frequency / referenceHz));
  for (const factor of [0.5, 2, 0.25, 4]) {
    const candidate = frequency * factor;
    if (candidate < 70 || candidate > 1200) continue;
    const dist = Math.abs(Math.log2(candidate / referenceHz));
    if (dist < bestDist) {
      best = candidate;
      bestDist = dist;
    }
  }
  return best;
}

export function analyzeFrequency(frequency: number): DetectedPitch | null {
  if (!Number.isFinite(frequency) || frequency <= 0) return null;
  const midiExact = midiFromFrequency(frequency);
  const midi = Math.round(midiExact);
  const cents = Math.round((midiExact - midi) * 100);
  const noteIndex = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return {
    frequency,
    note: `${NOTE_NAMES[noteIndex]}${octave}`,
    noteIndex,
    octave,
    midi,
    cents,
  };
}

export function centsBetween(frequency: number, targetMidi: number): number {
  return (midiFromFrequency(frequency) - targetMidi) * 100;
}

export const PRACTICE_NOTES = ["C4", "D4", "E4", "F4", "G4", "A4", "B4"] as const;

export function midiFromNoteLabel(label: string): number {
  const match = label.match(/^([A-G]#?)(-?\d+)$/);
  if (!match) return 69;
  const name = match[1] as (typeof NOTE_NAMES)[number];
  const octave = Number(match[2]);
  const noteIndex = NOTE_NAMES.indexOf(name);
  return (octave + 1) * 12 + noteIndex;
}

export function pickPracticeNote(exclude?: string): string {
  const pool = PRACTICE_NOTES.filter((n) => n !== exclude);
  return pool[Math.floor(Math.random() * pool.length)] ?? "G4";
}

export function catBadgeForScore(score: number): {
  title: string;
  emoji: string;
  tone: string;
} {
  if (score >= 90) {
    return {
      title: "Кот-звезда",
      emoji: "🌟",
      tone: "text-amber-300 ring-amber-400/40 bg-amber-500/10",
    };
  }
  if (score >= 75) {
    return {
      title: "Джазовый кот",
      emoji: "🎷",
      tone: "text-violet-300 ring-violet-400/40 bg-violet-500/10",
    };
  }
  if (score >= 55) {
    return {
      title: "Певчий котик",
      emoji: "🎵",
      tone: "text-sky-300 ring-sky-400/40 bg-sky-500/10",
    };
  }
  return {
    title: "Мурчащий котик",
    emoji: "😺",
    tone: "text-studio-muted ring-studio-border bg-studio-card",
  };
}
