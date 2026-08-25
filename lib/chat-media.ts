import { supabase } from "@/lib/supabase";
import { rewriteSupabaseAssetUrl } from "@/lib/supabase-origin";
import {
  coerceChatMime,
  extensionForChatMedia,
  normalizeMimeType,
} from "@/lib/media-mime";
import type { ChatMessage as LegacyChatMessage } from "@/lib/types";
import type { ChatMessage, GroupChatMessage } from "@/types";

type MediaMessage = {
  id: string;
  threadId: string;
  sender_id: string;
  sender_name: string;
  message: string;
  created_at: string;
  message_type?: "text" | "voice" | "image" | "sticker" | "video" | "announcement" | "vocal_report" | null;
  media_path?: string | null;
  media_duration_sec?: number | null;
  edited_at?: string | null;
  deleted_at?: string | null;
};

type ChatTable = "chat_messages" | "group_chat_messages";
type DbChatRow = ChatMessage | GroupChatMessage;

export async function toLegacyChatMessages(
  records: MediaMessage[]
): Promise<LegacyChatMessage[]> {
  return Promise.all(
    records.map(async (record) => {
      let mediaUrl: string | null = null;
      if (record.media_path && !record.deleted_at) {
        const { data } = await supabase.storage
          .from("chat-media")
          .createSignedUrl(record.media_path, 60 * 60);
        mediaUrl = rewriteSupabaseAssetUrl(data?.signedUrl) || null;
      }
      const messageType = record.message_type ?? "text";
      const deleted = Boolean(record.deleted_at);
      return {
        id: record.id,
        chatId: record.threadId,
        senderId: record.sender_id,
        senderName: record.sender_name,
        text: deleted ? "" : record.message,
        createdAt: record.created_at,
        messageType: deleted ? "text" : messageType,
        mediaUrl: deleted ? null : mediaUrl,
        mediaDurationSec: deleted ? null : record.media_duration_sec ?? null,
        stickerId:
          !deleted && messageType === "sticker" ? record.message : null,
        editedAt: record.edited_at ?? null,
        deletedAt: record.deleted_at ?? null,
      };
    })
  );
}

export async function getChatSessionToken() {
  let {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.expires_at || session.expires_at * 1000 < Date.now() + 60_000) {
    const { data } = await supabase.auth.refreshSession();
    session = data.session;
  }
  return session?.access_token ?? null;
}

const CHAT_MEDIA_MAX_BYTES = 40 * 1024 * 1024;
const IMAGE_MAX_EDGE = 1600;

async function prepareChatImageFile(file: File): Promise<File> {
  const mime = normalizeMimeType(file.type);
  const needsConvert =
    !mime ||
    mime.includes("heic") ||
    mime.includes("heif") ||
    file.name.toLowerCase().endsWith(".heic") ||
    file.name.toLowerCase().endsWith(".heif");

  const canUseBitmap = typeof createImageBitmap === "function";
  if (!needsConvert && mime.startsWith("image/") && file.size < 1.5 * 1024 * 1024) {
    return file;
  }
  if (!canUseBitmap && !needsConvert) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((value) => resolve(value), "image/jpeg", 0.82);
    });
    if (!blob) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "photo"}.jpg`, {
      type: "image/jpeg",
    });
  } catch {
    if (needsConvert) {
      throw new Error("Этот формат фото не поддерживается. Выберите JPEG или PNG");
    }
    return file;
  }
}

export async function uploadChatMediaFile(
  userId: string,
  messageType: "voice" | "video" | "image",
  file: File
): Promise<{ path: string; mime: string }> {
  const prepared =
    messageType === "image" ? await prepareChatImageFile(file) : file;
  if (prepared.size > CHAT_MEDIA_MAX_BYTES) {
    throw new Error("Файл слишком большой (максимум 40 МБ)");
  }
  if (prepared.size < 32) {
    throw new Error("Не удалось записать файл. Попробуйте ещё раз");
  }
  const mime = coerceChatMime(messageType, prepared.type);
  const extension = extensionForChatMedia(messageType, mime, prepared.name);
  const body =
    prepared.type === mime
      ? prepared
      : new File([prepared], `${messageType}.${extension}`, { type: mime });
  const path = `${userId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("chat-media").upload(path, body, {
    contentType: mime,
    upsert: false,
    cacheControl: "3600",
  });
  if (error) {
    throw new Error(
      error.message.includes("mime") ||
        error.message.includes("pattern") ||
        error.message.includes("not supported")
        ? `Формат файла не поддерживается (${mime}). Выполните SQL chat-media-mimes в Supabase.`
        : error.message
    );
  }
  return { path, mime };
}

type SendMessageType = "text" | "voice" | "image" | "sticker" | "video";

