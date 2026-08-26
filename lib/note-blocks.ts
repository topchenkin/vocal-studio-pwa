import { frequencyFromMidi, midiFromFrequency, noteLabelFromMidi } from "@/lib/pitch";
import type { NoteBlock, PhrasePitchFeatures } from "@/types";

export const HITBOX_GREEN_CENTS = 80;
export const HITBOX_NEAR_CENTS = 150;
export const HITBOX_TIMING_SLACK_SEC = 0.2;
export const HITBOX_FRAME_SEC = 0.1;
export const SCORE_FPS = 10;

const MIN_BLOCK_SEC = 0.08;
const VIBRATO_CENTS = 80;
const GAP_MERGE_SEC = 0.12;

export function hzToCents(userHz: number, targetHz: number): number {
  if (userHz <= 0 || targetHz <= 0) return 9999;
  return 1200 * Math.log2(userHz / targetHz);
}

/**
 * Octave-blind pitch-class distance in [0, 600].
 * 1200¢ / 2400¢ → 0; 1190¢ → 10 (mirror around the octave).
 */
export function pitchClassCents(userHz: number, targetHz: number): number {
  if (userHz <= 0 || targetHz <= 0) return 9999;
  const userCents = 1200 * Math.log2(userHz);
  const targetCents = 1200 * Math.log2(targetHz);
  let diff = Math.abs(userCents - targetCents) % 1200;
  if (diff > 600) diff = 1200 - diff;
  return diff;
}

export function shiftNoteBlocks(blocks: NoteBlock[], semitones: number): NoteBlock[] {
  const shift = Math.round(semitones);
  if (shift === 0) return blocks;
  const factor = 2 ** (shift / 12);
  return blocks.map((block) => {
    const midi = block.midi + shift;
    return {
      ...block,
      midi,
      note: noteLabelFromMidi(midi),
      startHz: Math.round(block.startHz * factor * 100) / 100,
    };
  });
}

export function blockAtTime(
  blocks: NoteBlock[],
  time: number,
  slack = HITBOX_TIMING_SLACK_SEC
): NoteBlock | null {
  const inside = blocks.filter((block) => time >= block.startTime && time <= block.endTime);
  if (inside.length > 0) {
    return inside.reduce((best, block) => {
      const mid = (block.startTime + block.endTime) / 2;
      const bestMid = (best.startTime + best.endTime) / 2;
      return Math.abs(time - mid) < Math.abs(time - bestMid) ? block : best;
    });
  }
  const nearby = blocks.filter(
    (block) => time >= block.startTime - slack && time <= block.endTime + slack
  );
  if (nearby.length === 0) return null;
  return nearby.reduce((best, block) => {
    const dist = Math.min(Math.abs(time - block.startTime), Math.abs(time - block.endTime));
    const bestDist = Math.min(Math.abs(time - best.startTime), Math.abs(time - best.endTime));
    return dist < bestDist ? block : best;
  });
}

export function framePoints(cents: number | null): 0 | 50 | 100 {
  if (cents == null) return 0;
  const error = Math.abs(cents);
  if (error <= HITBOX_GREEN_CENTS) return 100;
  if (error <= HITBOX_NEAR_CENTS) return 50;
  return 0;
}

export function totalTargetDuration(blocks: NoteBlock[]): number {
  return blocks.reduce((sum, block) => sum + Math.max(0, block.endTime - block.startTime), 0);
}

export function clampExerciseScore(earned: number, targetDurationSec: number, fps = SCORE_FPS): number {
  const maxPoints = Math.max(1, targetDurationSec * fps) * 100;
  const finalScore = (earned / maxPoints) * 100;
  if (!Number.isFinite(finalScore)) return 0;
  return Math.max(0, Math.min(100, Math.round(finalScore)));
}

