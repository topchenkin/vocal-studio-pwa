/**
 * Pitch-preserving time stretch (phase vocoder + identity phase locking).
 * Naive overlap-add on a mix sounds like only some instruments shifted.
 */

function princarg(phase: number) {
  return phase - 2 * Math.PI * Math.round(phase / (2 * Math.PI));
}

function hannWindow(size: number) {
  const window = new Float32Array(size);
  if (size <= 1) {
    window[0] = 1;
    return window;
  }
  for (let i = 0; i < size; i += 1) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return window;
}

function fftRadix2(
  re: Float64Array,
  im: Float64Array,
  inverse: boolean
) {
  const n = re.length;
  let j = 0;
  for (let i = 1; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]!;
      const ti = im[i]!;
      re[i] = re[j]!;
      im[i] = im[j]!;
      re[j] = tr;
      im[j] = ti;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 1 : -1) * 2 * Math.PI) / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      for (let k = 0; k < half; k += 1) {
        const ur = re[i + k]!;
        const ui = im[i + k]!;
        const vr = re[i + k + half]! * wRe - im[i + k + half]! * wIm;
        const vi = re[i + k + half]! * wIm + im[i + k + half]! * wRe;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + half] = ur - vr;
        im[i + k + half] = ui - vi;
        const nextRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nextRe;
      }
    }
  }

  if (inverse) {
    const invN = 1 / n;
    for (let i = 0; i < n; i += 1) {
      re[i] = re[i]! * invN;
      im[i] = im[i]! * invN;
    }
  }
}

function findPeakRegions(mag: Float64Array, bins: number) {
  let maxMag = 0;
  for (let k = 0; k <= bins; k += 1) {
    maxMag = Math.max(maxMag, mag[k] ?? 0);
  }
  const floor = maxMag * 0.04;
  const peaks: number[] = [];
  for (let k = 2; k < bins - 1; k += 1) {
    const m = mag[k] ?? 0;
    if (m >= floor && m >= (mag[k - 1] ?? 0) && m > (mag[k + 1] ?? 0)) {
      peaks.push(k);
    }
  }
  if (peaks.length === 0) return null;
  const regions: { start: number; end: number; peak: number }[] = [];
  for (let i = 0; i < peaks.length; i += 1) {
    const peak = peaks[i]!;
    const prev = i === 0 ? 0 : peaks[i - 1]!;
    const next = i === peaks.length - 1 ? bins : peaks[i + 1]!;
    const start = i === 0 ? 0 : Math.floor((prev + peak) / 2);
    const end = i === peaks.length - 1 ? bins : Math.floor((peak + next) / 2);
    regions.push({ start, end, peak });
  }
  return regions;
}

async function yieldToUi() {
  await new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

async function stretchOneChannel(
  input: Float32Array,
  stretch: number,
  fftSize: number,
  hopA: number
) {
  const hopS = Math.max(1, Math.round(hopA * stretch));
  const bins = fftSize >> 1;
  const window = hannWindow(fftSize);
  const expectedLen = Math.max(fftSize, Math.round(input.length * stretch));
  const maxFrames = Math.ceil(input.length / hopA) + 2;
  const outputLen = Math.max(expectedLen, (maxFrames - 1) * hopS + fftSize);
  const output = new Float32Array(outputLen);
  const weight = new Float32Array(outputLen);

  const re = new Float64Array(fftSize);
  const im = new Float64Array(fftSize);
  const mag = new Float64Array(bins + 1);
  const analPhase = new Float64Array(bins + 1);
  const prevPhase = new Float64Array(bins + 1);
  const accumPhase = new Float64Array(bins + 1);
  const omega = new Float64Array(bins + 1);
  for (let k = 0; k <= bins; k += 1) {
    omega[k] = (2 * Math.PI * k * hopA) / fftSize;
  }

  const hopRatio = hopS / hopA;
  let first = true;
  let frame = 0;

  for (let inPos = 0; inPos < input.length; inPos += hopA) {
    for (let i = 0; i < fftSize; i += 1) {
      const src = inPos + i;
      const sample = src >= 0 && src < input.length ? input[src] ?? 0 : 0;
      re[i] = sample * (window[i] ?? 0);
      im[i] = 0;
    }
    fftRadix2(re, im, false);

    for (let k = 0; k <= bins; k += 1) {
      const real = re[k] ?? 0;
      const imag = im[k] ?? 0;
      mag[k] = Math.hypot(real, imag);
      analPhase[k] = Math.atan2(imag, real);
    }

    if (first) {
      accumPhase.set(analPhase);
      prevPhase.set(analPhase);
      first = false;
    } else {
      for (let k = 0; k <= bins; k += 1) {
        const delta = princarg(
          (analPhase[k] ?? 0) - (prevPhase[k] ?? 0) - (omega[k] ?? 0)
        );
        prevPhase[k] = analPhase[k] ?? 0;
        accumPhase[k] = (accumPhase[k] ?? 0) + ((omega[k] ?? 0) + delta) * hopRatio;
      }
    }

    const regions = findPeakRegions(mag, bins);
    const outPhase = new Float64Array(bins + 1);
    outPhase.set(accumPhase);
    if (regions) {
      for (const { start, end, peak } of regions) {
        const peakSynth = accumPhase[peak] ?? 0;
        const peakAnal = analPhase[peak] ?? 0;
        for (let k = start; k <= end; k += 1) {
          outPhase[k] = peakSynth + ((analPhase[k] ?? 0) - peakAnal);
        }
      }
    }

    re.fill(0);
    im.fill(0);
    for (let k = 0; k <= bins; k += 1) {
      const m = mag[k] ?? 0;
      const p = outPhase[k] ?? 0;
      re[k] = m * Math.cos(p);
      im[k] = m * Math.sin(p);
      if (k > 0 && k < bins) {
        re[fftSize - k] = re[k]!;
        im[fftSize - k] = -im[k]!;
      }
    }
    im[0] = 0;
    im[bins] = 0;

    fftRadix2(re, im, true);

    const outPos = frame * hopS;
    for (let i = 0; i < fftSize; i += 1) {
      const dest = outPos + i;
      if (dest >= outputLen) break;
      const w = window[i] ?? 0;
      output[dest] += (re[i] ?? 0) * w;
      weight[dest] += w * w;
    }
    frame += 1;
    if (frame % 48 === 0) await yieldToUi();
  }

  for (let i = 0; i < outputLen; i += 1) {
    const w = weight[i] ?? 0;
    if (w > 1e-8) output[i] = (output[i] ?? 0) / w;
  }

  if (output.length === expectedLen) return output;
  const cropped = new Float32Array(expectedLen);
  cropped.set(output.subarray(0, Math.min(expectedLen, output.length)));
  return cropped;
}

export async function phaseVocoderStretchChannels(
  channels: Float32Array[],
  stretch: number,
  sampleRate: number
): Promise<Float32Array[]> {
  const inputLen = channels[0]?.length ?? 0;
  if (
    channels.length === 0 ||
    inputLen < 64 ||
    !Number.isFinite(stretch) ||
    Math.abs(stretch - 1) < 1e-4
  ) {
    return channels;
  }

  const fftSize = sampleRate >= 32000 ? 4096 : 2048;
  const hopA = fftSize >> 2;
  const out: Float32Array[] = [];
  for (let c = 0; c < channels.length; c += 1) {
    out.push(
      await stretchOneChannel(
        channels[c] ?? new Float32Array(inputLen),
        stretch,
        fftSize,
        hopA
      )
    );
    if (c + 1 < channels.length) await yieldToUi();
  }
  return out;
}