/** Client-side send — GitHub Pages has no Next API (POST → 405/HTML error). */
export async function sendChatMessageDirect(input: {
  studentId?: string;
  groupId?: string;
  senderId: string;
  senderName: string;
  messageType?: SendMessageType;
  message?: string;
  mediaPath?: string | null;
  mediaMime?: string | null;
  mediaDurationSec?: number | null;
}): Promise<DbChatRow> {
  const messageType = input.messageType ?? "text";
  const text = input.message?.trim() ?? "";
  if ((!input.studentId && !input.groupId) || (input.studentId && input.groupId)) {
    throw new Error("Некорректный чат");
  }
  if (messageType === "text" && (!text || text.length > 2000)) {
    throw new Error("Введите сообщение");
  }
  if (messageType === "sticker" && !text) {
    throw new Error("Sticker id required");
  }
  if (
    (messageType === "voice" ||
      messageType === "video" ||
      messageType === "image") &&
    !input.mediaPath
  ) {
    throw new Error("Файл не загружен");
  }

  const payloadMessage =
    messageType === "text" || messageType === "sticker"
      ? text
      : text ||
        (messageType === "voice"
          ? "🎤 Голосовое сообщение"
          : messageType === "video"
            ? "🎬 Видеосообщение"
            : "📷 Фото");

  if (input.groupId) {
    const { data, error } = await supabase
      .from("group_chat_messages")
      .insert({
        group_id: input.groupId,
        sender_id: input.senderId,
        sender_name: input.senderName,
        message: payloadMessage,
        message_type: messageType,
        media_path: input.mediaPath ?? null,
        media_mime: input.mediaMime ?? null,
        media_duration_sec: input.mediaDurationSec ?? null,
      })
      .select("*")
      .single();
    if (error || !data) {
      throw new Error(error?.message || "Не удалось отправить сообщение");
    }
    return data;
  }

  const { data, error } = await supabase
    .from("chat_messages")
    .insert({
      student_id: input.studentId!,
      sender_id: input.senderId,
      sender_name: input.senderName,
      message: payloadMessage,
      message_type: messageType,
      media_path: input.mediaPath ?? null,
      media_mime: input.mediaMime ?? null,
      media_duration_sec: input.mediaDurationSec ?? null,
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(error?.message || "Не удалось отправить сообщение");
  }
  return data;
}

/** Client-side edit — GitHub Pages has no Next API (PATCH → 405). */
export async function editChatMessageDirect(
  table: ChatTable,
  messageId: string,
  text: string
): Promise<DbChatRow> {
  const trimmed = text.trim();
  if (!messageId || !trimmed || trimmed.length > 2000) {
    throw new Error("Некорректный текст сообщения");
  }

  const { data: existing, error: loadError } = await supabase
    .from(table)
    .select("*")
    .eq("id", messageId)
    .maybeSingle();

  if (loadError) throw new Error(loadError.message);
  if (!existing) throw new Error("Сообщение не найдено");
  if (existing.deleted_at) throw new Error("Сообщение удалено");
  if (existing.message_type && existing.message_type !== "text") {
    throw new Error("Можно редактировать только текстовые сообщения");
  }

  const now = new Date().toISOString();
  const withEdited = await supabase
    .from(table)
    .update({ message: trimmed, edited_at: now })
    .eq("id", messageId)
    .select("*")
    .single();

  if (!withEdited.error && withEdited.data) return withEdited.data;

  const fallback = await supabase
    .from(table)
    .update({ message: trimmed })
    .eq("id", messageId)
    .select("*")
    .single();

  if (fallback.error || !fallback.data) {
    throw new Error(
      fallback.error?.message ||
        withEdited.error?.message ||
        "Не удалось изменить сообщение. Выполните SQL из supabase-migrations."
    );
  }
  return fallback.data;
}

/** Client-side soft/hard delete — GitHub Pages has no Next API (DELETE → 405). */
export async function deleteChatMessageDirect(
  table: ChatTable,
  messageId: string
): Promise<{ message?: DbChatRow; deleted?: boolean; messageId: string }> {
  if (!messageId) throw new Error("messageId required");

  const { data: existing, error: loadError } = await supabase
    .from(table)
    .select("*")
    .eq("id", messageId)
    .maybeSingle();

  if (loadError) throw new Error(loadError.message);
  if (!existing) throw new Error("Сообщение не найдено");

  const now = new Date().toISOString();
  const soft = await supabase
    .from(table)
    .update({
      deleted_at: now,
      message: "",
      media_path: null,
      media_mime: null,
      media_duration_sec: null,
      message_type: "text" as const,
    })
    .eq("id", messageId)
    .select("*")
    .single();

  if (!soft.error && soft.data) {
    return { message: soft.data, messageId };
  }

  const hard = await supabase.from(table).delete().eq("id", messageId);
  if (hard.error) {
    throw new Error(
      hard.error.message ||
        soft.error?.message ||
        "Не удалось удалить сообщение. Выполните SQL из supabase-migrations."
    );
  }
  return { deleted: true, messageId };
}
