export type VocalFxPreset = "original" | "hall" | "radio" | "double" | "vocoder";

export const VOCAL_FX_PRESETS: Array<{
  id: VocalFxPreset;
  label: string;
  hint: string;
}> = [
  { id: "original", label: "Оригинал", hint: "Чистый голос без обработки" },
  { id: "hall", label: "Концертный зал", hint: "Глубокий реверб и блеск верха" },
  { id: "radio", label: "Винтажное радио", hint: "Телефонный диапазон и сатурация" },
  { id: "double", label: "Дабл-трек", hint: "Левый сухой, правый с задержкой" },
  { id: "vocoder", label: "Космический вокодер", hint: "Кольцевая модуляция 60–120 Гц" },
];

export function clampWet(value: number): number {
  if (!Number.isFinite(value)) return 0.7;
  return Math.max(0, Math.min(1, value));
}

export function makeReverbImpulse(
  ctx: BaseAudioContext,
  seconds = 3.5
): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      const decay = Math.pow(1 - i / length, 2.8);
      data[i] = (Math.random() * 2 - 1) * decay;
    }
  }
  return impulse;
}

export function makeSoftClipCurve(samples = 1024): Float32Array {
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i += 1) {
    const x = (i / (samples - 1)) * 2 - 1;
    curve[i] = Math.tanh(2.4 * x);
  }
  return curve;
}

type StopHandle = { stop: () => void };

function connectHall(ctx: BaseAudioContext, input: AudioNode, output: AudioNode): StopHandle {
  const convolver = ctx.createConvolver();
  convolver.buffer = makeReverbImpulse(ctx, 3.5);
  const shelf = ctx.createBiquadFilter();
  shelf.type = "highshelf";
  shelf.frequency.value = 4000;
  shelf.gain.value = 3;
  const makeup = ctx.createGain();
  makeup.gain.value = 0.9;
  input.connect(convolver);
  convolver.connect(shelf);
  shelf.connect(makeup);
  makeup.connect(output);
  return {
    stop: () => {
      input.disconnect(convolver);
      convolver.disconnect();
      shelf.disconnect();
      makeup.disconnect();
    },
  };
}

function connectRadio(ctx: BaseAudioContext, input: AudioNode, output: AudioNode): StopHandle {
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 1200;
  band.Q.value = 3;
  const shaper = ctx.createWaveShaper();
  (shaper as unknown as { curve: Float32Array }).curve = makeSoftClipCurve();
  shaper.oversample = "2x";
  const makeup = ctx.createGain();
  makeup.gain.value = 1.35;
  input.connect(band);
  band.connect(shaper);
  shaper.connect(makeup);
  makeup.connect(output);
  return {
    stop: () => {
      input.disconnect(band);
      band.disconnect();
      shaper.disconnect();
      makeup.disconnect();
    },
  };
}

function connectVocoder(ctx: BaseAudioContext, input: AudioNode, output: AudioNode): StopHandle {
  const depth = ctx.createGain();
  depth.gain.value = 0;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = 80;
  const oscGain = ctx.createGain();
  oscGain.gain.value = 1;
  osc.connect(oscGain);
  oscGain.connect(depth.gain);
  input.connect(depth);
  depth.connect(output);
  osc.start();
  return {
    stop: () => {
      try {
        osc.stop();
      } catch {
        /* already stopped */
      }
      osc.disconnect();
      oscGain.disconnect();
      input.disconnect(depth);
      depth.disconnect();
    },
  };
}

