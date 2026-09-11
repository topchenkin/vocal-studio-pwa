/**
 * iPhone routes media through the earpiece (quiet, muffled) while the page
 * is in a capture / play-and-record audio session. Android and iPad do not.
 * Safari 16.4+ exposes navigator.audioSession — set it back to playback
 * whenever the mic is not actually in use.
 *
 * A Web Audio graph created during play-and-record stays on the receiver
 * until that context is closed and a fresh playback context is opened.
 *
 * Native AVAudioSession has `.defaultToSpeaker` / `overrideOutputAudioPort`.
 * Safari still does not expose a reliable equivalent. If a future WebKit
 * build adds `overrideOutputAudioPort`, we call it. Until then: arm
 * play-and-record only for the getUserMedia call, immediately return to
 * playback, keep re-asserting playback while a mic track is held, recreate
 * AudioContext after capture, and prefer in-DOM HTML <audio> for unpitched
 * monitors (they follow the playback session).
 */

type SessionType =
  | "auto"
  | "playback"
  | "transient"
  | "transient-solo"
  | "ambient"
  | "play-and-record";

type SafariAudioSession = {
  type: SessionType;
  overrideOutputAudioPort?: (port: string) => unknown;
};

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
let speakerLockTimer: number | null = null;
const speakerPulseTimers: number[] = [];

function applySpeakerOverride() {
  const session = safariSession();
  const override = session?.overrideOutputAudioPort;
  if (!session || typeof override !== "function") return;
  try {
    const result = override.call(session, "speaker");
    if (result && typeof (result as Promise<unknown>).then === "function") {
      void (result as Promise<unknown>).catch(() => undefined);
    }
  } catch {
    /* WebKit has no overrideOutputAudioPort on current iOS */
  }
}

function apply(type: SessionType) {
  const session = safariSession();
  if (!session) return;
  try {
    session.type = type;
  } catch {
    /* older WebKit */
  }
  if (type !== "play-and-record") {
    applySpeakerOverride();
  }
}

function clearSpeakerPulses() {
  if (typeof window === "undefined") return;
  speakerPulseTimers.splice(0).forEach((id) => window.clearTimeout(id));
}

function startSpeakerLock() {
  apply("playback");
  if (typeof window === "undefined") return;
  if (speakerLockTimer != null) return;
  speakerLockTimer = window.setInterval(() => {
    apply("playback");
  }, 450);
}

function stopSpeakerLock() {
  if (typeof window === "undefined") return;
  if (speakerLockTimer != null) {
    window.clearInterval(speakerLockTimer);
    speakerLockTimer = null;
  }
  clearSpeakerPulses();
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
 * Leave this mode immediately after the stream arrives — see holdIosCapture.
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
    stopSpeakerLock();
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

/**
 * Re-assert playback for a few hundred ms after getUserMedia. Safari often
 * flips back to play-and-record (and the earpiece) right after the mic opens.
 */
export function pulseIosPlayback(times = 8, gapMs = 70) {
  preferIosPlayback();
  if (typeof window === "undefined") return;
  clearSpeakerPulses();
  for (let i = 1; i <= times; i += 1) {
    speakerPulseTimers.push(
      window.setTimeout(() => {
        apply("playback");
      }, i * gapMs)
    );
  }
}

export function iosCaptureActive() {
  return captureCount > 0;
}

const heldStreams = new WeakSet<MediaStream>();

/** Pair with releaseIosCapture(stream) after the tracks are stopped. */
export function holdIosCapture(stream: MediaStream) {
  if (heldStreams.has(stream)) {
    apply("playback");
    startSpeakerLock();
    return;
  }
  heldStreams.add(stream);
  if (pendingArm) {
    pendingArm = false;
  } else {
    captureCount += 1;
  }
  // Mic is open. Leave play-and-record and use the loudspeaker.
  apply("playback");
  startSpeakerLock();
  pulseIosPlayback();
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
 * Best-effort HTML media route. iOS below ~26 has no setSinkId; empty sink
 * id is the system default (speaker / headphones), never the receiver.
 */
export async function routeHtmlMediaToSpeaker(el: HTMLMediaElement) {
  preferIosPlayback();
  const media = el as HTMLMediaElement & {
    setSinkId?: (id: string) => Promise<void>;
  };
  if (typeof media.setSinkId !== "function") return;
  try {
    await media.setSinkId("");
  } catch {
    /* ignored or unsupported */
  }
}

/**
 * Kick an already-playing element off the earpiece after the session
 * returns to playback. Do not mute — Safari can leave the element silent.
 */
export async function reviveHtmlMediaOnSpeaker(el: HTMLMediaElement) {
  preferIosPlayback();
  el.muted = false;
  if (el.volume < 0.05) el.volume = 1;
  await routeHtmlMediaToSpeaker(el);
  if (el.paused) {
    try {
      await el.play();
    } catch {
      /* gesture may be gone */
    }
    return;
  }
  if (!isIPhone()) return;
  try {
    el.pause();
    await el.play();
  } catch {
    try {
      await el.play();
    } catch {
      /* keep the pre-gUM play() if this retry fails */
    }
  }
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
  stopSpeakerLock();
  apply("playback");
  await forceIosSpeakerRoute();
}
