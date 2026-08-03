"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import type { ChatSendPayload } from "@/hooks/useChatMessages";
import { getChatSessionToken, toLegacyChatMessages } from "@/lib/chat-media";
import {
  coerceChatMime,
  extensionForChatMedia,
} from "@/lib/media-mime";
import { supabase } from "@/lib/supabase";
import type { ChatMessage as LegacyChatMessage } from "@/lib/types";
import type { GroupChatMessage } from "@/types";

async function parseJsonResponse(response: Response) {
  const raw = await response.text();
  try {
    return JSON.parse(raw) as {
      error?: string;
      message?: GroupChatMessage;
    };
  } catch {
    throw new Error(
      raw.trim().slice(0, 180) ||
        `Сервер вернул ошибку (${response.status})`
    );
  }
}

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
  const { user, isMockAdmin } = useAuth();
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
      .channel(`group-chat:${groupId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "group_chat_messages",
          filter: `group_id=eq.${groupId}`,
        },
        (payload) => {
          void toLegacyChatMessages([
            {
              ...(payload.new as GroupChatMessage),
              threadId: (payload.new as GroupChatMessage).group_id,
            },
          ]).then(([message]) => mergeLegacy(message));
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
        const token = await getChatSessionToken();
        if (!token) {
          setError("Сессия истекла. Войдите повторно.");
          return;
        }

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

        const response = await fetch("/api/chat/messages", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            groupId,
            messageType,
            message: data.message ?? "",
            mediaDurationSec: data.mediaDurationSec ?? null,
            mediaPath: mediaPath ?? null,
            mediaMime: mediaMime ?? null,
          }),
        });
        const result = await parseJsonResponse(response);

        if (!response.ok || !result.message) {
          setError(result.error ?? "Не удалось отправить сообщение");
          return;
        }
        const [mapped] = await toLegacyChatMessages([
          { ...result.message, threadId: result.message.group_id },
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
    [groupId, mergeLegacy, sending, user]
  );

  return { messages, error, sending, send, reload: load };
}
