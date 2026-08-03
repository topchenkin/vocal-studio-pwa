/** Server-side WAV helpers for mixing Demucs stems into an instrumental. */

type WavAudio = {
  sampleRate: number;
  channels: Float32Array[];
};

function readString(view: DataView, offset: number, length: number) {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += String.fromCharCode(view.getUint8(offset + i));
  }
  return out;
}

export function decodeWav(buffer: ArrayBuffer): WavAudio {
  const view = new DataView(buffer);
  if (readString(view, 0, 4) !== "RIFF" || readString(view, 8, 4) !== "WAVE") {
    throw new Error("Stem is not a WAV file");
  }

  let offset = 12;
  let sampleRate = 44100;
  let numChannels = 2;
  let bitsPerSample = 16;
  let dataOffset = 0;
  let dataSize = 0;

  while (offset + 8 <= view.byteLength) {
    const chunkId = readString(view, offset, 4);
    const chunkSize = view.getUint32(offset + 4, true);
    offset += 8;
    if (chunkId === "fmt ") {
      numChannels = view.getUint16(offset + 2, true);
      sampleRate = view.getUint32(offset + 4, true);
      bitsPerSample = view.getUint16(offset + 14, true);
    } else if (chunkId === "data") {
      dataOffset = offset;
      dataSize = chunkSize;
      break;
    }
    offset += chunkSize + (chunkSize % 2);
  }

  if (!dataOffset || !dataSize) throw new Error("WAV data chunk missing");

  const bytesPerSample = bitsPerSample / 8;
  const frameCount = Math.floor(dataSize / (bytesPerSample * numChannels));
  const channels = Array.from(
    { length: numChannels },
    () => new Float32Array(frameCount)
  );

  let cursor = dataOffset;
  for (let i = 0; i < frameCount; i += 1) {
    for (let ch = 0; ch < numChannels; ch += 1) {
      let sample = 0;
      if (bitsPerSample === 16) {
        sample = view.getInt16(cursor, true) / 0x8000;
        cursor += 2;
      } else if (bitsPerSample === 32) {
        sample = view.getFloat32(cursor, true);
        cursor += 4;
      } else if (bitsPerSample === 8) {
        sample = (view.getUint8(cursor) - 128) / 128;
        cursor += 1;
      } else {
        throw new Error(`Unsupported WAV bit depth: ${bitsPerSample}`);
      }
      channels[ch]![i] = sample;
    }
  }

  return { sampleRate, channels };
}

export function encodeWav(channels: Float32Array[], sampleRate: number): Buffer {
  const numChannels = channels.length;
  const length = channels[0]?.length ?? 0;
  const blockAlign = numChannels * 2;
  const buffer = Buffer.alloc(44 + length * blockAlign);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + length * blockAlign, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * blockAlign, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(length * blockAlign, 40);

  let offset = 44;
  for (let i = 0; i < length; i += 1) {
    for (let ch = 0; ch < numChannels; ch += 1) {
      const sample = Math.max(-1, Math.min(1, channels[ch]?.[i] ?? 0));
      buffer.writeInt16LE(sample < 0 ? sample * 0x8000 : sample * 0x7fff, offset);
      offset += 2;
    }
  }
  return buffer;
}

/** Sum multiple stems into a stereo instrumental mix. */
export function mixStemsToInstrumental(stems: ArrayBuffer[]): Buffer {
  if (stems.length === 0) throw new Error("No stems to mix");
  const decoded = stems.map(decodeWav);
  const sampleRate = decoded[0]!.sampleRate;
  const length = Math.max(...decoded.map((d) => d.channels[0]?.length ?? 0));
  const left = new Float32Array(length);
  const right = new Float32Array(length);

  for (const stem of decoded) {
    const l = stem.channels[0] ?? new Float32Array(0);
    const r = stem.channels[1] ?? l;
    for (let i = 0; i < length; i += 1) {
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

  return encodeWav([left, right], sampleRate);
}

export function fileDataUrl(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const record = data as { url?: string | null; path?: string | null };
  if (record.url && typeof record.url === "string") return record.url;
  if (record.path && typeof record.path === "string") {
    if (record.path.startsWith("http")) return record.path;
  }
  return null;
}
