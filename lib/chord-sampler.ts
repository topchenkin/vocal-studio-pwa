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

const SAMPLE_MIDIS: Record<SampledInstrument, number[]> = {
  piano: evenMidis(36, 76),
  guitar: evenMidis(40, 72),
  "rock-guitar": evenMidis(36, 76),
};

function evenMidis(from: number, to: number): number[] {
  const midis: number[] = [];
  for (let midi = from; midi <= to; midi += 2) midis.push(midi);
  return midis;
}

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
        SAMPLE_MIDIS[instrument].map(async (midi) => {
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
  guitar: 0.15,
  "rock-guitar": 0.11,
};

function startAtOrSkip(ctx: AudioContext, when: number): number | null {
  if (when < ctx.currentTime - 0.04) return null;
  return Math.max(when, ctx.currentTime + 0.003);
}

function playPad(
  ctx: AudioContext,
  dest: AudioNode,
  pad: SamplePad,
  midi: number,
  when: number,
  pan: number,
  peak: number,
  attack: number,
  hold: number,
  release: number
): AudioBufferSourceNode {
  const source = ctx.createBufferSource();
  source.buffer = pad.buffer;
  source.playbackRate.value = Math.pow(2, (midi - pad.midi) / 12);
  const gain = ctx.createGain();
  const panner = ctx.createStereoPanner();
  panner.pan.value = pan;
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(peak, when + attack);
  const releaseAt = when + attack + Math.max(0.05, hold);
  gain.gain.setValueAtTime(peak, releaseAt);
  gain.gain.exponentialRampToValueAtTime(0.0001, releaseAt + release);
  source.connect(gain);
  gain.connect(panner);
  panner.connect(dest);
  source.start(when);
  source.stop(releaseAt + release + 0.05);
  return source;
}

export function playSampledNote(
  ctx: AudioContext,
  dest: AudioNode,
  instrument: SampledInstrument,
  midi: number,
  when: number,
  dur: number,
  pan: number
): AudioScheduledSourceNode[] {
  const startAt = startAtOrSkip(ctx, when);
  if (startAt === null) return [];
  const pad = nearestPad(instrument, midi);
  if (!pad) return [];

  if (instrument === "piano") {
    return [
      playPad(
        ctx,
        dest,
        pad,
        midi,
        startAt,
        pan,
        PEAK.piano,
        0.01,
        Math.max(0.08, dur),
        0.5
      ),
    ];
  }

  const rate = Math.pow(2, (midi - pad.midi) / 12);
  const source = ctx.createBufferSource();
  source.buffer = pad.buffer;
  source.playbackRate.value = rate;

  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.Q.value = 0.7;
  const body = ctx.createBiquadFilter();
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.Q.value = 0.8;

  if (instrument === "guitar") {
    hp.frequency.value = 78;
    body.type = "lowshelf";
    body.frequency.value = 210;
    body.gain.value = 3.2;
    lp.frequency.value = Math.min(6200, 13000 / Math.max(1, rate));
  } else {
    hp.frequency.value = 95;
    body.type = "peaking";
    body.frequency.value = 2700;
    body.Q.value = 0.85;
    body.gain.value = -5.5;
    lp.frequency.value = Math.min(5000, 11000 / Math.max(1, rate));
  }

  const gain = ctx.createGain();
  const panner = ctx.createStereoPanner();
  panner.pan.value = pan;
  const peak = PEAK[instrument];
  const attack = instrument === "guitar" ? 0.008 : 0.012;
  const hold = Math.max(0.1, dur * 0.78);
  const release =
    instrument === "guitar"
      ? Math.min(0.5, Math.max(0.16, dur * 0.32))
      : 0.2;
  const releaseAt = startAt + attack + hold;
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peak, startAt + attack);
  gain.gain.exponentialRampToValueAtTime(
    peak * 0.58,
    startAt + attack + Math.min(0.16, hold * 0.35)
  );
  gain.gain.setValueAtTime(peak * 0.5, releaseAt);
  gain.gain.exponentialRampToValueAtTime(0.0001, releaseAt + release);

  source.connect(hp);
  hp.connect(body);
  body.connect(lp);
  lp.connect(gain);
  gain.connect(panner);
  panner.connect(dest);
  source.start(startAt);
  source.stop(releaseAt + release + 0.05);
  return [source];
}
