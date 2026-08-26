import { supabase } from "@/lib/supabase";
import {
  clampBpm,
  isChordInstrument,
  isChordVibe,
  isGroove,
  isLoopLength,
  isRootKey,
  type ChordLoopSettings,
} from "@/lib/chord-loop";
import type { ChordLoopPreset } from "@/types";

export const CHORD_LOOP_PRESET_MAX = 24;

function asSettings(row: ChordLoopPreset): ChordLoopSettings | null {
  if (!isRootKey(row.root)) return null;
  if (row.mode !== "major" && row.mode !== "minor") return null;
  if (!isChordVibe(row.vibe)) return null;
  if (!isLoopLength(row.loop_length)) return null;
  if (!isGroove(row.groove)) return null;
  const instrument = row.instrument === "strings" ? "piano" : row.instrument;
  if (!isChordInstrument(instrument)) return null;
  return {
    root: row.root,
    mode: row.mode,
    vibe: row.vibe,
    length: row.loop_length,
    groove: row.groove,
    bpm: clampBpm(row.bpm),
    instrument,
  };
}

export function presetToSettings(row: ChordLoopPreset): ChordLoopSettings | null {
  return asSettings(row);
}

export async function listChordLoopPresets(
  userId: string
): Promise<ChordLoopPreset[]> {
  const { data, error } = await supabase
    .from("chord_loop_presets")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ChordLoopPreset[];
}

export async function saveChordLoopPreset(options: {
  userId: string;
  name: string;
  settings: ChordLoopSettings;
}): Promise<ChordLoopPreset> {
  const name = options.name.trim().slice(0, 80);
  if (!name) throw new Error("Напишите название пресета");

  const existing = await listChordLoopPresets(options.userId);
  if (existing.length >= CHORD_LOOP_PRESET_MAX) {
    throw new Error("Можно сохранить до 24 пресетов. Удалите старый.");
  }

  const { data, error } = await supabase
    .from("chord_loop_presets")
    .insert({
      user_id: options.userId,
      name,
      root: options.settings.root,
      mode: options.settings.mode,
      vibe: options.settings.vibe,
      loop_length: options.settings.length,
      groove: options.settings.groove,
      bpm: clampBpm(options.settings.bpm),
      instrument: options.settings.instrument,
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(error?.message || "Не удалось сохранить пресет");
  }
  return data as ChordLoopPreset;
}

export async function deleteChordLoopPreset(id: string): Promise<void> {
  const { error } = await supabase.from("chord_loop_presets").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
