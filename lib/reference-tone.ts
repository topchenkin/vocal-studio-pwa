import { preferIosPlayback } from "@/lib/ios-audio-session";
import { frequencyFromMidi, midiFromNoteLabel } from "@/lib/pitch";

type WebkitWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

const NOTE_SEC = 0.85;
const GAP_SEC = 0.18;
const SCALE_NOTE_SEC = 0.7;

let active: { stop: () => void } | null = null;

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
) {
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
}

export function stopReferenceTone() {
  active?.stop();
  active = null;
}

/** Play one or more concert-pitch notes (A4 = 440). Call only from a user tap. */
export async function playReferenceNotes(notes: readonly string[]): Promise<void> {
  if (typeof window === "undefined" || notes.length === 0) return;
  stopReferenceTone();

  const ctx = openPlaybackContext();
  if (ctx.state === "suspended") {
    await ctx.resume().catch(() => undefined);
  }
  preferIosPlayback();

  const noteDur = notes.length > 1 ? SCALE_NOTE_SEC : NOTE_SEC;
  const startAt = ctx.currentTime + 0.04;
  notes.forEach((label, index) => {
    const hz = frequencyFromMidi(midiFromNoteLabel(label));
    const when = startAt + index * (noteDur + GAP_SEC);
    scheduleTone(ctx, hz, when, noteDur);
  });

  const total =
    notes.length * noteDur + Math.max(0, notes.length - 1) * GAP_SEC + 0.08;

  await new Promise<void>((resolve) => {
    let closed = false;
    const finish = () => {
      if (closed) return;
      closed = true;
      if (active?.stop === finish) active = null;
      window.clearTimeout(timer);
      if (ctx.state !== "closed") {
        void ctx.close().catch(() => undefined);
      }
      resolve();
    };
    const timer = window.setTimeout(finish, Math.ceil(total * 1000) + 80);
    active = { stop: finish };
  });
}
