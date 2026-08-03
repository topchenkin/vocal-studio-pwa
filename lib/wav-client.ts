/** Browser-safe WAV encode/mix helpers. */

export function encodeWavBlob(
  channels: Float32Array[],
  sampleRate: number
): Blob {
  const numChannels = channels.length;
  const length = channels[0]?.length ?? 0;
  const blockAlign = numChannels * 2;
  const buffer = new ArrayBuffer(44 + length * blockAlign);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + length * blockAlign, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, length * blockAlign, true);

  let offset = 44;
  for (let i = 0; i < length; i += 1) {
    for (let ch = 0; ch < numChannels; ch += 1) {
      const sample = Math.max(-1, Math.min(1, channels[ch]?.[i] ?? 0));
      view.setInt16(
        offset,
        sample < 0 ? sample * 0x8000 : sample * 0x7fff,
        true
      );
      offset += 2;
    }
  }

  return new Blob([buffer], { type: "audio/wav" });
}

export async function decodeBlobToAudioBuffer(blob: Blob): Promise<AudioBuffer> {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const arrayBuf = await blob.arrayBuffer();
    return await ctx.decodeAudioData(arrayBuf.slice(0));
  } finally {
    await ctx.close();
  }
}

export async function mixAudioBuffers(
  buffers: AudioBuffer[]
): Promise<Blob> {
  if (buffers.length === 0) throw new Error("Нет дорожек для сведения");
  const sampleRate = buffers[0]!.sampleRate;
  const length = Math.max(...buffers.map((b) => b.length));
  const left = new Float32Array(length);
  const right = new Float32Array(length);

  for (const buffer of buffers) {
    const l = buffer.getChannelData(0);
    const r =
      buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : buffer.getChannelData(0);
    for (let i = 0; i < buffer.length; i += 1) {
      left[i] = (left[i] ?? 0) + (l[i] ?? 0);
      right[i] = (right[i] ?? 0) + (r[i] ?? 0);
    }
  }

  let peak = 0;
  for (let i = 0; i < length; i += 1) {
    peak = Math.max(peak, Math.abs(left[i] ?? 0), Math.abs(right[i] ?? 0));
  }
  if (peak > 1) {
    const gain = 0.95 / peak;
    for (let i = 0; i < length; i += 1) {
      left[i] = (left[i] ?? 0) * gain;
      right[i] = (right[i] ?? 0) * gain;
    }
  }

  return encodeWavBlob([left, right], sampleRate);
}

/** Downsample / mix to mono 16 kHz WAV for ML APIs. */
export function audioBufferToMonoWav16k(buffer: AudioBuffer): Blob {
  const targetRate = 16000;
  const source = buffer.getChannelData(0);
  const srcRate = buffer.sampleRate;
  const duration = buffer.duration;
  const length = Math.max(1, Math.floor(duration * targetRate));
  const mono = new Float32Array(length);
  const ratio = srcRate / targetRate;

  for (let i = 0; i < length; i += 1) {
    const srcIndex = i * ratio;
    const i0 = Math.floor(srcIndex);
    const i1 = Math.min(source.length - 1, i0 + 1);
    const t = srcIndex - i0;
    const s0 = source[i0] ?? 0;
    const s1 = source[i1] ?? 0;
    let sample = s0 * (1 - t) + s1 * t;
    // Mix extra channels
    if (buffer.numberOfChannels > 1) {
      const ch1 = buffer.getChannelData(1);
      const c0 = ch1[i0] ?? 0;
      const c1 = ch1[i1] ?? 0;
      sample = (sample + c0 * (1 - t) + c1 * t) * 0.5;
    }
    mono[i] = sample;
  }

  return encodeWavBlob([mono], targetRate);
}

