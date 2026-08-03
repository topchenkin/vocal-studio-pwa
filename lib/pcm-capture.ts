/**
 * Capture mic audio as raw PCM via AudioContext (no MediaRecorder / webm).
 * Eliminates chunk-pollution and decode-cache bugs between consecutive takes.
 */

export type PcmCaptureSession = {
  stop: () => Promise<AudioBuffer>;
  abort: () => void;
};

export async function startPcmCapture(
  stream: MediaStream
): Promise<PcmCaptureSession> {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new AudioCtx();
  if (ctx.state === "suspended") {
    await ctx.resume();
  }

  const source = ctx.createMediaStreamSource(stream);
  // ScriptProcessor is deprecated but universal; mute so we don't monitor mic.
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  const mute = ctx.createGain();
  mute.gain.value = 0;

  const chunks: Float32Array[] = [];
  let total = 0;
  let ended = false;
  let bufferResult: AudioBuffer | null = null;

  processor.onaudioprocess = (event) => {
    if (ended) return;
    const input = event.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(input));
    total += input.length;
  };

  source.connect(processor);
  processor.connect(mute);
  mute.connect(ctx.destination);

  const finish = async (): Promise<AudioBuffer> => {
    if (bufferResult) return bufferResult;
    ended = true;
    processor.onaudioprocess = null;
    try {
      source.disconnect();
      processor.disconnect();
      mute.disconnect();
    } catch {
      /* already disconnected */
    }

    const sampleRate = ctx.sampleRate;
    const merged = new Float32Array(Math.max(1, total));
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.length;
    }
    chunks.length = 0;

    const buffer = ctx.createBuffer(1, merged.length, sampleRate);
    buffer.getChannelData(0).set(merged);
    bufferResult = buffer;
    await ctx.close().catch(() => undefined);
    return buffer;
  };

  return {
    stop: () => finish(),
    abort: () => {
      ended = true;
      try {
        source.disconnect();
        processor.disconnect();
        mute.disconnect();
      } catch {
        /* ignore */
      }
      void ctx.close().catch(() => undefined);
      chunks.length = 0;
    },
  };
}

/** Build a WAV blob from an AudioBuffer (native sample rate, mono). */
export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const channel =
    buffer.numberOfChannels > 0 ? buffer.getChannelData(0) : new Float32Array(1);
  const sampleRate = buffer.sampleRate;
  const length = channel.length;
  const bytes = new ArrayBuffer(44 + length * 2);
  const view = new DataView(bytes);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i += 1) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, length * 2, true);
  let o = 44;
  for (let i = 0; i < length; i += 1) {
    const s = Math.max(-1, Math.min(1, channel[i] ?? 0));
    view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    o += 2;
  }
  return new Blob([bytes], { type: "audio/wav" });
}
