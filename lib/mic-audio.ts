import {
  armIosCapture,
  cancelArmedIosCapture,
  holdIosCapture,
} from "@/lib/ios-audio-session";

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
  const ios = isAppleWebKit();
  return {
    channelCount: 1,
    echoCancellation: false,
    noiseSuppression: false,
    // Android already has usable levels with AGC off. iOS without AGC
    // forces the student to shout before YIN crosses the voicing gate.
    autoGainControl: ios,
  };
}

/** Linear gain applied after the mic node. ~12 dB on iOS, unity elsewhere. */
export function singingInputGainValue(): number {
  return isAppleWebKit() ? 4 : 1;
}

/**
 * Ask for the mic the same way chat does: arm iOS audio session first,
 * request a simple `{ audio: true }` so the OS prompt actually appears,
 * then optionally tighten constraints. Strict singing constraints alone
 * make Safari throw NotAllowedError with no prompt — even if Settings
 * already show the site as allowed.
 */
export async function getSingingMicStream(): Promise<MediaStream> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("Микрофон недоступен");
  }

  armIosCapture();
  try {
    let stream: MediaStream;
    if (isAppleWebKit()) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
      }
      const track = stream.getAudioTracks()[0];
      if (track) {
        void track.applyConstraints(singingMicConstraints()).catch(() => undefined);
      }
    } else {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: singingMicConstraints(),
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
    }
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
  let peak = 0;
  for (let i = 0; i < floatBuf.length; i += 1) {
    const a = Math.abs(floatBuf[i] ?? 0);
    if (a > peak) peak = a;
  }
  if (peak > 1e-5) return;

  const bytes = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(bytes);
  const n = Math.min(floatBuf.length, bytes.length);
  for (let i = 0; i < n; i += 1) {
    floatBuf[i] = ((bytes[i] ?? 128) - 128) / 128;
  }
}