export function quantizeNoteBlocks(features: PhrasePitchFeatures | null | undefined): NoteBlock[] {
  const stored = features?.blocks;
  if (Array.isArray(stored) && stored.length > 0) {
    return stored.filter(
      (block) =>
        block &&
        typeof block.startTime === "number" &&
        typeof block.endTime === "number" &&
        typeof block.startHz === "number"
    );
  }
  const times = features?.times ?? [];
  const pitches = features?.pitch_midi ?? [];
  const voiced: Array<{ t: number; midi: number }> = [];
  for (let i = 0; i < times.length; i += 1) {
    const midi = pitches[i];
    if (typeof midi === "number" && Number.isFinite(midi)) {
      voiced.push({ t: Number(times[i]), midi });
    }
  }
  if (voiced.length === 0) return [];

  const raw: Array<{ t0: number; t1: number; midis: number[] }> = [];
  let bucket: Array<{ t: number; midi: number }> = [];
  const flush = () => {
    if (bucket.length === 0) return;
    const t0 = bucket[0].t;
    const t1 = bucket[bucket.length - 1].t;
    if (t1 - t0 < MIN_BLOCK_SEC && bucket.length < 2) {
      bucket = [];
      return;
    }
    raw.push({ t0, t1, midis: bucket.map((item) => item.midi) });
    bucket = [];
  };

  for (const point of voiced) {
    if (bucket.length === 0) {
      bucket.push(point);
      continue;
    }
    const prev = bucket[bucket.length - 1];
    const gap = point.t - prev.t;
    const center = bucket.reduce((sum, item) => sum + item.midi, 0) / bucket.length;
    const cents = Math.abs(point.midi - center) * 100;
    const sameNote = Math.round(point.midi) === Math.round(center) || cents <= VIBRATO_CENTS;
    if (sameNote || gap <= GAP_MERGE_SEC) {
      if (!sameNote && gap <= GAP_MERGE_SEC) {
        flush();
        bucket.push(point);
        continue;
      }
      bucket.push(point);
      continue;
    }
    flush();
    bucket.push(point);
  }
  flush();

  const blocks: NoteBlock[] = raw.map((group) => {
    const median = group.midis.slice().sort((a, b) => a - b)[Math.floor(group.midis.length / 2)] ?? 60;
    const midi = Math.round(median);
    return {
      note: noteLabelFromMidi(midi),
      midi,
      startHz: Math.round(frequencyFromMidi(midi) * 100) / 100,
      startTime: Math.round(group.t0 * 1000) / 1000,
      endTime: Math.round(Math.max(group.t1, group.t0 + MIN_BLOCK_SEC) * 1000) / 1000,
    };
  });

  const merged: NoteBlock[] = [];
  for (const block of blocks) {
    const last = merged[merged.length - 1];
    if (last && last.midi === block.midi && block.startTime - last.endTime <= GAP_MERGE_SEC) {
      last.endTime = block.endTime;
    } else {
      merged.push({ ...block });
    }
  }
  return merged.filter((block) => block.endTime - block.startTime >= MIN_BLOCK_SEC);
}

function foldMidiToward(midi: number, around: number): number {
  let folded = midi;
  while (folded - around > 6) folded -= 12;
  while (around - folded > 6) folded += 12;
  return folded;
}

export function displayMidiForLive(
  liveHz: number | null,
  time: number,
  blocks: NoteBlock[]
): { midi: number; snapped: boolean; cents: number | null; block: NoteBlock | null } | null {
  if (liveHz == null || liveHz <= 0) return null;
  const block = blockAtTime(blocks, time);
  const liveMidi = midiFromFrequency(liveHz);
  if (!block) return { midi: liveMidi, snapped: false, cents: null, block: null };
  const cents = pitchClassCents(liveHz, block.startHz);
  if (cents <= HITBOX_GREEN_CENTS) {
    return { midi: block.midi, snapped: true, cents, block };
  }
  return {
    midi: foldMidiToward(liveMidi, block.midi),
    snapped: false,
    cents,
    block,
  };
}
