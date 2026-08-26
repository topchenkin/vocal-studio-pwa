import type { ChordInstrument } from "@/lib/chord-loop";

export const SAMPLED_INSTRUMENTS = ["piano", "guitar", "rock-guitar"] as const;

export type SampledInstrument = (typeof SAMPLED_INSTRUMENTS)[number];

const NOTE_NAMES = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "Gb",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
] as const;

const SAMPLE_MIDIS: number[] = [];
for (let midi = 36; midi <= 76; midi += 2) SAMPLE_MIDIS.push(midi);

type SamplePad = { midi: number; buffer: AudioBuffer };

const banks = new Map<SampledInstrument, SamplePad[]>();
const loading = new Map<SampledInstrument, Promise<void>>();

export function isSampledInstrument(
  instrument: ChordInstrument
): instrument is SampledInstrument {
  return (SAMPLED_INSTRUMENTS as readonly string[]).includes(instrument);
}

function midiToSampleName(midi: number): string {
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

function sampleUrl(instrument: SampledInstrument, midi: number): string {
  return `/samples/${instrument}/${midiToSampleName(midi)}.mp3`;
}

async function decodeSample(
  ctx: AudioContext,
  url: string
): Promise<AudioBuffer | null> {
  const response = await fetch(url);
  if (!response.ok) return null;
  const bytes = await response.arrayBuffer();
  try {
    return await ctx.decodeAudioData(bytes.slice(0));
  } catch {
    return null;
  }
}

export async function ensureChordSamples(
  ctx: AudioContext,
  instrument: ChordInstrument
): Promise<void> {
  if (!isSampledInstrument(instrument)) return;
  if (banks.has(instrument)) return;
  const pending = loading.get(instrument);
  if (pending) {
    await pending;
    return;
  }
  const task = (async () => {
    const pads = (
      await Promise.all(
        SAMPLE_MIDIS.map(async (midi) => {
          const buffer = await decodeSample(ctx, sampleUrl(instrument, midi));
          return buffer ? { midi, buffer } : null;
        })
      )
    ).filter((item): item is SamplePad => Boolean(item));
    if (pads.length < 8) {
      throw new Error("Не удалось загрузить сэмплы инструмента");
    }
    pads.sort((a, b) => a.midi - b.midi);
    banks.set(instrument, pads);
  })();
  loading.set(instrument, task);
  try {
    await task;
  } finally {
    loading.delete(instrument);
  }
}

function nearestPad(instrument: SampledInstrument, midi: number): SamplePad | null {
  const pads = banks.get(instrument);
  if (!pads?.length) return null;
  let best = pads[0];
  let distance = Math.abs(best.midi - midi);
  for (const pad of pads) {
    const next = Math.abs(pad.midi - midi);
    if (next < distance) {
      best = pad;
      distance = next;
    }
  }
  return best;
}

const PEAK: Record<SampledInstrument, number> = {
  piano: 0.22,
  guitar: 0.2,
  "rock-guitar": 0.18,
};

const RELEASE: Record<SampledInstrument, number> = {
  piano: 0.5,
  guitar: 0.32,
  "rock-guitar": 0.2,
};

export function playSampledNote(
  ctx: AudioContext,
  dest: AudioNode,
  instrument: SampledInstrument,
  midi: number,
  when: number,
  dur: number,
  pan: number
): AudioScheduledSourceNode[] {
  const pitchMidi = instrument === "guitar" || instrument === "rock-guitar" ? midi - 12 : midi;
  const pad = nearestPad(instrument, pitchMidi);
  if (!pad) return [];
  const source = ctx.createBufferSource();
  source.buffer = pad.buffer;
  source.playbackRate.value = Math.pow(2, (pitchMidi - pad.midi) / 12);
  const gain = ctx.createGain();
  const panner = ctx.createStereoPanner();
  panner.pan.value = pan;
  const peak = PEAK[instrument];
  const release = RELEASE[instrument];
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(peak, when + 0.01);
  const releaseAt = when + Math.max(0.08, dur);
  gain.gain.setValueAtTime(peak, releaseAt);
  gain.gain.exponentialRampToValueAtTime(0.0001, releaseAt + release);
  source.connect(gain);
  gain.connect(panner);
  panner.connect(dest);
  source.start(when);
  source.stop(releaseAt + release + 0.05);
  return [source];
}
