"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import type { ChatSendPayload } from "@/hooks/useChatMessages";
import { ADMIN_DISPLAY_NAME } from "@/lib/admin";
import {
  deleteChatMessageDirect,
  editChatMessageDirect,
  sendChatMessageDirect,
  toLegacyChatMessages,
} from "@/lib/chat-media";
import {
  coerceChatMime,
  extensionForChatMedia,
} from "@/lib/media-mime";
import { realtimeTopic } from "@/lib/client-instance";
import { supabase } from "@/lib/supabase";
import type { ChatMessage as LegacyChatMessage } from "@/lib/types";

async function uploadChatMedia(
  userId: string,
  messageType: "voice" | "video" | "image",
  file: File
) {
  const mime = coerceChatMime(messageType, file.type);
  const extension = extensionForChatMedia(messageType, mime, file.name);
  const path = `${userId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("chat-media").upload(path, file, {
    contentType: mime,
    upsert: false,
  });
  if (error) {
    throw new Error(
      error.message.includes("mime") || error.message.includes("pattern")
        ? `Формат файла не поддерживается (${mime}). Обновите Storage bucket chat-media.`
        : error.message
    );
  }
  return { path, mime };
}

export function useGroupChatMessages(groupId: string | null) {
  const { user, profile, isAdmin, isMockAdmin } = useAuth();
  const [messages, setMessages] = useState<LegacyChatMessage[]>([]);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  const mergeLegacy = useCallback((message: LegacyChatMessage) => {
    setMessages((current) =>
      [...current.filter((item) => item.id !== message.id), message].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      )
    );
  }, []);

  const load = useCallback(async () => {
    if (!groupId || isMockAdmin) {
      setMessages([]);
      return;
    }

    const { data, error: queryError } = await supabase
      .from("group_chat_messages")
      .select("*")
      .eq("group_id", groupId)
      .order("created_at", { ascending: true });

    if (queryError) {
      setError(`Не удалось загрузить групповой чат: ${queryError.message}`);
      return;
    }
    const mapped = await toLegacyChatMessages(
      (data ?? []).map((record) => ({
        ...record,
        threadId: record.group_id,
      }))
    );
    setMessages(mapped);
    setError("");
  }, [groupId, isMockAdmin]);

  useEffect(() => {
    void load();
    if (!groupId || isMockAdmin) return;

    const channel = supabase
      .channel(realtimeTopic(`group-chat:${groupId}`))
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "group_chat_messages",
          filter: `group_id=eq.${groupId}`,
        },
        () => {
          void load();
        }
      )
      .subscribe();

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      void supabase.removeChannel(channel);
    };
  }, [groupId, isMockAdmin, load, mergeLegacy]);

  const send = useCallback(
    async (payload: string | ChatSendPayload) => {
      if (!groupId || !user || sending) return;
      setSending(true);
      setError("");

      try {
        const data =
          typeof payload === "string"
            ? { message: payload, messageType: "text" as const }
            : payload;
        const messageType = data.messageType ?? "text";

        let mediaPath: string | undefined;
        let mediaMime: string | undefined;
        if (
          data.file &&
          (messageType === "voice" ||
            messageType === "video" ||
            messageType === "image")
        ) {
          const uploaded = await uploadChatMedia(user.id, messageType, data.file);
          mediaPath = uploaded.path;
          mediaMime = uploaded.mime;
        }

        const created = await sendChatMessageDirect({
          groupId,
          senderId: user.id,
          senderName: isAdmin
            ? ADMIN_DISPLAY_NAME
            : profile?.full_name || "Ученик",
          messageType,
          message: data.message ?? "",
          mediaDurationSec: data.mediaDurationSec ?? null,
          mediaPath: mediaPath ?? null,
          mediaMime: mediaMime ?? null,
        });
        const [mapped] = await toLegacyChatMessages([
          { ...created, threadId: groupId },
        ]);
        mergeLegacy(mapped);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Не удалось отправить сообщение"
        );
      } finally {
        setSending(false);
      }
    },
    [groupId, isAdmin, mergeLegacy, profile?.full_name, sending, user]
  );

  const edit = useCallback(
    async (messageId: string, text: string) => {
      if (!groupId || !user) return;
      setError("");
      try {
        const updated = await editChatMessageDirect(
          "group_chat_messages",
          messageId,
          text
        );
        const [mapped] = await toLegacyChatMessages([
          { ...updated, threadId: groupId },
        ]);
        mergeLegacy(mapped);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Не удалось изменить сообщение"
        );
      }
    },
    [groupId, mergeLegacy, user]
  );

  const remove = useCallback(
    async (messageId: string) => {
      if (!groupId || !user) return;
      setError("");
      try {
        const result = await deleteChatMessageDirect(
          "group_chat_messages",
          messageId
        );
        if (result.message) {
          const [mapped] = await toLegacyChatMessages([
            { ...result.message, threadId: groupId },
          ]);
          mergeLegacy(mapped);
        } else {
          setMessages((current) =>
            current.filter((item) => item.id !== messageId)
          );
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Не удалось удалить сообщение"
        );
      }
    },
    [groupId, mergeLegacy, user]
  );

  return { messages, error, sending, send, edit, remove, reload: load };
}
