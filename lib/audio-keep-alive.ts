/**
 * iOS suspends Web Audio when the screen locks. A looping silent HTML
 * media element plus Media Session is the only web-side keep-alive.
 * It is not guaranteed on every iOS version, but it is the supported
 * workaround (no native AVAudioSession).
 */

let element: HTMLAudioElement | null = null;
let holdCount = 0;
let wakeLock: WakeLockSentinel | null = null;

const SILENCE_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=";

function mediaEl() {
  if (typeof document === "undefined") return null;
  if (element) return element;
  const audio = document.createElement("audio");
  audio.src = SILENCE_WAV;
  audio.loop = true;
  audio.preload = "auto";
  audio.setAttribute("playsinline", "true");
  audio.setAttribute("webkit-playsinline", "true");
  audio.volume = 0.01;
  element = audio;
  return audio;
}

async function requestWakeLock() {
  try {
    if (!navigator.wakeLock) return;
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => {
      if (holdCount > 0) void requestWakeLock();
    });
  } catch {
    /* unsupported / denied */
  }
}

export function beginAudioKeepAlive() {
  holdCount += 1;
  const audio = mediaEl();
  if (!audio) return;
  void audio.play().catch(() => undefined);
  void requestWakeLock();
  try {
    if (navigator.mediaSession) {
      navigator.mediaSession.playbackState = "playing";
      navigator.mediaSession.metadata = new MediaMetadata({
        title: "Unique Vocal",
        artist: "Практика",
      });
    }
  } catch {
    /* ignore */
  }
}

export function endAudioKeepAlive() {
  holdCount = Math.max(0, holdCount - 1);
  if (holdCount > 0) return;
  element?.pause();
  try {
    void wakeLock?.release();
  } catch {
    /* ignore */
  }
  wakeLock = null;
  try {
    if (navigator.mediaSession) {
      navigator.mediaSession.playbackState = "none";
    }
  } catch {
    /* ignore */
  }
}
