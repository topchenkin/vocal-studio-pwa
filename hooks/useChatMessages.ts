"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
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
import { supabase } from "@/lib/supabase";
import type { ChatMessage as LegacyChatMessage } from "@/lib/types";

export type ChatSendPayload = {
  message?: string;
  messageType?: "text" | "voice" | "image" | "sticker" | "video";
  file?: File | null;
  mediaDurationSec?: number | null;
};

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

export function useChatMessages(studentId: string | null) {
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
    if (!studentId || isMockAdmin) {
      setMessages([]);
      return;
    }

    const { data, error: queryError } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("student_id", studentId)
      .order("created_at", { ascending: true });

    if (queryError) {
      setError(`Не удалось загрузить чат: ${queryError.message}`);
      return;
    }
    const mapped = await toLegacyChatMessages(
      (data ?? []).map((record) => ({
        ...record,
        threadId: record.student_id,
      }))
    );
    setMessages(mapped);
    setError("");
  }, [isMockAdmin, studentId]);

  useEffect(() => {
    void load();
    if (!studentId || isMockAdmin) return;

    const channel = supabase
      .channel(`chat:${studentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_messages",
          filter: `student_id=eq.${studentId}`,
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
  }, [isMockAdmin, load, mergeLegacy, studentId]);

  const send = useCallback(
    async (payload: string | ChatSendPayload) => {
      if (!studentId || !user || sending) return;
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
          studentId,
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
          { ...created, threadId: studentId },
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
    [isAdmin, mergeLegacy, profile?.full_name, sending, studentId, user]
  );

  const edit = useCallback(
    async (messageId: string, text: string) => {
      if (!studentId || !user) return;
      setError("");
      try {
        const updated = await editChatMessageDirect(
          "chat_messages",
          messageId,
          text
        );
        const [mapped] = await toLegacyChatMessages([
          { ...updated, threadId: studentId },
        ]);
        mergeLegacy(mapped);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Не удалось изменить сообщение"
        );
      }
    },
    [mergeLegacy, studentId, user]
  );

  const remove = useCallback(
    async (messageId: string) => {
      if (!studentId || !user) return;
      setError("");
      try {
        const result = await deleteChatMessageDirect(
          "chat_messages",
          messageId
        );
        if (result.message) {
          const [mapped] = await toLegacyChatMessages([
            { ...result.message, threadId: studentId },
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
    [mergeLegacy, studentId, user]
  );

  return { messages, error, sending, send, edit, remove, reload: load };
}
