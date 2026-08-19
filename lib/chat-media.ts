import { supabase } from "@/lib/supabase";
import { rewriteSupabaseAssetUrl } from "@/lib/supabase-origin";
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
      : messageType === "voice"
        ? "🎤 Голосовое сообщение"
        : messageType === "video"
          ? "🎬 Видеосообщение"
          : "📷 Фото";

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
