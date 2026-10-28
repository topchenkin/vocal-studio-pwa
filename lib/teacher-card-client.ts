import { supabase } from "@/lib/supabase";
import { prepareChatImageFile } from "@/lib/chat-media";
import { normalizeMimeType } from "@/lib/media-mime";
import { mapBackendError, withTimeout } from "@/lib/supabase-errors";
import {
  TEACHER_CARD_BUCKET,
  normalizeTeacherCard,
  teacherCardToRow,
  type TeacherCard,
  type TeacherMedia,
  type TeacherMediaKind,
} from "@/lib/teacher-card";

const READ_TIMEOUT_MS = 12_000;
const SAVE_TIMEOUT_MS = 20_000;
const UPLOAD_TIMEOUT_MS = 10 * 60_000;

/** Self-hosted storage FILE_SIZE_LIMIT on the VPS is 50 MB; the bucket's own limit is higher. */
export const TEACHER_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
const PHOTO_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const VIDEO_MIMES = new Set(["video/mp4", "video/quicktime", "video/webm"]);

export async function loadTeacherCard(): Promise<TeacherCard> {
  const { data, error } = await withTimeout(
    supabase
      .from("teacher_card")
      .select("full_name,headline,bio,achievements,music_links,media")
      .eq("id", 1)
      .maybeSingle(),
    READ_TIMEOUT_MS
  );
  if (error) throw new Error(mapBackendError(error, "Не удалось загрузить визитку"));
  return normalizeTeacherCard(data);
}

export async function saveTeacherCard(card: TeacherCard): Promise<void> {
  const { error } = await withTimeout(
    supabase.from("teacher_card").upsert(teacherCardToRow(card), { onConflict: "id" }),
    SAVE_TIMEOUT_MS
  );
  if (error) throw new Error(mapBackendError(error, "Не удалось сохранить визитку"));
}

function videoContentType(file: File) {
  const mime = normalizeMimeType(file.type);
  const name = file.name.toLowerCase();
  if (mime === "video/webm" || name.endsWith(".webm")) return "video/webm";
  // iPhone .mov is H.264/HEVC in an MP4-family container; serving it as mp4 lets Android Chrome play it.
  return "video/mp4";
}

export async function uploadTeacherMedia(
  kind: TeacherMediaKind,
  file: File
): Promise<TeacherMedia> {
  let body: File = file;
  let contentType: string;
  let extension: string;

  if (kind === "photo") {
    body = await prepareChatImageFile(file);
    contentType = normalizeMimeType(body.type) || "image/jpeg";
    if (!PHOTO_MIMES.has(contentType)) {
      throw new Error("Выберите фото в формате JPEG, PNG или WebP");
    }
    extension = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  } else {
    const mime = normalizeMimeType(file.type);
    if (mime && !VIDEO_MIMES.has(mime)) {
      throw new Error("Выберите видео в формате MP4, MOV или WebM");
    }
    if (file.size > TEACHER_VIDEO_MAX_BYTES) {
      throw new Error(
        "Видео больше 50 МБ. Отправьте его себе в Telegram (он сожмёт), сохраните и загрузите снова"
      );
    }
    contentType = videoContentType(file);
    extension = contentType === "video/webm" ? "webm" : "mp4";
  }

  const id = crypto.randomUUID();
  const path = `${kind}/${id}.${extension}`;
  const { error } = await withTimeout(
    supabase.storage.from(TEACHER_CARD_BUCKET).upload(path, body, {
      contentType,
      upsert: false,
      cacheControl: "31536000",
    }),
    UPLOAD_TIMEOUT_MS
  );
  if (error) {
    console.error("[uvs:teacher-card] upload failed", error);
    throw new Error(mapBackendError(error, "Не удалось загрузить файл"));
  }
  return { id, kind, path, caption: "" };
}

/** Best-effort cleanup of files dropped from the saved card; a leftover file is harmless. */
export async function removeTeacherMediaFiles(paths: string[]) {
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(TEACHER_CARD_BUCKET).remove(paths);
  if (error) console.error("[uvs:teacher-card] cleanup failed", error);
}
