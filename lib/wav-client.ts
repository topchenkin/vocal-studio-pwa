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
  return mixAudioBuffersWithOffsets(
    buffers.map((buffer) => ({ buffer, offsetSec: 0 }))
  );
}

export type MixLane = {
  buffer: AudioBuffer;
  offsetSec: number;
  trimStartSec?: number;
  trimEndSec?: number;
  /** Integer semitones, typically −12…+12. Applied via BufferSource.detune. */
  pitchSemitones?: number;
};

function clampPitchSemitones(value: number | undefined) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-12, Math.min(12, Math.round(value as number)));
}

function lanePlaySec(lane: MixLane) {
  const trimStart = Math.max(0, lane.trimStartSec ?? 0);
  const trimEnd = Math.min(
    lane.buffer.duration,
    lane.trimEndSec ?? lane.buffer.duration
  );
  return Math.max(0, trimEnd - trimStart);
}

function mixTimelineLength(lanes: MixLane[], sampleRate: number) {
  let endSample = 0;
  for (const lane of lanes) {
    const start = Math.max(0, Math.round(lane.offsetSec * sampleRate));
    endSample = Math.max(
      endSample,
      start + Math.max(1, Math.round(lanePlaySec(lane) * sampleRate))
    );
  }
  return Math.max(1, endSample);
}

function normalizeStereoInPlace(left: Float32Array, right: Float32Array) {
  let peak = 0;
  const length = Math.min(left.length, right.length);
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
}

function getOfflineAudioContext(
  channels: number,
  length: number,
  sampleRate: number
) {
  const Ctor =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;
  return new Ctor(channels, length, sampleRate);
}

/** Mix via OfflineAudioContext so BufferSource.detune matches live preview. */
async function mixLanesWithDetune(
  lanes: MixLane[],
  sampleRate: number,
  length: number
): Promise<Blob> {
  const ctx = getOfflineAudioContext(2, length, sampleRate);
  for (const lane of lanes) {
    const playSec = lanePlaySec(lane);
    if (playSec <= 0) continue;
    const source = ctx.createBufferSource();
    source.buffer = lane.buffer;
    const pitch = clampPitchSemitones(lane.pitchSemitones);
    if (pitch !== 0) source.detune.value = pitch * 100;
    source.connect(ctx.destination);
    const when = Math.max(0, lane.offsetSec);
    const trimStart = Math.max(0, lane.trimStartSec ?? 0);
    source.start(when, trimStart, playSec);
  }

  const rendered = await ctx.startRendering();
  const left = new Float32Array(rendered.getChannelData(0));
  const right = new Float32Array(
    rendered.numberOfChannels > 1
      ? rendered.getChannelData(1)
      : rendered.getChannelData(0)
  );
  normalizeStereoInPlace(left, right);
  return encodeWavBlob([left, right], sampleRate);
}

/** Mix lanes onto one timeline; each buffer starts at offsetSec (optional trim). */
export async function mixAudioBuffersWithOffsets(
  lanes: MixLane[]
): Promise<Blob> {
  if (lanes.length === 0) throw new Error("Нет дорожек для сведения");
  const sampleRate = lanes[0]!.buffer.sampleRate;
  const length = mixTimelineLength(lanes, sampleRate);

  const needsPitch = lanes.some(
    (lane) => clampPitchSemitones(lane.pitchSemitones) !== 0
  );
  if (needsPitch) {
    return mixLanesWithDetune(lanes, sampleRate, length);
  }

  const left = new Float32Array(length);
  const right = new Float32Array(length);

  for (const lane of lanes) {
    const start = Math.max(0, Math.round(lane.offsetSec * sampleRate));
    const buffer = lane.buffer;
    const trimStart = Math.max(0, lane.trimStartSec ?? 0);
    const trimEnd = Math.min(
      buffer.duration,
      lane.trimEndSec ?? buffer.duration
    );
    const srcStart = Math.min(
      buffer.length - 1,
      Math.max(0, Math.round(trimStart * sampleRate))
    );
    const srcEnd = Math.min(
      buffer.length,
      Math.max(srcStart + 1, Math.round(trimEnd * sampleRate))
    );
    const l = buffer.getChannelData(0);
    const r =
      buffer.numberOfChannels > 1
        ? buffer.getChannelData(1)
        : buffer.getChannelData(0);
    for (let i = srcStart; i < srcEnd; i += 1) {
      const dest = start + (i - srcStart);
      if (dest >= length) break;
      left[dest] = (left[dest] ?? 0) + (l[i] ?? 0);
      right[dest] = (right[dest] ?? 0) + (r[i] ?? 0);
    }
  }

  normalizeStereoInPlace(left, right);
  return encodeWavBlob([left, right], sampleRate);
}

