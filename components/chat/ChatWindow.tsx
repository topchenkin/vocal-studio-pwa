"use client";

import { useEffect, useRef, useState } from "react";
import {
  Camera,
  ImagePlus,
  Mic,
  Pause,
  Play,
  Send,
  Smile,
  Sticker,
  Trash2,
  Video,
} from "lucide-react";
import type { ChatSendPayload } from "@/hooks/useChatMessages";
import {
  mediaFileFromChunks,
  pickVideoRecorderMime,
  pickVoiceRecorderMime,
} from "@/lib/media-mime";
import { CHAT_EMOJIS, getSticker, VOCAL_CAT_STICKERS } from "@/lib/chat-stickers";
import type { ChatMessage, User } from "@/lib/types";
import { formatTime } from "@/lib/storage";

const MAX_VOICE_MS = 5 * 60 * 1000;
const MAX_VIDEO_MS = 60 * 1000;

type RecordKind = "voice" | "video";
type RecordPhase = "idle" | "recording" | "paused";

interface ChatWindowProps {
  chatId: string;
  messages: ChatMessage[];
  currentUser: User;
  onSend: (payload: string | ChatSendPayload) => void;
  placeholder?: string;
  disabled?: boolean;
}

export default function ChatWindow({
  chatId,
  messages,
  currentUser,
  onSend,
  placeholder = "Напишите сообщение...",
  disabled,
}: ChatWindowProps) {
  const [text, setText] = useState("");
  const [panel, setPanel] = useState<"none" | "emoji" | "sticker">("none");
  const [phase, setPhase] = useState<RecordPhase>("idle");
  const [recordKind, setRecordKind] = useState<RecordKind>("voice");
  const [recordMs, setRecordMs] = useState(0);
  const [recordError, setRecordError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const accumulatedMsRef = useRef(0);
  const segmentStartedRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const preferredMimeRef = useRef("");
  const sendOnStopRef = useRef(false);
  const recordKindRef = useRef<RecordKind>("voice");
  const durationMsRef = useRef(0);

  const chatMessages = messages.filter((m) => m.chatId === chatId);
  const canSendText = Boolean(text.trim());
  const maxMs = recordKind === "video" ? MAX_VIDEO_MS : MAX_VOICE_MS;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages.length]);

  useEffect(() => {
    if (phase === "idle" || recordKind !== "video") return;
    const el = previewRef.current;
    const stream = streamRef.current;
    if (!el || !stream) return;
    el.srcObject = stream;
    el.muted = true;
    void el.play().catch(() => undefined);
    return () => {
      el.srcObject = null;
    };
  }, [phase, recordKind]);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    []
  );

  const clearTimer = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const startTimer = () => {
    clearTimer();
    timerRef.current = window.setInterval(() => {
      const elapsed = accumulatedMsRef.current + (Date.now() - segmentStartedRef.current);
      setRecordMs(elapsed);
      if (elapsed >= (recordKindRef.current === "video" ? MAX_VIDEO_MS : MAX_VOICE_MS)) {
        sendRecording();
      }
    }, 200);
  };

  const handleSendText = () => {
    if (!text.trim() || disabled) return;
    onSend({ message: text.trim(), messageType: "text" });
    setText("");
    setPanel("none");
  };

  const sendImage = (file: File | null | undefined) => {
    if (!file || disabled) return;
    onSend({ messageType: "image", file, message: "" });
  };

  const resetRecordingState = () => {
    clearTimer();
    setPhase("idle");
    setRecordMs(0);
    accumulatedMsRef.current = 0;
    segmentStartedRef.current = 0;
    if (previewRef.current) {
      previewRef.current.srcObject = null;
    }
  };

  const cancelRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) {
      resetRecordingState();
      return;
    }
    sendOnStopRef.current = false;
    recorder.ondataavailable = null;
    recorder.onstop = () => {
      chunksRef.current = [];
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      mediaRecorderRef.current = null;
    };
    if (recorder.state !== "inactive") recorder.stop();
    resetRecordingState();
  };

  const pauseRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    recorder.pause();
    accumulatedMsRef.current += Date.now() - segmentStartedRef.current;
    clearTimer();
    setPhase("paused");
    setRecordMs(accumulatedMsRef.current);
  };

  const resumeRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "paused") return;
    recorder.resume();
    segmentStartedRef.current = Date.now();
    setPhase("recording");
    startTimer();
  };

  const sendRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    if (recorder.state === "recording") {
      accumulatedMsRef.current += Date.now() - segmentStartedRef.current;
    }
    durationMsRef.current = accumulatedMsRef.current;
    sendOnStopRef.current = true;
    if (recorder.state !== "inactive") recorder.stop();
    resetRecordingState();
  };

  const startRecording = async (kind: RecordKind) => {
    setRecordError("");
    setPanel("none");
    setRecordKind(kind);
    recordKindRef.current = kind;
    try {
      if (typeof MediaRecorder === "undefined") {
        setRecordError("Запись не поддерживается в этом браузере");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia(
        kind === "video"
          ? { audio: true, video: { facingMode: "user" } }
          : { audio: true }
      );
      streamRef.current = stream;
      const preferredMime =
        kind === "video" ? pickVideoRecorderMime() : pickVoiceRecorderMime();
      preferredMimeRef.current = preferredMime;
      const recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      mediaRecorderRef.current = recorder;
      accumulatedMsRef.current = 0;
      segmentStartedRef.current = Date.now();
      sendOnStopRef.current = false;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const shouldSend = sendOnStopRef.current;
        const kindNow = recordKindRef.current;
        const durationSec = Math.max(
          1,
          Math.round(durationMsRef.current / 1000) || 1
        );
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        mediaRecorderRef.current = null;
        if (!shouldSend || chunksRef.current.length === 0) {
          chunksRef.current = [];
          return;
        }
        const maxSec = kindNow === "video" ? 60 : 300;
        if (durationSec > maxSec) {
          setRecordError(
            kindNow === "video"
              ? "Видеосообщение не длиннее 1 минуты"
              : "Голосовое сообщение не длиннее 5 минут"
          );
          chunksRef.current = [];
          return;
        }
        const file = mediaFileFromChunks(
          chunksRef.current,
          recorder.mimeType || preferredMimeRef.current,
          kindNow
        );
        onSend({
          messageType: kindNow,
          file,
          mediaDurationSec: durationSec,
          message: "",
        });
        chunksRef.current = [];
      };

      recorder.start(250);
      setPhase("recording");
      setRecordMs(0);
      startTimer();
    } catch {
      setRecordError(
        kind === "video"
          ? "Нужен доступ к камере и микрофону"
          : "Нужен доступ к микрофону"
      );
    }
  };

  const formatRecordTime = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl bg-studio-surface ring-1 ring-studio-border">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {chatMessages.length === 0 ? (
          <p className="py-8 text-center text-sm text-studio-muted">
            Начните диалог
          </p>
        ) : (
          chatMessages.map((msg) => {
            const isOwn = msg.senderId === currentUser.id;
            const sticker = msg.stickerId ? getSticker(msg.stickerId) : null;
            const isAnnouncement = msg.messageType === "announcement";
            return (
              <div
                key={msg.id}
                className={`flex ${
                  isAnnouncement
                    ? "justify-center"
                    : isOwn
                      ? "justify-end"
                      : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                    isAnnouncement
                      ? "w-full max-w-md border border-amber-400/40 bg-gradient-to-br from-amber-500/15 via-studio-card to-studio-gold/10 text-studio-text shadow-[inset_0_1px_0_rgba(251,191,36,0.2)]"
                      : isOwn
                        ? "bg-studio-accent/20 text-studio-text"
                        : "bg-studio-card text-studio-muted"
                  }`}
                >
                  {isAnnouncement ? (
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                      Уведомление · {msg.senderName}
                    </p>
                  ) : !isOwn ? (
                    <p className="mb-0.5 text-[10px] font-medium text-studio-accent">
                      {msg.senderName}
                    </p>
                  ) : null}
                  {msg.messageType === "sticker" && sticker ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={sticker.src}
                      alt={sticker.label}
                      className="h-28 w-28 object-contain"
                    />
                  ) : msg.messageType === "image" && msg.mediaUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={msg.mediaUrl}
                      alt="Фото в чате"
                      className="max-h-56 rounded-xl object-cover"
                    />
                  ) : msg.messageType === "video" && msg.mediaUrl ? (
                    <div className="space-y-1">
                      <video
                        controls
                        playsInline
                        src={msg.mediaUrl}
                        className="h-48 w-48 rounded-full object-cover"
                      />
                      {msg.mediaDurationSec ? (
                        <p className="text-center text-[10px] opacity-60">
                          {msg.mediaDurationSec} сек
                        </p>
                      ) : null}
                    </div>
                  ) : msg.messageType === "voice" && msg.mediaUrl ? (
                    <div className="space-y-1">
                      <audio controls src={msg.mediaUrl} className="max-w-full" />
                      {msg.mediaDurationSec ? (
                        <p className="text-[10px] opacity-60">
                          {msg.mediaDurationSec} сек
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap text-sm">{msg.text}</p>
                  )}
                  <p className="mt-1 text-[10px] opacity-60">
                    {formatTime(msg.createdAt)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {!disabled && (
        <div className="shrink-0 border-t border-studio-border p-3">
          {panel === "emoji" && (
            <div className="mb-2 grid max-h-32 grid-cols-8 gap-1 overflow-y-auto rounded-xl bg-studio-card p-2">
              {CHAT_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="rounded-lg p-1 text-lg hover:bg-studio-surface"
                  onClick={() => setText((current) => current + emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
          {panel === "sticker" && (
            <div className="mb-2 grid max-h-40 grid-cols-4 gap-2 overflow-y-auto rounded-xl bg-studio-card p-2">
              {VOCAL_CAT_STICKERS.map((sticker) => (
                <button
                  key={sticker.id}
                  type="button"
                  className="rounded-xl bg-studio-surface p-2 text-center transition hover:ring-1 hover:ring-studio-accent"
                  onClick={() => {
                    onSend({
                      messageType: "sticker",
                      message: sticker.id,
                    });
                    setPanel("none");
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={sticker.src}
                    alt={sticker.label}
                    className="mx-auto h-14 w-14 object-contain"
                  />
                  <span className="mt-1 block text-[10px] text-studio-muted">
                    {sticker.label}
                  </span>
                </button>
              ))}
            </div>
          )}

          {phase !== "idle" ? (
            <div className="space-y-2">
              {recordKind === "video" && (
                <div className="mx-auto flex h-44 w-44 items-center justify-center overflow-hidden rounded-full bg-black ring-2 ring-red-400/50">
                  <video
                    ref={previewRef}
                    muted
                    playsInline
                    autoPlay
                    className="h-full w-full scale-x-[-1] object-cover"
                  />
                </div>
              )}
              <div className="flex items-center gap-2 rounded-2xl bg-red-500/10 px-2 py-1.5 ring-1 ring-red-500/25">
                <button
                  type="button"
                  onClick={cancelRecording}
                  className="flex h-10 w-10 items-center justify-center rounded-xl text-red-400 transition hover:bg-red-500/15"
                  aria-label="Отменить"
                  title="Отменить"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={phase === "paused" ? resumeRecording : pauseRecording}
                  className="flex h-10 w-10 items-center justify-center rounded-xl text-studio-text transition hover:bg-studio-card"
                  aria-label={phase === "paused" ? "Продолжить" : "Стоп / пауза"}
                  title={phase === "paused" ? "Продолжить" : "Стоп"}
                >
                  {phase === "paused" ? (
                    <Play className="h-5 w-5 fill-current" />
                  ) : (
                    <Pause className="h-5 w-5 fill-current" />
                  )}
                </button>
                <div className="flex min-w-0 flex-1 items-center gap-2 px-1">
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full bg-red-400 ${
                      phase === "recording" ? "animate-pulse" : "opacity-40"
                    }`}
                  />
                  <p className="truncate font-mono text-sm tabular-nums text-red-300">
                    {formatRecordTime(recordMs)}
                    <span className="text-red-300/50">
                      {" "}
                      / {formatRecordTime(maxMs)}
                    </span>
                  </p>
                  {phase === "paused" && (
                    <span className="text-[10px] uppercase tracking-wide text-studio-muted">
                      пауза
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={sendRecording}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-studio-accent text-white shadow-sm transition hover:opacity-90"
                  aria-label="Отправить"
                  title="Отправить"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-2 flex gap-1">
                <ComposerIcon
                  active={panel === "emoji"}
                  label="Смайлики"
                  onClick={() =>
                    setPanel((current) => (current === "emoji" ? "none" : "emoji"))
                  }
                >
                  <Smile className="h-4 w-4" />
                </ComposerIcon>
                <ComposerIcon
                  active={panel === "sticker"}
                  label="Стикеры котиков"
                  onClick={() =>
                    setPanel((current) =>
                      current === "sticker" ? "none" : "sticker"
                    )
                  }
                >
                  <Sticker className="h-4 w-4" />
                </ComposerIcon>
                <ComposerIcon
                  label="Фото из галереи"
                  onClick={() => galleryRef.current?.click()}
                >
                  <ImagePlus className="h-4 w-4" />
                </ComposerIcon>
                <ComposerIcon
                  label="Сделать фото"
                  onClick={() => cameraRef.current?.click()}
                >
                  <Camera className="h-4 w-4" />
                </ComposerIcon>
                <ComposerIcon
                  label="Видеосообщение"
                  onClick={() => void startRecording("video")}
                >
                  <Video className="h-4 w-4" />
                </ComposerIcon>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendText()}
                  placeholder={placeholder}
                  className="min-w-0 flex-1 rounded-xl bg-studio-card px-4 py-2.5 text-sm ring-1 ring-studio-border focus:outline-none focus:ring-studio-accent"
                />
                {canSendText ? (
                  <button
                    type="button"
                    onClick={handleSendText}
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-studio-accent text-white transition hover:opacity-90"
                    aria-label="Отправить"
                    title="Отправить"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void startRecording("voice")}
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-studio-accent text-white transition hover:opacity-90"
                    aria-label="Записать голосовое"
                    title="Голосовое"
                  >
                    <Mic className="h-4 w-4" />
                  </button>
                )}
              </div>
            </>
          )}
          {recordError && (
            <p className="mt-2 text-xs text-red-400">{recordError}</p>
          )}
          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              sendImage(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(event) => {
              sendImage(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </div>
      )}
    </div>
  );
}

function ComposerIcon({
  children,
  onClick,
  label,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`rounded-lg p-2 transition ${
        active
          ? "bg-studio-accent/20 text-studio-accent-light"
          : "text-studio-muted hover:bg-studio-card hover:text-studio-text"
      }`}
    >
      {children}
    </button>
  );
}
