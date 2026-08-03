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
};

export async function toLegacyChatMessages(
  records: MediaMessage[]
): Promise<LegacyChatMessage[]> {
  return Promise.all(
    records.map(async (record) => {
      let mediaUrl: string | null = null;
      if (record.media_path) {
        const { data } = await supabase.storage
          .from("chat-media")
          .createSignedUrl(record.media_path, 60 * 60);
        mediaUrl = data?.signedUrl ?? null;
      }
      const messageType = record.message_type ?? "text";
      return {
        id: record.id,
        chatId: record.threadId,
        senderId: record.sender_id,
        senderName: record.sender_name,
        text: record.message,
        createdAt: record.created_at,
        messageType,
        mediaUrl,
        mediaDurationSec: record.media_duration_sec ?? null,
        stickerId: messageType === "sticker" ? record.message : null,
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