/**
 * Crude stereo mid/side split for when the Demucs API is missing (static host).
 * Vocal ≈ mid (L+R)/2, instrumental ≈ side / center-cancel (L−R).
 */
export async function splitStereoCenterCancel(blob: Blob): Promise<{
  vocal: Blob;
  minus: Blob;
  monoSource: boolean;
  minusPeak: number;
}> {
  const buffer = await decodeBlobToAudioBuffer(blob);
  const length = buffer.length;
  const sampleRate = buffer.sampleRate;
  const left = buffer.getChannelData(0);
  const monoSource = buffer.numberOfChannels < 2;
  const right = monoSource ? left : buffer.getChannelData(1);
  const vocal = new Float32Array(length);
  const minusL = new Float32Array(length);
  const minusR = new Float32Array(length);
  let minusPeak = 0;

  for (let i = 0; i < length; i += 1) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    vocal[i] = (l + r) * 0.5;
    const side = (l - r) * 0.5;
    minusL[i] = side;
    minusR[i] = -side;
    minusPeak = Math.max(minusPeak, Math.abs(side));
  }

  return {
    vocal: encodeWavBlob([vocal], sampleRate),
    minus: encodeWavBlob([minusL, minusR], sampleRate),
    monoSource,
    minusPeak,
  };
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

export const PITCH_SHIFT_MIN = -12;
export const PITCH_SHIFT_MAX = 12;
export const TEMPO_SHIFT_MIN = -50;
export const TEMPO_SHIFT_MAX = 50;

export function clampPitchShift(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(PITCH_SHIFT_MIN, Math.min(PITCH_SHIFT_MAX, Math.round(value * 2) / 2));
}

export function clampTempoPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(TEMPO_SHIFT_MIN, Math.min(TEMPO_SHIFT_MAX, Math.round(value)));
}

export function tempoToPlaybackRate(tempoPercent: number) {
  return Math.max(0.5, Math.min(2, 1 + clampTempoPercent(tempoPercent) / 100));
}

/** Cents to add so playbackRate does not also change musical key. */
export function detuneForIndependentPitch(
  pitchSemitones: number,
  playbackRate: number
) {
  const rateSemis = 12 * Math.log2(Math.max(0.25, playbackRate));
  return (clampPitchShift(pitchSemitones) - rateSemis) * 100;
}

export function applyPitchTempoToSource(
  source: AudioBufferSourceNode,
  pitchSemitones: number,
  tempoPercent: number
) {
  const rate = tempoToPlaybackRate(tempoPercent);
  source.playbackRate.value = rate;
  source.detune.value = detuneForIndependentPitch(pitchSemitones, rate);
  return rate;
}

/** Render a new WAV with independent pitch (semitones) and tempo (%). */
export async function renderPitchTempoWav(
  buffer: AudioBuffer,
  pitchSemitones: number,
  tempoPercent: number
): Promise<Blob> {
  const rate = tempoToPlaybackRate(tempoPercent);
  const sampleRate = buffer.sampleRate;
  const outLength = Math.max(
    1,
    Math.ceil((buffer.duration / rate) * sampleRate)
  );
  const ctx = getOfflineAudioContext(
    Math.min(2, Math.max(1, buffer.numberOfChannels)),
    outLength,
    sampleRate
  );
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  applyPitchTempoToSource(source, pitchSemitones, tempoPercent);
  source.connect(ctx.destination);
  source.start(0);
  const rendered = await ctx.startRendering();
  const left = new Float32Array(rendered.getChannelData(0));
  const right = new Float32Array(
    rendered.numberOfChannels > 1
      ? rendered.getChannelData(1)
      : rendered.getChannelData(0)
  );
  normalizeStereoInPlace(left, right);
  return encodeWavBlob(
    rendered.numberOfChannels > 1 ? [left, right] : [left],
    sampleRate
  );
}

