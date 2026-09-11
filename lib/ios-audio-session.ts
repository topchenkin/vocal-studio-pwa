/**
 * iPhone routes media through the earpiece (quiet, muffled) while the page
 * is in a capture / play-and-record audio session. Android and iPad do not.
 * Safari 16.4+ exposes navigator.audioSession — set it back to playback
 * whenever the mic is not actually in use.
 *
 * A Web Audio graph created during play-and-record stays on the receiver
 * until that context is closed and a fresh playback context is opened.
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

function isIPhone(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone/.test(navigator.userAgent);
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
  if (captureCount === 0) {
    pendingArm = false;
    apply("playback");
  }
}

/**
 * Loudspeaker. Safe during capture too: leaving play-and-record on after
 * getUserMedia makes iPhone send every sound to the earpiece.
 * This does NOT remount an existing AudioContext — a context created while
 * the session was play-and-record stays on the receiver until it is closed
 * and a new one is opened in playback.
 */
export function preferIosPlayback() {
  apply("playback");
}

/** Same as preferIosPlayback — name used at overdub start. */
export function routeIosToSpeaker() {
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
  // Mic is open. Leave play-and-record and use the loudspeaker.
  apply("playback");
}

export function releaseIosCapture(stream: MediaStream | null | undefined) {
  if (!stream || !heldStreams.has(stream)) return;
  heldStreams.delete(stream);
  stream.getTracks().forEach((track) => {
    try {
      track.enabled = false;
      track.stop();
    } catch {
      /* already ended */
    }
  });
  endIosCapture();
}

function stopStreamTracks(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((track) => {
    try {
      track.enabled = false;
      track.stop();
    } catch {
      /* already ended */
    }
  });
}

/**
 * Open a tiny silent graph *after* switching to playback so iOS retakes
 * the speaker route. Spotify and other apps inherit this session.
 */
export async function forceIosSpeakerRoute() {
  apply("playback");
  if (typeof window === "undefined" || !isIPhone()) return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioCtx();
    if (ctx.state === "suspended") {
      await ctx.resume().catch(() => undefined);
    }
    const frames = Math.max(1, Math.floor(ctx.sampleRate * 0.04));
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const mute = ctx.createGain();
    mute.gain.value = 0.0001;
    source.connect(mute);
    mute.connect(ctx.destination);
    source.start();
    await new Promise((resolve) => window.setTimeout(resolve, 60));
    try {
      source.stop();
    } catch {
      /* already finished */
    }
    await ctx.close().catch(() => undefined);
  } catch {
    /* Web Audio unavailable */
  }
  apply("playback");
}

/**
 * Stop mic tracks, drop the tainted AudioContext, flush the capture
 * counter, and retake the speaker. Call this whenever a recorder / tuner
 * / analyzer finishes — including unmount and failed starts.
 */
export async function restoreIosPlaybackAfterCapture(input?: {
  stream?: MediaStream | null;
  context?: AudioContext | null;
}) {
  const stream = input?.stream ?? null;
  stopStreamTracks(stream);
  if (stream && heldStreams.has(stream)) {
    heldStreams.delete(stream);
  }
  const context = input?.context ?? null;
  if (context && context.state !== "closed") {
    try {
      await context.close();
    } catch {
      /* already closed */
    }
  }
  pendingArm = false;
  captureCount = 0;
  apply("playback");
  await forceIosSpeakerRoute();
}
