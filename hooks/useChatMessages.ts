"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getChatSessionToken, toLegacyChatMessages } from "@/lib/chat-media";
import {
  coerceChatMime,
  extensionForChatMedia,
} from "@/lib/media-mime";
import { supabase } from "@/lib/supabase";
import type { ChatMessage as LegacyChatMessage } from "@/lib/types";
import type { ChatMessage } from "@/types";

export type ChatSendPayload = {
  message?: string;
  messageType?: "text" | "voice" | "image" | "sticker" | "video";
  file?: File | null;
  mediaDurationSec?: number | null;
};

async function parseJsonResponse(response: Response) {
  const raw = await response.text();
  try {
    return JSON.parse(raw) as {
      error?: string;
      message?: ChatMessage;
      deleted?: boolean;
      messageId?: string;
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

export function useChatMessages(studentId: string | null) {
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
            studentId,
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
          { ...result.message, threadId: result.message.student_id },
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
    [mergeLegacy, sending, studentId, user]
  );

  const edit = useCallback(
    async (messageId: string, text: string) => {
      if (!studentId || !user) return;
      setError("");
      try {
        const token = await getChatSessionToken();
        if (!token) {
          setError("Сессия истекла. Войдите повторно.");
          return;
        }
        const response = await fetch("/api/chat/messages", {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messageId,
            studentId,
            message: text,
          }),
        });
        const result = await parseJsonResponse(response);
        if (!response.ok || !result.message) {
          setError(result.error ?? "Не удалось изменить сообщение");
          return;
        }
        const [mapped] = await toLegacyChatMessages([
          { ...result.message, threadId: result.message.student_id },
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
        const token = await getChatSessionToken();
        if (!token) {
          setError("Сессия истекла. Войдите повторно.");
          return;
        }
        const response = await fetch("/api/chat/messages", {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ messageId, studentId }),
        });
        const result = await parseJsonResponse(response);
        if (!response.ok) {
          setError(result.error ?? "Не удалось удалить сообщение");
          return;
        }
        if (result.message) {
          const [mapped] = await toLegacyChatMessages([
            { ...result.message, threadId: result.message.student_id },
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
