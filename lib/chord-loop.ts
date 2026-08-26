export const ROOTS = [
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

export type RootKey = (typeof ROOTS)[number];
export type ScaleMode = "major" | "minor";
export type LoopLength = 2 | 4 | 8;
export type ChordVibe = "sad-pop" | "neo-soul" | "rock-ballad" | "jazz";
export type Groove = "quarters" | "arpeggio";
export type ChordInstrument =
  | "piano"
  | "guitar"
  | "rock-guitar"
  | "bass"
  | "organ"
  | "synth"
  | "drums";

export const VIBES: Array<{ id: ChordVibe; label: string }> = [
  { id: "sad-pop", label: "Грустный поп" },
  { id: "neo-soul", label: "Нео-соул / R&B" },
  { id: "rock-ballad", label: "Рок-баллада" },
  { id: "jazz", label: "Джазовый стандарт" },
];

export const INSTRUMENTS: Array<{ id: ChordInstrument; label: string; hint: string }> = [
  { id: "piano", label: "Фортепиано", hint: "Живой рояль" },
  { id: "guitar", label: "Гитара", hint: "Живая акустическая гитара" },
  { id: "rock-guitar", label: "Рок-гитара", hint: "Перегруженная электрогитара" },
  { id: "bass", label: "Бас", hint: "Низкая линия под вокал" },
  { id: "organ", label: "Орган", hint: "Церковный и соул-орган" },
  { id: "synth", label: "Синтезатор", hint: "Яркий электро-пэд" },
  { id: "drums", label: "Барабаны", hint: "Грув 4/4 плюс аккордовые удары" },
];

export type ChordVoiceSpec = {
  oscA: OscillatorType;
  oscB: OscillatorType;
  detuneB: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  peak: number;
  midiOffset: number;
  distort: boolean;
};

export const INSTRUMENT_VOICES: Record<
  Exclude<ChordInstrument, "drums">,
  ChordVoiceSpec
> = {
  piano: {
    oscA: "triangle",
    oscB: "sine",
    detuneB: -8,
    attack: 0.05,
    decay: 0.3,
    sustain: 0.7,
    release: 1.2,
    peak: 0.12,
    midiOffset: 0,
    distort: false,
  },
  guitar: {
    oscA: "triangle",
    oscB: "sawtooth",
    detuneB: 6,
    attack: 0.008,
    decay: 0.28,
    sustain: 0.18,
    release: 0.45,
    peak: 0.13,
    midiOffset: 12,
    distort: false,
  },
  "rock-guitar": {
    oscA: "sawtooth",
    oscB: "square",
    detuneB: -12,
    attack: 0.01,
    decay: 0.22,
    sustain: 0.35,
    release: 0.35,
    peak: 0.1,
    midiOffset: 0,
    distort: true,
  },
  bass: {
    oscA: "sine",
    oscB: "triangle",
    detuneB: -5,
    attack: 0.02,
    decay: 0.22,
    sustain: 0.55,
    release: 0.4,
    peak: 0.18,
    midiOffset: -12,
    distort: false,
  },
  organ: {
    oscA: "square",
    oscB: "sine",
    detuneB: 7,
    attack: 0.03,
    decay: 0.12,
    sustain: 0.82,
    release: 0.28,
    peak: 0.09,
    midiOffset: 0,
    distort: false,
  },
  synth: {
    oscA: "sawtooth",
    oscB: "triangle",
    detuneB: 14,
    attack: 0.04,
    decay: 0.25,
    sustain: 0.65,
    release: 0.9,
    peak: 0.1,
    midiOffset: 0,
    distort: false,
  },
};

export type ChordLoopSettings = {
  root: RootKey;
  mode: ScaleMode;
  vibe: ChordVibe;
  length: LoopLength;
  groove: Groove;
  bpm: number;
  instrument: ChordInstrument;
};

export function isRootKey(value: string): value is RootKey {
  return (ROOTS as readonly string[]).includes(value);
}

export function isChordInstrument(value: string): value is ChordInstrument {
  return INSTRUMENTS.some((item) => item.id === value);
}

export function isChordVibe(value: string): value is ChordVibe {
  return VIBES.some((item) => item.id === value);
}

export function isLoopLength(value: number): value is LoopLength {
  return value === 2 || value === 4 || value === 8;
}

export function isGroove(value: string): value is Groove {
  return value === "quarters" || value === "arpeggio";
}

const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10];
const NOTE_NAMES = ROOTS;

type Degree = {
  /** 1–7 diatonic degree */
  degree: number;
  quality: "triad" | "7" | "9";
  /** Extra accidental on the chord root in semitones */
  acc?: number;
};

export type ChordCard = {
  symbol: string;
  midi: number[];
};

function wrap12(value: number): number {
  return ((value % 12) + 12) % 12;
}

export function rootIndex(root: RootKey): number {
  return ROOTS.indexOf(root);
}

