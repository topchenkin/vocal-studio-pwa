import {
  armIosCapture,
  cancelArmedIosCapture,
  holdIosCapture,
} from "@/lib/ios-audio-session";
import { logClientEvent } from "@/lib/client-log";

/**
 * Shared mic graph helpers for singing analysis (tuner + star-double).
 *
 * iPhone/WebKit is systematically quieter than Android for three reasons:
 *   1. Safari Voice Processing I/O still ducks the input even when we ask
 *      for a raw mic, unless echoCancellation/noiseSuppression are off AND
 *      autoGainControl is on (iOS mics without AGC sit ~12–20 dB down).
 *   2. AnalyserNode is not pulled unless it is connected through to
 *      destination — otherwise getFloatTimeDomainData is silence / tiny.
 *   3. getFloatTimeDomainData is unreliable on some WebKit builds; fall
 *      back to getByteTimeDomainData when the float buffer is empty.
 */

export function isAppleWebKit(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iOS = /iP(hone|ad|od)/.test(ua);
  const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  return iOS || iPadOS;
}

export function singingMicConstraints(): MediaTrackConstraints {
  // `ideal`, not a bare boolean/`1`: on Chrome Android a mandatory
  // echoCancellation:false is often reported as NotAllowedError with no prompt.
  return {
    channelCount: { ideal: 1 },
    echoCancellation: { ideal: false },
    autoGainControl: { ideal: false },
    noiseSuppression: { ideal: false },
  };
}

/**
 * Linear gain after the mic node. iOS still needs ~12 dB (Voice Processing
 * ducks hard). Elsewhere a mild +6 dB helps quiet / laptop mics clear the
 * RMS voiced gate without forcing students to shout.
 */
export function singingInputGainValue(): number {
  return isAppleWebKit() ? 4 : 2;
}

/**
 * Ask for the mic the same way chat does: arm iOS audio session first,
 * request a simple `{ audio: true }` so the OS prompt actually appears,
 * then tighten with applyConstraints. Strict singing constraints on the
 * first getUserMedia make Safari and Chrome Android throw NotAllowedError
 * with no prompt — even if Settings already show the site as allowed.
 */
export function isStandaloneApp(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  if (nav.standalone) return true;
  return window.matchMedia("(display-mode: standalone)").matches;
}

export function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
}

/** Chrome Android WebAPK never shows a mic prompt; grant has to happen in a tab. */
export function openSiteInAndroidChrome(): void {
  if (typeof window === "undefined") return;
  const { host, pathname, search, hash, href } = window.location;
  const intent =
    `intent://${host}${pathname}${search}${hash}` +
    `#Intent;scheme=https;package=com.android.chrome;` +
    `S.browser_fallback_url=${encodeURIComponent(href)};end`;
  window.location.assign(intent);
}

export function isMicDeniedMessage(text: string | null | undefined): boolean {
  if (!text) return false;
  return /микрофон запрещ|не дал доступ к микрофону|разрешите микрофон|Permission denied|NotAllowed|PermissionDenied/i.test(
    text
  );
}

export function mapMicError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  const message = error instanceof Error ? error.message : "";
  logClientEvent({
    kind: "error",
    name: "mic",
    detail: {
      code: name || "Error",
      message: message.slice(0, 80) || null,
      pwa: isStandaloneApp(),
    },
  });
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    if (isStandaloneApp() && isAndroid()) {
      return "Микрофон запрещён в приложении. На Android разрешение нужно дать в Chrome — кнопка ниже откроет сайт в браузере.";
    }
    if (isStandaloneApp()) {
      return "Микрофон запрещён для приложения. В настройках телефона откройте Unique Vocal Studio → Разрешения → Микрофон и нажмите ещё раз.";
    }
    if (isAppleWebKit()) {
      return "Браузер не дал доступ к микрофону. На iPhone: Настройки → Safari → Микрофон, разрешите uniquevocal.ru и нажмите ещё раз.";
    }
    return "Браузер не дал доступ к микрофону. Нажмите на замочек у адреса сайта, разрешите микрофон для uniquevocal.ru и нажмите ещё раз.";
  }
  if (name === "NotFoundError") {
    return "Микрофон не найден. Подключите его и нажмите ещё раз.";
  }
  if (
    name === "NotReadableError" ||
    name === "AbortError" ||
    /busy|in use|allocate/i.test(message)
  ) {
    return "Микрофон занят. Закройте другие приложения со звуком и нажмите ещё раз.";
  }
  if (name === "SecurityError") {
    return "Микрофон недоступен в этом окне. Откройте кабинет на uniquevocal.ru.";
  }
  return "Не удалось включить микрофон.";
}

