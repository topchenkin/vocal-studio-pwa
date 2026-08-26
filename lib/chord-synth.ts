import { midiToHz, type ChordInstrument } from "@/lib/chord-loop";
import { isSampledInstrument, playSampledNote } from "@/lib/chord-sampler";

export type ScheduledVoice = AudioScheduledSourceNode;

function panTo(ctx: AudioContext, dest: AudioNode, pan: number): StereoPannerNode {
  const panner = ctx.createStereoPanner();
  panner.pan.value = pan;
  panner.connect(dest);
  return panner;
}

function startOsc(
  ctx: AudioContext,
  type: OscillatorType,
  freq: number,
  when: number,
  stopAt: number,
  dest: AudioNode,
  detune = 0
): OscillatorNode {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  osc.detune.value = detune;
  osc.connect(dest);
  osc.start(when);
  osc.stop(stopAt);
  return osc;
}

function noiseBurst(
  ctx: AudioContext,
  noise: AudioBuffer,
  when: number,
  dur: number,
  dest: AudioNode
): AudioBufferSourceNode {
  const source = ctx.createBufferSource();
  source.buffer = noise;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(1, when);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  source.connect(gain);
  gain.connect(dest);
  source.start(when);
  source.stop(when + dur + 0.02);
  return source;
}

function envGain(
  ctx: AudioContext,
  peak: number,
  when: number,
  attack: number,
  decay: number,
  sustain: number,
  dur: number,
  release: number
): GainNode {
  const gain = ctx.createGain();
  const sustainLevel = Math.max(0.0002, peak * sustain);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + attack);
  gain.gain.exponentialRampToValueAtTime(sustainLevel, when + attack + decay);
  const releaseAt = when + dur;
  gain.gain.setValueAtTime(sustainLevel, releaseAt);
  gain.gain.exponentialRampToValueAtTime(0.0001, releaseAt + release);
  return gain;
}

function playBass(
  ctx: AudioContext,
  dest: AudioNode,
  hz: number,
  when: number,
  dur: number,
  pan: number,
  noise: AudioBuffer
): ScheduledVoice[] {
  const out = panTo(ctx, dest, pan);
  const gain = envGain(ctx, 0.28, when, 0.01, 0.16, 0.55, dur, 0.22);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(900, when);
  lp.frequency.exponentialRampToValueAtTime(280, when + 0.2);
  gain.connect(lp);
  lp.connect(out);
  const click = ctx.createGain();
  click.gain.value = 0.12;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 800;
  click.connect(hp);
  hp.connect(gain);
  const stopAt = when + dur + 0.3;
  return [
    noiseBurst(ctx, noise, when, 0.008, click),
    startOsc(ctx, "sine", hz, when, stopAt, gain),
    startOsc(ctx, "triangle", hz, when, stopAt, gain, -6),
  ];
}

function playOrgan(
  ctx: AudioContext,
  dest: AudioNode,
  hz: number,
  when: number,
  dur: number,
  pan: number
): ScheduledVoice[] {
  const out = panTo(ctx, dest, pan);
  const gain = envGain(ctx, 0.09, when, 0.02, 0.05, 0.88, dur, 0.08);
  gain.connect(out);
  const stopAt = when + dur + 0.12;
  const drawbars: Array<[number, number]> = [
    [0.5, 0.35],
    [1, 1],
    [2, 0.55],
    [3, 0.28],
    [4, 0.18],
    [6, 0.1],
  ];
  return drawbars.map(([ratio, mix]) => {
    const partial = ctx.createGain();
    partial.gain.value = mix;
    partial.connect(gain);
    return startOsc(ctx, "sine", hz * ratio, when, stopAt, partial);
  });
}

function playSynth(
  ctx: AudioContext,
  dest: AudioNode,
  hz: number,
  when: number,
  dur: number,
  pan: number
): ScheduledVoice[] {
  const out = panTo(ctx, dest, pan);
  const gain = envGain(ctx, 0.1, when, 0.03, 0.2, 0.55, dur, 0.45);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.Q.value = 6;
  lp.frequency.setValueAtTime(4800, when);
  lp.frequency.exponentialRampToValueAtTime(620, when + 0.28);
  gain.connect(lp);
  lp.connect(out);
  const stopAt = when + dur + 0.55;
  return [
    startOsc(ctx, "sawtooth", hz, when, stopAt, gain, -8),
    startOsc(ctx, "sawtooth", hz, when, stopAt, gain, 9),
    startOsc(ctx, "square", hz, when, stopAt, gain, 3),
  ];
}

export function playDrumHit(
  ctx: AudioContext,
  dest: AudioNode,
  kind: "kick" | "snare" | "hat",
  when: number,
  noise: AudioBuffer
): ScheduledVoice[] {
  if (kind === "kick") {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(160, when);
    osc.frequency.exponentialRampToValueAtTime(38, when + 0.14);
    gain.gain.setValueAtTime(1, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.28);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(when);
    osc.stop(when + 0.3);
    return [osc];
  }
  const source = ctx.createBufferSource();
  source.buffer = noise;
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  if (kind === "snare") {
    filter.type = "bandpass";
    filter.frequency.value = 1800;
    filter.Q.value = 0.9;
    gain.gain.setValueAtTime(0.45, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.18);
  } else {
    filter.type = "highpass";
    filter.frequency.value = 7500;
    gain.gain.setValueAtTime(0.14, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.04);
  }
  source.connect(filter);
  filter.connect(gain);
  gain.connect(dest);
  source.start(when);
  source.stop(when + 0.22);
  return [source];
}

export const INSTRUMENT_MIX: Record<ChordInstrument, { dry: number; wet: number }> = {
  piano: { dry: 0.86, wet: 0.14 },
  guitar: { dry: 0.98, wet: 0.02 },
  "rock-guitar": { dry: 0.95, wet: 0.05 },
  bass: { dry: 0.94, wet: 0.06 },
  organ: { dry: 0.62, wet: 0.34 },
  synth: { dry: 0.7, wet: 0.26 },
  drums: { dry: 0.96, wet: 0.05 },
};

export function playInstrumentNote(
  ctx: AudioContext,
  dest: AudioNode,
  instrument: Exclude<ChordInstrument, "drums">,
  midi: number,
  when: number,
  dur: number,
  pan: number,
  noise: AudioBuffer
): ScheduledVoice[] {
  if (isSampledInstrument(instrument)) {
    return playSampledNote(ctx, dest, instrument, midi, when, dur, pan);
  }
  if (instrument === "bass") {
    return playBass(ctx, dest, midiToHz(midi - 12), when, dur, pan, noise);
  }
  if (instrument === "organ") {
    return playOrgan(ctx, dest, midiToHz(midi), when, dur, pan);
  }
  return playSynth(ctx, dest, midiToHz(midi), when, dur, pan);
}
