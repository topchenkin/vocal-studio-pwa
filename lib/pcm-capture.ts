/**
 * Capture mic audio as raw PCM via AudioContext (no MediaRecorder / webm).
 * Eliminates chunk-pollution and decode-cache bugs between consecutive takes.
 */

export type PcmCaptureSession = {
  stop: () => Promise<AudioBuffer>;
  abort: () => void;
};

type TimedChunk = { startTime: number; data: Float32Array };

/**
 * Capture on an EXISTING AudioContext so overdub lines up with BufferSource
 * playback on the same clock (MediaRecorder cannot do this).
 *
 * `timelineStart` = ctx.currentTime when monitor playback was scheduled.
 * Resulting buffer is anchored to that timeline (leading silence if needed).
 */
export function startContextPcmCapture(
  ctx: AudioContext,
  stream: MediaStream,
  timelineStart: number
): PcmCaptureSession {
  const source = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(1024, 1, 1);
  const mute = ctx.createGain();
  mute.gain.value = 0;

  const chunks: TimedChunk[] = [];
  let ended = false;
  let bufferResult: AudioBuffer | null = null;

  processor.onaudioprocess = (event) => {
    if (ended) return;
    const input = event.inputBuffer.getChannelData(0);
    // Buffer covers roughly [currentTime - duration, currentTime]
    const startTime = ctx.currentTime - event.inputBuffer.duration;
    chunks.push({ startTime, data: new Float32Array(input) });
  };

  source.connect(processor);
  processor.connect(mute);
  mute.connect(ctx.destination);

  const finish = async (): Promise<AudioBuffer> => {
    if (bufferResult) return bufferResult;
    ended = true;
    const stopTime = ctx.currentTime;
    processor.onaudioprocess = null;
    try {
      source.disconnect();
      processor.disconnect();
      mute.disconnect();
    } catch {
      /* already disconnected */
    }

    const sampleRate = ctx.sampleRate;
    const durationSec = Math.max(0.05, stopTime - timelineStart);
    const length = Math.max(1, Math.ceil(durationSec * sampleRate));
    const merged = new Float32Array(length);

    for (const chunk of chunks) {
      const offsetSamples = Math.round(
        (chunk.startTime - timelineStart) * sampleRate
      );
      for (let i = 0; i < chunk.data.length; i += 1) {
        const dest = offsetSamples + i;
        if (dest >= 0 && dest < merged.length) {
          merged[dest] += chunk.data[i] ?? 0;
        }
      }
    }
    chunks.length = 0;

    // Compensate I/O latency: what you hear is late vs context time; voice
    // lands late in the capture — shift recording earlier to match monitor.
    const latencySec =
      (typeof ctx.baseLatency === "number" ? ctx.baseLatency : 0) +
      (typeof ctx.outputLatency === "number" ? ctx.outputLatency : 0);
    const shift = Math.min(
      merged.length - 1,
      Math.max(0, Math.round(latencySec * sampleRate))
    );
    const compensated =
      shift > 0 ? merged.subarray(shift) : merged;

    const buffer = ctx.createBuffer(1, Math.max(1, compensated.length), sampleRate);
    buffer.getChannelData(0).set(compensated);
    bufferResult = buffer;
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
      chunks.length = 0;
    },
  };
}

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
  const session = startContextPcmCapture(ctx, stream, ctx.currentTime);
  const origStop = session.stop;
  const origAbort = session.abort;
  return {
    stop: async () => {
      const buffer = await origStop();
      await ctx.close().catch(() => undefined);
      return buffer;
    },
    abort: () => {
      origAbort();
      void ctx.close().catch(() => undefined);
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
