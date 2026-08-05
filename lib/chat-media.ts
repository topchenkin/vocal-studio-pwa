import { supabase } from "@/lib/supabase";
import type { ChatMessage as LegacyChatMessage } from "@/lib/types";

type MediaMessage = {
  id: string;
  threadId: string;
  sender_id: string;
  sender_name: string;
  message: string;
  created_at: string;
  message_type?: "text" | "voice" | "image" | "sticker" | "video" | "announcement" | null;
  media_path?: string | null;
  media_duration_sec?: number | null;
  edited_at?: string | null;
  deleted_at?: string | null;
};

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
        mediaUrl = data?.signedUrl ?? null;
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
