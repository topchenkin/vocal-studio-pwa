import { midiToHz, type ChordInstrument } from "@/lib/chord-loop";

export type ScheduledVoice = AudioScheduledSourceNode;

function setCurve(shaper: WaveShaperNode, amount: number): void {
  const samples = 1024;
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i += 1) {
    const x = (i / (samples - 1)) * 2 - 1;
    curve[i] = Math.tanh(amount * x);
  }
  (shaper as unknown as { curve: Float32Array }).curve = curve;
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

function playPiano(
  ctx: AudioContext,
  dest: AudioNode,
  hz: number,
  when: number,
  dur: number,
  pan: number,
  noise: AudioBuffer
): ScheduledVoice[] {
  const out = panTo(ctx, dest, pan);
  const gain = envGain(ctx, 0.16, when, 0.004, 0.35, 0.22, dur, 0.7);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.Q.value = 0.7;
  lp.frequency.setValueAtTime(4200, when);
  lp.frequency.exponentialRampToValueAtTime(900, when + Math.min(1.4, dur + 0.4));
  gain.connect(lp);
  lp.connect(out);
  const hammer = ctx.createGain();
  hammer.gain.value = 0.08;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 1800;
  hammer.connect(hp);
  hp.connect(gain);
  const stopAt = when + dur + 0.85;
  return [
    noiseBurst(ctx, noise, when, 0.012, hammer),
    startOsc(ctx, "sine", hz, when, stopAt, gain),
    startOsc(ctx, "triangle", hz, when, stopAt, gain, 4),
    startOsc(ctx, "sine", hz * 2, when, stopAt, gain),
    startOsc(ctx, "sine", hz * 3.01, when, stopAt, gain),
  ];
}

function playKarplus(
  ctx: AudioContext,
  dest: AudioNode,
  hz: number,
  when: number,
  dur: number,
  pan: number,
  noise: AudioBuffer,
  bright: number,
  feedback: number
): ScheduledVoice[] {
  const period = Math.max(0.0008, 1 / hz);
  const delay = ctx.createDelay(1);
  delay.delayTime.value = period;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = bright;
  const fb = ctx.createGain();
  fb.gain.value = feedback;
  const out = panTo(ctx, dest, pan);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.28, when);
  amp.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.35);
  delay.connect(filter);
  filter.connect(fb);
  fb.connect(delay);
  filter.connect(amp);
  amp.connect(out);
  return [noiseBurst(ctx, noise, when, period * 1.15, delay)];
}

function playGuitar(
  ctx: AudioContext,
  dest: AudioNode,
  hz: number,
  when: number,
  dur: number,
  pan: number,
  noise: AudioBuffer
): ScheduledVoice[] {
  return playKarplus(ctx, dest, hz, when, dur, pan, noise, 3200, 0.965);
}

function playRockGuitar(
  ctx: AudioContext,
  dest: AudioNode,
  hz: number,
  when: number,
  dur: number,
  pan: number
): ScheduledVoice[] {
  const out = panTo(ctx, dest, pan);
  const gain = envGain(ctx, 0.11, when, 0.008, 0.18, 0.45, dur, 0.28);
  const shaper = ctx.createWaveShaper();
  setCurve(shaper, 7.5);
  shaper.oversample = "4x";
  const cab = ctx.createBiquadFilter();
  cab.type = "peaking";
  cab.frequency.value = 1100;
  cab.Q.value = 0.8;
  cab.gain.value = 7;
  const cut = ctx.createBiquadFilter();
  cut.type = "highshelf";
  cut.frequency.value = 5500;
  cut.gain.value = -6;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 90;
  gain.connect(shaper);
  shaper.connect(hp);
  hp.connect(cab);
  cab.connect(cut);
  cut.connect(out);
  const stopAt = when + dur + 0.4;
  return [
    startOsc(ctx, "sawtooth", hz, when, stopAt, gain),
    startOsc(ctx, "square", hz, when, stopAt, gain, -11),
    startOsc(ctx, "sawtooth", hz * 2, when, stopAt, gain, 6),
  ];
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

function playStrings(
  ctx: AudioContext,
  dest: AudioNode,
  hz: number,
  when: number,
  dur: number,
  pan: number
): ScheduledVoice[] {
  const out = panTo(ctx, dest, pan);
  const gain = envGain(ctx, 0.07, when, 0.22, 0.35, 0.8, dur, 1.1);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 1600;
  gain.connect(lp);
  lp.connect(out);
  const stopAt = when + dur + 1.2;
  return [
    startOsc(ctx, "sawtooth", hz, when, stopAt, gain, -14),
    startOsc(ctx, "sawtooth", hz, when, stopAt, gain, 12),
    startOsc(ctx, "sine", hz, when, stopAt, gain),
  ];
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
  piano: { dry: 0.72, wet: 0.28 },
  guitar: { dry: 0.88, wet: 0.1 },
  "rock-guitar": { dry: 0.92, wet: 0.07 },
  bass: { dry: 0.94, wet: 0.06 },
  organ: { dry: 0.62, wet: 0.34 },
  strings: { dry: 0.48, wet: 0.52 },
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
  if (instrument === "bass") {
    return playBass(ctx, dest, midiToHz(midi - 12), when, dur, pan, noise);
  }
  if (instrument === "guitar") {
    return playGuitar(ctx, dest, midiToHz(midi), when, dur, pan, noise);
  }
  if (instrument === "rock-guitar") {
    return playRockGuitar(ctx, dest, midiToHz(midi), when, dur, pan);
  }
  if (instrument === "organ") {
    return playOrgan(ctx, dest, midiToHz(midi), when, dur, pan);
  }
  if (instrument === "strings") {
    return playStrings(ctx, dest, midiToHz(midi), when, dur, pan);
  }
  if (instrument === "synth") {
    return playSynth(ctx, dest, midiToHz(midi), when, dur, pan);
  }
  return playPiano(ctx, dest, midiToHz(midi), when, dur, pan, noise);
}
