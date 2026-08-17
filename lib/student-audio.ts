import { supabase } from "@/lib/supabase";
import { decodeBlobToAudioBuffer } from "@/lib/wav-client";
import { encodeMp3Blob } from "@/lib/encode-mp3";
import type { StudentAudioSource, StudentAudioTrack } from "@/types";

export const STUDENT_AUDIO_MAX_TRACKS = 10;
export const STUDENT_AUDIO_MAX_DURATION_SEC = 600;
export const STUDENT_AUDIO_BUCKET = "student-audio";

export function formatTrackDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function sourceLabel(source: StudentAudioSource): string {
  if (source === "remover_minus") return "Минусовка";
  if (source === "remover_vocal") return "Вокал";
  return "Сведение";
}

export async function countOwnAudioTracks(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from("student_audio_tracks")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function listOwnAudioTracks(userId: string): Promise<StudentAudioTrack[]> {
  const { data, error } = await supabase
    .from("student_audio_tracks")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as StudentAudioTrack[];
}

export async function signedAudioUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(STUDENT_AUDIO_BUCKET)
    .createSignedUrl(path, 60 * 60);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message || "Не удалось открыть трек");
  }
  return data.signedUrl;
}

export async function renameAudioTrack(
  trackId: string,
  title: string
): Promise<string> {
  const nextTitle = title.trim().slice(0, 120);
  if (!nextTitle) {
    throw new Error("Напишите название трека");
  }
  const { error } = await supabase
    .from("student_audio_tracks")
    .update({ title: nextTitle })
    .eq("id", trackId);
  if (error) throw new Error(error.message);
  return nextTitle;
}

export async function deleteAudioTrack(track: StudentAudioTrack): Promise<void> {
  await supabase.storage.from(STUDENT_AUDIO_BUCKET).remove([track.storage_path]);
  const { error } = await supabase
    .from("student_audio_tracks")
    .delete()
    .eq("id", track.id);
  if (error) throw new Error(error.message);
}

export async function saveAudioFromUrl(options: {
  url: string;
  source: StudentAudioSource;
  title: string;
  userId: string;
  isAdmin: boolean;
}): Promise<void> {
  const title = options.title.trim().slice(0, 120) || "Трек";
  const response = await fetch(options.url);
  if (!response.ok) {
    throw new Error("Не удалось прочитать аудиофайл");
  }
  const sourceBlob = await response.blob();
  const buffer = await decodeBlobToAudioBuffer(sourceBlob);
  const durationSec = buffer.duration;

  if (!options.isAdmin && durationSec > STUDENT_AUDIO_MAX_DURATION_SEC) {
    throw new Error("Ученикам можно сохранять трек не длиннее 10 минут");
  }

  if (!options.isAdmin) {
    const count = await countOwnAudioTracks(options.userId);
    if (count >= STUDENT_AUDIO_MAX_TRACKS) {
      throw new Error("Можно хранить 10 треков. Удалите старый в «Мои аудио»");
    }
  }

  const mp3 = await encodeMp3Blob(buffer);
  const path = `${options.userId}/${crypto.randomUUID()}.mp3`;

  const { error: uploadError } = await supabase.storage
    .from(STUDENT_AUDIO_BUCKET)
    .upload(path, mp3, {
      contentType: "audio/mpeg",
      upsert: false,
    });

  if (uploadError) {
    throw new Error(
      uploadError.message.includes("Bucket not found")
        ? "Сначала выполните SQL-миграцию student-audio в Supabase"
        : uploadError.message
    );
  }

  const { error: insertError } = await supabase.from("student_audio_tracks").insert({
    user_id: options.userId,
    source: options.source,
    title,
    duration_sec: Math.round(durationSec * 10) / 10,
    storage_path: path,
    mime: "audio/mpeg",
    size_bytes: mp3.size,
  });

  if (insertError) {
    await supabase.storage.from(STUDENT_AUDIO_BUCKET).remove([path]);
    throw new Error(insertError.message);
  }
}
