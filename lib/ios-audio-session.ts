/**
 * iPhone routes media through the earpiece (quiet, muffled) while the page
 * is in a capture / play-and-record audio session. Android and iPad do not.
 * Safari 16.4+ exposes navigator.audioSession — set it back to playback
 * whenever the mic is not actually in use.
 */

type SessionType =
  | "auto"
  | "playback"
  | "transient"
  | "transient-solo"
  | "ambient"
  | "play-and-record";

type SafariAudioSession = { type: SessionType };

function safariSession(): SafariAudioSession | null {
  if (typeof navigator === "undefined") return null;
  const session = (
    navigator as Navigator & { audioSession?: SafariAudioSession }
  ).audioSession;
  return session ?? null;
}

let captureCount = 0;
let pendingArm = false;

function apply(type: SessionType) {
  const session = safariSession();
  if (!session) return;
  try {
    session.type = type;
  } catch {
    /* older WebKit */
  }
}

/** Call before getUserMedia / while a live audio track is needed. */
export function beginIosCapture() {
  captureCount += 1;
  apply("play-and-record");
}

/**
 * Switch Safari to play-and-record *before* getUserMedia.
 * Without this, iOS throws NotAllowedError even when the site already
 * has microphone permission (and does not show another prompt).
 */
export function armIosCapture() {
  apply("play-and-record");
  if (captureCount === 0) {
    captureCount = 1;
    pendingArm = true;
  }
}

export function cancelArmedIosCapture() {
  if (!pendingArm) return;
  pendingArm = false;
  endIosCapture();
}

/** Call after every live audio track is stopped. */
export function endIosCapture() {
  captureCount = Math.max(0, captureCount - 1);
  if (captureCount === 0) apply("playback");
}

/** Loudspeaker playback. Safe to call on every play() if the mic is idle. */
export function preferIosPlayback() {
  if (captureCount > 0) return;
  apply("playback");
}

export function iosCaptureActive() {
  return captureCount > 0;
}

const heldStreams = new WeakSet<MediaStream>();

/** Pair with releaseIosCapture(stream) after the tracks are stopped. */
export function holdIosCapture(stream: MediaStream) {
  if (heldStreams.has(stream)) return;
  heldStreams.add(stream);
  if (pendingArm) {
    pendingArm = false;
  } else {
    beginIosCapture();
  }
  apply("play-and-record");
}

export function releaseIosCapture(stream: MediaStream | null | undefined) {
  if (!stream || !heldStreams.has(stream)) return;
  heldStreams.delete(stream);
  endIosCapture();
}