export function connectVocalFx(
  ctx: BaseAudioContext,
  input: AudioNode,
  output: AudioNode,
  preset: VocalFxPreset,
  wet: number
): StopHandle {
  const mixWet = ctx.createGain();
  const mixDry = ctx.createGain();
  const amount = preset === "original" ? 0 : clampWet(wet);
  mixWet.gain.value = amount;
  mixDry.gain.value = 1 - amount;
  input.connect(mixDry);
  mixDry.connect(output);

  let fx: StopHandle | null = null;
  if (preset !== "original") {
    const fxIn = ctx.createGain();
    fxIn.gain.value = 1;
    input.connect(fxIn);
    if (preset === "hall") fx = connectHall(ctx, fxIn, mixWet);
    if (preset === "radio") fx = connectRadio(ctx, fxIn, mixWet);
    if (preset === "vocoder") fx = connectVocoder(ctx, fxIn, mixWet);
    if (preset === "double") {
      const delay = ctx.createDelay(0.2);
      delay.delayTime.value = 0.025;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.35;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.004;
      lfo.connect(lfoGain);
      lfoGain.connect(delay.delayTime);
      const panDry = ctx.createStereoPanner();
      panDry.pan.value = -0.7;
      const panWet = ctx.createStereoPanner();
      panWet.pan.value = 0.75;
      fxIn.connect(panDry);
      panDry.connect(mixWet);
      fxIn.connect(delay);
      delay.connect(panWet);
      panWet.connect(mixWet);
      lfo.start();
      fx = {
        stop: () => {
          try {
            lfo.stop();
          } catch {
            /* already stopped */
          }
          lfo.disconnect();
          lfoGain.disconnect();
          delay.disconnect();
          panDry.disconnect();
          panWet.disconnect();
          fxIn.disconnect();
        },
      };
    }
    mixWet.connect(output);
    const inner = fx;
    return {
      stop: () => {
        inner?.stop();
        fxIn.disconnect();
        mixWet.disconnect();
        mixDry.disconnect();
        try {
          input.disconnect(mixDry);
        } catch {
          /* already disconnected */
        }
        try {
          input.disconnect(fxIn);
        } catch {
          /* already disconnected */
        }
      },
    };
  }

  return {
    stop: () => {
      mixDry.disconnect();
      mixWet.disconnect();
      try {
        input.disconnect(mixDry);
      } catch {
        /* already disconnected */
      }
    },
  };
}

export function copyBufferToContext(
  ctx: BaseAudioContext,
  buffer: AudioBuffer
): AudioBuffer {
  const copy = ctx.createBuffer(
    buffer.numberOfChannels,
    buffer.length,
    buffer.sampleRate
  );
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    copy.getChannelData(channel).set(buffer.getChannelData(channel));
  }
  return copy;
}

function getOfflineCtor(): typeof OfflineAudioContext {
  const ctor =
    typeof OfflineAudioContext !== "undefined"
      ? OfflineAudioContext
      : (
          window as unknown as {
            webkitOfflineAudioContext: typeof OfflineAudioContext;
          }
        ).webkitOfflineAudioContext;
  if (!ctor) throw new Error("OfflineAudioContext недоступен");
  return ctor;
}

export async function renderVocalFxWav(
  buffer: AudioBuffer,
  preset: VocalFxPreset,
  wet: number
): Promise<AudioBuffer> {
  const Offline = getOfflineCtor();
  const channels = 2;
  const ctx = new Offline(channels, buffer.length, buffer.sampleRate);
  const local = copyBufferToContext(ctx, buffer);
  const input = ctx.createGain();
  const output = ctx.createGain();
  output.connect(ctx.destination);

  const sources: AudioBufferSourceNode[] = [];
  const startSource = (detune = 0, delaySec = 0, pan = 0) => {
    const source = ctx.createBufferSource();
    source.buffer = local;
    source.detune.value = detune;
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    source.connect(panner);
    panner.connect(input);
    source.start(delaySec);
    sources.push(source);
  };

  if (preset === "double") {
    startSource(0, 0, -0.7);
    startSource(12, 0.025, 0.75);
  } else {
    startSource();
  }

  const fxPreset = preset === "double" ? "original" : preset;
  const handle = connectVocalFx(ctx, input, output, fxPreset, wet);
  const rendered = await ctx.startRendering();
  handle.stop();
  return rendered;
}