async function requestSingingMic(): Promise<MediaStream> {
  // One simple getUserMedia so the OS prompt actually appears. Strict
  // singing constraints on the first request make Chrome Android (and Safari
  // if we then stop-and-reopen) throw NotAllowedError with no prompt.
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: false,
  });
  holdIosCapture(stream);
  stream.getAudioTracks().forEach((track) => {
    void track.applyConstraints(singingMicConstraints()).catch(() => undefined);
  });
  return stream;
}

function isRetryableMicError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "NotReadableError" || error.name === "AbortError")
  );
}

export async function getSingingMicStream(): Promise<MediaStream> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("Микрофон недоступен");
  }

  armIosCapture();
  try {
    return await requestSingingMic();
  } catch (error) {
    console.error("[uvs:mic]", error);
    if (isRetryableMicError(error)) {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 180);
      });
      try {
        return await requestSingingMic();
      } catch (retryError) {
        console.error("[uvs:mic]", retryError);
        cancelArmedIosCapture();
        throw retryError;
      }
    }
    cancelArmedIosCapture();
    throw error;
  }
}

/**
 * Mixer / overdub mic. One getUserMedia — do not unlock-then-reopen, that
 * flips Safari between play-and-record and playback and kills monitor audio.
 * Echo cancellation is applied by the caller when speakers are playing
 * previous takes. holdIosCapture immediately returns the session to playback
 * so minusovka never stays on the earpiece.
 */
export async function getStudioMicStream(): Promise<MediaStream> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("Микрофон недоступен");
  }

  armIosCapture();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
    holdIosCapture(stream);
    return stream;
  } catch (error) {
    cancelArmedIosCapture();
    throw error;
  }
}

/**
 * Safari will not fill AnalyserNode buffers unless the node is in a graph
 * that reaches `destination`. Mute so the student never hears themselves.
 */
export function connectAnalyserToDestination(
  ctx: AudioContext,
  analyser: AnalyserNode
): GainNode {
  const mute = ctx.createGain();
  mute.gain.value = 0;
  analyser.connect(mute);
  mute.connect(ctx.destination);
  return mute;
}

export function readAnalyserTimeDomain(
  analyser: AnalyserNode,
  floatBuf: Float32Array<ArrayBuffer>
): void {
  analyser.getFloatTimeDomainData(floatBuf);
  const n = floatBuf.length;
  let peak = 0;
  let min = 1;
  let max = -1;
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    const v = floatBuf[i] ?? 0;
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
    const a = Math.abs(v);
    if (a > peak) peak = a;
  }

  if (peak <= 1e-5) {
    const bytes = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(bytes);
    const count = Math.min(n, bytes.length);
    for (let i = 0; i < count; i += 1) {
      floatBuf[i] = ((bytes[i] ?? 128) - 128) / 128;
    }
  } else if (min >= -0.02 && max <= 1.02 && sum / n > 0.2) {
    // Some WebKit builds return 0..1 instead of -1..1. Waveform moves,
    // but YIN never finds a pitch until we remap.
    for (let i = 0; i < n; i += 1) {
      floatBuf[i] = ((floatBuf[i] ?? 0) * 2) - 1;
    }
  }

  let mean = 0;
  for (let i = 0; i < n; i += 1) mean += floatBuf[i] ?? 0;
  mean /= Math.max(1, n);
  if (Math.abs(mean) > 1e-4) {
    for (let i = 0; i < n; i += 1) {
      floatBuf[i] = (floatBuf[i] ?? 0) - mean;
    }
  }
}