export function scaleIntervals(mode: ScaleMode): number[] {
  return mode === "major" ? MAJOR_STEPS : MINOR_STEPS;
}

export function scaleNoteNames(root: RootKey, mode: ScaleMode): string[] {
  const tonic = rootIndex(root);
  return scaleIntervals(mode).map((step) => NOTE_NAMES[wrap12(tonic + step)]);
}

function degreeRoot(tonic: number, mode: ScaleMode, degree: Degree): number {
  const steps = scaleIntervals(mode);
  return wrap12(tonic + steps[degree.degree - 1] + (degree.acc ?? 0));
}

function thirdInterval(mode: ScaleMode, degree: number): number {
  const steps = scaleIntervals(mode);
  const root = steps[degree - 1];
  const third = steps[(degree + 1) % 7];
  return wrap12(third - root) === 3 ? 3 : 4;
}

function seventhInterval(mode: ScaleMode, degree: number): number {
  const steps = scaleIntervals(mode);
  const root = steps[degree - 1];
  const seventh = steps[(degree + 5) % 7];
  return wrap12(seventh - root) === 10 ? 10 : 11;
}

function chordIntervals(mode: ScaleMode, degree: Degree): number[] {
  const third = thirdInterval(mode, degree.degree);
  const fifth = 7;
  if (degree.quality === "triad") return [0, third, fifth];
  const seventh = seventhInterval(mode, degree.degree);
  if (degree.quality === "7") return [0, third, fifth, seventh];
  const ninth = 14;
  return [0, third, fifth, seventh, ninth];
}

function symbolFor(rootName: string, mode: ScaleMode, degree: Degree): string {
  const minorish = thirdInterval(mode, degree.degree) === 3;
  if (degree.quality === "triad") return minorish ? `${rootName}m` : rootName;
  if (degree.quality === "7") {
    if (minorish) return `${rootName}m7`;
    return seventhInterval(mode, degree.degree) === 10
      ? `${rootName}7`
      : `${rootName}maj7`;
  }
  if (minorish) return `${rootName}m9`;
  return seventhInterval(mode, degree.degree) === 10
    ? `${rootName}9`
    : `${rootName}maj9`;
}

function voicing(tonic: number, mode: ScaleMode, degree: Degree): ChordCard {
  const rootPc = degreeRoot(tonic, mode, degree);
  const intervals = chordIntervals(mode, degree);
  const rootMidi = 48 + rootPc;
  const midi = intervals.map((interval) => rootMidi + interval);
  const rootName = NOTE_NAMES[rootPc];
  return { symbol: symbolFor(rootName, mode, degree), midi };
}

function degreesFor(vibe: ChordVibe, mode: ScaleMode): Degree[] {
  if (vibe === "sad-pop") {
    return mode === "minor"
      ? [
          { degree: 1, quality: "triad" },
          { degree: 6, quality: "triad" },
          { degree: 3, quality: "triad" },
          { degree: 7, quality: "triad" },
        ]
      : [
          { degree: 6, quality: "triad" },
          { degree: 4, quality: "triad" },
          { degree: 1, quality: "triad" },
          { degree: 5, quality: "triad" },
        ];
  }
  if (vibe === "neo-soul") {
    return [
      { degree: 2, quality: "9" },
      { degree: 5, quality: "9" },
      { degree: 1, quality: "9" },
      { degree: 6, quality: "9" },
    ];
  }
  if (vibe === "rock-ballad") {
    return mode === "major"
      ? [
          { degree: 1, quality: "triad" },
          { degree: 5, quality: "triad" },
          { degree: 6, quality: "triad" },
          { degree: 4, quality: "triad" },
        ]
      : [
          { degree: 1, quality: "triad" },
          { degree: 7, quality: "triad" },
          { degree: 6, quality: "triad" },
          { degree: 5, quality: "triad" },
        ];
  }
  return [
    { degree: 2, quality: "7" },
    { degree: 5, quality: "7" },
    { degree: 1, quality: "7" },
    { degree: 6, quality: "7" },
  ];
}

export function defaultGroove(vibe: ChordVibe): Groove {
  return vibe === "neo-soul" || vibe === "jazz" ? "arpeggio" : "quarters";
}

export function buildProgression(
  root: RootKey,
  mode: ScaleMode,
  vibe: ChordVibe,
  length: LoopLength
): ChordCard[] {
  const tonic = rootIndex(root);
  const base = degreesFor(vibe, mode).map((degree) => voicing(tonic, mode, degree));
  if (length === 2) return base.slice(0, 2);
  if (length === 4) return base;
  return [...base, ...base];
}

export function clampBpm(value: number): number {
  if (!Number.isFinite(value)) return 80;
  return Math.max(50, Math.min(140, Math.round(value)));
}

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function beatsToSeconds(beats: number, bpm: number): number {
  return (beats * 60) / clampBpm(bpm);
}
