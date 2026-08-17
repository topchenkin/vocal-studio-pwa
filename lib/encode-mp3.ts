import { Mp3Encoder } from "@breezystack/lamejs";

const TARGET_RATE = 22050;
const BITRATE_KBPS = 96;
const MP3_BLOCK = 1152;

function OfflineCtx(
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

function floatToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, input[i] ?? 0));
    out[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return out;
}

async function toMono22050(buffer: AudioBuffer): Promise<AudioBuffer> {
  const length = Math.max(1, Math.ceil(buffer.duration * TARGET_RATE));
  const ctx = OfflineCtx(1, length, TARGET_RATE);
  const source = ctx.createBufferSource();

  if (buffer.numberOfChannels === 1 && buffer.sampleRate === TARGET_RATE) {
    return buffer;
  }

  if (buffer.numberOfChannels === 1) {
    source.buffer = buffer;
  } else {
    const mono = ctx.createBuffer(1, buffer.length, buffer.sampleRate);
    const mixed = mono.getChannelData(0);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    for (let i = 0; i < buffer.length; i += 1) {
      mixed[i] = ((left[i] ?? 0) + (right[i] ?? 0)) / 2;
    }
    source.buffer = mono;
  }

  source.connect(ctx.destination);
  source.start(0);
  return ctx.startRendering();
}

export async function encodeMp3Blob(buffer: AudioBuffer): Promise<Blob> {
  const mono = await toMono22050(buffer);
  const samples = floatToInt16(mono.getChannelData(0));
  const encoder = new Mp3Encoder(1, TARGET_RATE, BITRATE_KBPS);
  const parts: Uint8Array[] = [];

  for (let i = 0; i < samples.length; i += MP3_BLOCK) {
    const chunk = samples.subarray(i, i + MP3_BLOCK);
    const encoded = encoder.encodeBuffer(chunk);
    if (encoded.length > 0) parts.push(encoded);
  }

  const flushed = encoder.flush();
  if (flushed.length > 0) parts.push(flushed);

  if (parts.length === 0) {
    throw new Error("Не удалось сжать аудио");
  }

  let total = 0;
  for (const part of parts) total += part.length;
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }

  return new Blob([bytes], { type: "audio/mpeg" });
}
