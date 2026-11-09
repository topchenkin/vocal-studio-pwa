import { preferIosPlayback } from "@/lib/ios-audio-session";
import { frequencyFromMidi, midiFromNoteLabel } from "@/lib/pitch";

type WebkitWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

const NOTE_SEC = 0.85;
const GAP_SEC = 0.18;
const SCALE_NOTE_SEC = 0.7;

type ActiveTone = {
  silence: () => void;
  dispose: () => Promise<void>;
};

let active: ActiveTone | null = null;

function openPlaybackContext(): AudioContext {
  preferIosPlayback();
  const Ctor =
    window.AudioContext || (window as WebkitWindow).webkitAudioContext;
  if (!Ctor) {
    throw new Error("В этом браузере нет звука");
  }
  return new Ctor();
}

function scheduleTone(
  ctx: AudioContext,
  hz: number,
  when: number,
  dur: number
): { sine: OscillatorNode; body: OscillatorNode } {
  const sine = ctx.createOscillator();
  sine.type = "sine";
  sine.frequency.value = hz;

  const body = ctx.createOscillator();
  body.type = "triangle";
  body.frequency.value = hz;

  const gain = ctx.createGain();
  const peak = 0.16;
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(peak, when + 0.025);
  gain.gain.exponentialRampToValueAtTime(peak * 0.72, when + 0.1);
  const releaseAt = Math.max(when + 0.12, when + dur - 0.14);
  gain.gain.setValueAtTime(peak * 0.72, releaseAt);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);

  sine.connect(gain);
  body.connect(gain);
  gain.connect(ctx.destination);
  sine.start(when);
  body.start(when);
  sine.stop(when + dur + 0.03);
  body.stop(when + dur + 0.03);
  return { sine, body };
}

/** Stop oscillators immediately so the mic does not hear the reference. */
export function silenceReferenceTone() {
  active?.silence();
}

/** Stop and close the playback context. Safe to call from unmount / mode switch. */
export function stopReferenceTone() {
  const handle = active;
  active = null;
  handle?.silence();
  void handle?.dispose();
}

export function disposeReferenceTone(): Promise<void> {
  const handle = active;
  active = null;
  if (!handle) return Promise.resolve();
  handle.silence();
  return handle.dispose();
}

/** Play one or more concert-pitch notes (A4 = 440). Call only from a user tap. */
export async function playReferenceNotes(
  notes: readonly string[],
  options?: {
    noteSec?: number;
    gapSec?: number;
    onNote?: (index: number) => void;
  }
): Promise<void> {
  if (typeof window === "undefined" || notes.length === 0) return;
  stopReferenceTone();

  const ctx = openPlaybackContext();
  if (ctx.state === "suspended") {
    await ctx.resume().catch(() => undefined);
  }
  preferIosPlayback();

  const noteDur =
    options?.noteSec ?? (notes.length > 1 ? SCALE_NOTE_SEC : NOTE_SEC);
  const gap = options?.gapSec ?? GAP_SEC;
  const startAt = ctx.currentTime + 0.04;
  const noteTimers: number[] = [];
  const sources: OscillatorNode[] = [];
  notes.forEach((label, index) => {
    const hz = frequencyFromMidi(midiFromNoteLabel(label));
    const when = startAt + index * (noteDur + gap);
    const { sine, body } = scheduleTone(ctx, hz, when, noteDur);
    sources.push(sine, body);
    const delayMs = Math.max(0, (when - ctx.currentTime) * 1000);
    noteTimers.push(
      window.setTimeout(() => {
        options?.onNote?.(index);
      }, delayMs)
    );
  });

  const total =
    notes.length * noteDur + Math.max(0, notes.length - 1) * gap + 0.08;

  await new Promise<void>((resolve) => {
    let closed = false;
    let silenced = false;
    const silence = () => {
      if (silenced) return;
      silenced = true;
      noteTimers.forEach((id) => window.clearTimeout(id));
      noteTimers.length = 0;
      const now = ctx.state === "closed" ? 0 : ctx.currentTime;
      sources.forEach((osc) => {
        try {
          osc.stop(now);
        } catch {
          /* already stopped */
        }
      });
      sources.length = 0;
    };
    const dispose = () => {
      if (closed) return Promise.resolve();
      closed = true;
      window.clearTimeout(timer);
      silence();
      if (active === handle) active = null;
      if (ctx.state === "closed") {
        resolve();
        return Promise.resolve();
      }
      return ctx.close().then(
        () => resolve(),
        () => resolve()
      );
    };
    const timer = window.setTimeout(() => {
      void dispose();
    }, Math.ceil(total * 1000) + 80);
    const handle: ActiveTone = { silence, dispose };
    active = handle;
  });
}
