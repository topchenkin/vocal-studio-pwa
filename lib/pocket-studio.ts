/** Offline mix + vocal enhancement for Pocket Studio (browser Web Audio). */

import { encodeWavBlob } from "@/lib/wav-client";

export const DEFAULT_VOCAL_GAIN = 1;
export const DEFAULT_BACKING_GAIN = 0.8;
export const HIGH_SHELF_HZ = 3000;
export const HIGH_SHELF_GAIN_DB = 4;
export const COMPRESSOR_THRESHOLD_DB = -24;
export const COMPRESSOR_RATIO = 4;
export const COMPRESSOR_ATTACK_SEC = 0.003;
export const COMPRESSOR_RELEASE_SEC = 0.25;
export const REVERB_DURATION_SEC = 2;
export const REVERB_DECAY = 2;
export const REVERB_WET = 0.22;
export const REVERB_DRY = 0.82;
export const COMPRESSOR_MAKEUP = 1.6;

type ImpulseContext = Pick<BaseAudioContext, "sampleRate" | "createBuffer">;

function offlineContext(
  channels: number,
  length: number,
  sampleRate: number
): OfflineAudioContext {
  const Ctor =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;
  return new Ctor(channels, length, sampleRate);
}

/** White noise with exponential decay — no external IR wav needed. */
export function generateImpulseResponse(
  ctx: ImpulseContext,
  duration = REVERB_DURATION_SEC,
  decay = REVERB_DECAY
): AudioBuffer {
  const seconds = Math.max(0.05, duration);
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      const envelope = Math.pow(1 - i / length, decay);
      data[i] = (Math.random() * 2 - 1) * envelope;
    }
  }
  return impulse;
}

function copyResampled(ctx: BaseAudioContext, source: AudioBuffer): AudioBuffer {
  const ratio = source.sampleRate / ctx.sampleRate;
  const length = Math.max(1, Math.round(source.length / ratio));
  const channels = Math.max(1, source.numberOfChannels);
  const out = ctx.createBuffer(channels, length, ctx.sampleRate);
  for (let ch = 0; ch < channels; ch += 1) {
    const input = source.getChannelData(Math.min(ch, source.numberOfChannels - 1));
    const output = out.getChannelData(ch);
    if (source.sampleRate === ctx.sampleRate) {
      output.set(input.subarray(0, Math.min(input.length, output.length)));
      continue;
    }
    for (let i = 0; i < output.length; i += 1) {
      const pos = i * ratio;
      const i0 = Math.floor(pos);
      const i1 = Math.min(input.length - 1, i0 + 1);
      const frac = pos - i0;
      output[i] = (input[i0] ?? 0) * (1 - frac) + (input[i1] ?? 0) * frac;
    }
  }
  return out;
}

function connectVocalChain(
  ctx: OfflineAudioContext,
  source: AudioBufferSourceNode,
  applyEffects: boolean,
  vocalGainValue: number
): GainNode {
  const vocalGain = ctx.createGain();
  vocalGain.gain.value = vocalGainValue;
  vocalGain.connect(ctx.destination);

  if (!applyEffects) {
    source.connect(vocalGain);
    return vocalGain;
  }

  const highShelf = ctx.createBiquadFilter();
  highShelf.type = "highshelf";
  highShelf.frequency.value = HIGH_SHELF_HZ;
  highShelf.gain.value = HIGH_SHELF_GAIN_DB;

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = COMPRESSOR_THRESHOLD_DB;
  compressor.ratio.value = COMPRESSOR_RATIO;
  compressor.attack.value = COMPRESSOR_ATTACK_SEC;
  compressor.release.value = COMPRESSOR_RELEASE_SEC;
  compressor.knee.value = 8;

  const makeup = ctx.createGain();
  makeup.gain.value = COMPRESSOR_MAKEUP;

  const dry = ctx.createGain();
  dry.gain.value = REVERB_DRY;
  const wet = ctx.createGain();
  wet.gain.value = REVERB_WET;

  const convolver = ctx.createConvolver();
  convolver.normalize = true;
  convolver.buffer = generateImpulseResponse(ctx);

  source.connect(highShelf);
  highShelf.connect(compressor);
  compressor.connect(makeup);
  makeup.connect(dry);
  dry.connect(vocalGain);
  makeup.connect(convolver);
  convolver.connect(wet);
  wet.connect(vocalGain);
  return vocalGain;
}

export async function mixAndEnhanceAudio(
  backingBuffer: AudioBuffer,
  vocalBuffer: AudioBuffer,
  applyEffects: boolean,
  options?: { vocalGain?: number; backingGain?: number }
): Promise<Blob> {
  const vocalGainValue =
    typeof options?.vocalGain === "number" && Number.isFinite(options.vocalGain)
      ? Math.max(0, Math.min(2, options.vocalGain))
      : DEFAULT_VOCAL_GAIN;
  const backingGainValue =
    typeof options?.backingGain === "number" && Number.isFinite(options.backingGain)
      ? Math.max(0, Math.min(2, options.backingGain))
      : DEFAULT_BACKING_GAIN;

  const sampleRate = backingBuffer.sampleRate || vocalBuffer.sampleRate || 48000;
  const duration = Math.max(backingBuffer.duration, vocalBuffer.duration);
  const tail = applyEffects ? 0.8 : 0;
  const length = Math.max(1, Math.ceil((duration + tail) * sampleRate));
  const ctx = offlineContext(2, length, sampleRate);

  const backing = copyResampled(ctx, backingBuffer);
  const vocal = copyResampled(ctx, vocalBuffer);

  const backingSource = ctx.createBufferSource();
  backingSource.buffer = backing;
  const backingGain = ctx.createGain();
  backingGain.gain.value = backingGainValue;
  backingSource.connect(backingGain);
  backingGain.connect(ctx.destination);

  const vocalSource = ctx.createBufferSource();
  vocalSource.buffer = vocal;
  connectVocalChain(ctx, vocalSource, applyEffects, vocalGainValue);

  backingSource.start(0);
  vocalSource.start(0);

  const rendered = await ctx.startRendering();
  const left = new Float32Array(rendered.getChannelData(0));
  const right = new Float32Array(
    rendered.numberOfChannels > 1
      ? rendered.getChannelData(1)
      : rendered.getChannelData(0)
  );

  let peak = 0;
  for (let i = 0; i < left.length; i += 1) {
    peak = Math.max(peak, Math.abs(left[i] ?? 0), Math.abs(right[i] ?? 0));
  }
  if (peak > 0.99) {
    const scale = 0.95 / peak;
    for (let i = 0; i < left.length; i += 1) {
      left[i] = (left[i] ?? 0) * scale;
      right[i] = (right[i] ?? 0) * scale;
    }
  }

  return encodeWavBlob([left, right], sampleRate);
}

export function pickRecorderMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
    return "audio/webm;codecs=opus";
  }
  if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/mp4")) return "audio/mp4";
  return "";
}
