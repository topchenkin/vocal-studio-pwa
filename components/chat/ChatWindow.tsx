"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  Camera,
  ImagePlus,
  Mic,
  Pause,
  Pencil,
  Play,
  Send,
  Smile,
  Sticker,
  Trash2,
  Video,
} from "lucide-react";
import type { ChatSendPayload } from "@/hooks/useChatMessages";
import {
  attachPreviewStream,
  chatCaptureErrorMessage,
  createChatRecorder,
  getChatMediaStream,
  startChatRecorder,
  stopMediaStream,
  unlockInlineVideo,
} from "@/lib/chat-capture";
import { armIosCapture, cancelArmedIosCapture } from "@/lib/ios-audio-session";
import { isAppleWebKit } from "@/lib/mic-audio";
import { mediaFileFromChunks } from "@/lib/media-mime";
import { CHAT_EMOJIS, getSticker, VOCAL_CAT_STICKERS } from "@/lib/chat-stickers";
import type { ChatMessage, User } from "@/lib/types";
import { formatTime } from "@/lib/storage";
import MediaAudio from "@/components/media/MediaAudio";
import VocalReportCard from "@/components/ai/VocalReportCard";
import {
  isVocalReportText,
  parseVocalReportPayload,
} from "@/lib/vocal-report-payload";
import { isExerciseResultText } from "@/lib/exercise-result-payload";

const MAX_VOICE_MS = 5 * 60 * 1000;
const MAX_VIDEO_MS = 60 * 1000;

type RecordKind = "voice" | "video";
type RecordPhase = "idle" | "recording" | "paused" | "sending";

interface ChatWindowProps {
  chatId: string;
  messages: ChatMessage[];
  currentUser: User;
  onSend: (payload: string | ChatSendPayload) => void;
  onEdit?: (messageId: string, text: string) => void;
  onDelete?: (messageId: string) => void;
  placeholder?: string;
  disabled?: boolean;
  flush?: boolean;
  sendError?: string;
  sending?: boolean;
  focusMessageId?: string | null;
}

export default function ChatWindow({
  chatId,
  messages,
  currentUser,
  onSend,
  onEdit,
  onDelete,
  placeholder = "Напишите сообщение...",
  disabled,
  flush = false,
  sendError,
  sending,
  focusMessageId,
}: ChatWindowProps) {
  const [text, setText] = useState("");
  const [panel, setPanel] = useState<"none" | "emoji" | "sticker">("none");
  const [editingId, setEditingId] = useState<string | null>(null);
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

  const focusedId =
    focusMessageId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      focusMessageId
    )
      ? focusMessageId
      : null;

  useEffect(() => {
    if (!focusedId) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    const node = document.querySelector(`[data-message-id="${focusedId}"]`);
    if (node) {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages.length, focusedId]);

  useEffect(() => {
    if (phase === "idle" || recordKind !== "video") return;
    const el = previewRef.current;
    const stream = streamRef.current;
    if (!el || !stream) return;
    if (el.srcObject !== stream) {
      void attachPreviewStream(el, stream);
    }
    // Do not clear srcObject on cleanup: iOS goes permanently black if we
    // detach/reattach when phase flips recording ↔ paused (Strict Mode too).
  }, [phase, recordKind]);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      stopMediaStream(streamRef.current);
      streamRef.current = null;
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
    if (editingId && onEdit) {
      onEdit(editingId, text.trim());
      setEditingId(null);
      setText("");
      setPanel("none");
      return;
    }
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
      stopMediaStream(streamRef.current);
      streamRef.current = null;
      mediaRecorderRef.current = null;
    };
    if (recorder.state !== "inactive") recorder.stop();
    resetRecordingState();
  };

  const pauseRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    try {
      recorder.pause();
    } catch {
      return;
    }
    accumulatedMsRef.current += Date.now() - segmentStartedRef.current;
    clearTimer();
    setPhase("paused");
    setRecordMs(accumulatedMsRef.current);
  };

  const resumeRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "paused") return;
    try {
      recorder.resume();
    } catch {
      return;
    }
    segmentStartedRef.current = Date.now();
    setPhase("recording");
    startTimer();
  };

  const sendRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    if (recorder.state === "recording") {
      accumulatedMsRef.current += Date.now() - segmentStartedRef.current;
    }
    durationMsRef.current = accumulatedMsRef.current;
    sendOnStopRef.current = true;
    clearTimer();
    setPhase("sending");
    try {
      if (recorder.state === "recording") recorder.requestData();
    } catch {
      /* Safari may not implement requestData */
    }
    try {
      recorder.stop();
    } catch {
      setRecordError("Не удалось завершить запись");
      resetRecordingState();
    }
  };

  const startRecording = async (kind: RecordKind) => {
    setRecordError("");
    setPanel("none");
    recordKindRef.current = kind;
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    try {
      if (typeof MediaRecorder === "undefined") {
        setRecordError("Запись не поддерживается в этом браузере");
        return;
      }
      armIosCapture();
      if (kind === "video") {
        // Mount a visible preview <video> during the tap. iOS will not start
        // the camera on a missing / display:none element.
        flushSync(() => {
          setRecordKind("video");
          setPhase("recording");
          setRecordMs(0);
        });
        if (previewRef.current) {
          unlockInlineVideo(previewRef.current);
        }
      } else {
        setRecordKind("voice");
      }

      const stream = await getChatMediaStream(kind, previewRef.current);
      streamRef.current = stream;

      if (kind === "video" && previewRef.current) {
        void attachPreviewStream(previewRef.current, stream);
      }

      const { recorder, mime } = createChatRecorder(stream, kind);
      preferredMimeRef.current = mime;
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
        stopMediaStream(stream);
        streamRef.current = null;
        mediaRecorderRef.current = null;
        if (!shouldSend || chunksRef.current.length === 0) {
          chunksRef.current = [];
          resetRecordingState();
          if (shouldSend) {
            setRecordError("Запись получилась пустой. Попробуйте ещё раз");
          }
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
          resetRecordingState();
          return;
        }
        const file = mediaFileFromChunks(
          chunksRef.current,
          recorder.mimeType || preferredMimeRef.current,
          kindNow
        );
        chunksRef.current = [];
        resetRecordingState();
        if (file.size < 32) {
          setRecordError("Запись получилась пустой. Попробуйте ещё раз");
          return;
        }
        onSend({
          messageType: kindNow,
          file,
          mediaDurationSec: durationSec,
          message: "",
        });
      };

      startChatRecorder(recorder, kind);
      setPhase("recording");
      setRecordMs(0);
      startTimer();
    } catch (err) {
      cancelArmedIosCapture();
      stopMediaStream(streamRef.current);
      streamRef.current = null;
      mediaRecorderRef.current = null;
      resetRecordingState();
      setRecordError(chatCaptureErrorMessage(kind, err));
    }
  };

  const formatRecordTime = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div
      className={`flex h-full min-h-0 flex-col ${
        flush
          ? "bg-transparent"
          : "rounded-2xl bg-studio-surface ring-1 ring-studio-border"
      }`}
    >
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
            const isDeleted = Boolean(msg.deletedAt);
            const vocalReport = !isDeleted
              ? parseVocalReportPayload(msg.text)
              : null;
            const isVocalBubble =
              Boolean(vocalReport) ||
              msg.messageType === "vocal_report" ||
              isVocalReportText(msg.text || "");
            const isExerciseCard = isExerciseResultText(msg.text || "");
            const canManage =
              !disabled &&
              !isAnnouncement &&
              !isDeleted &&
              Boolean(onDelete || onEdit);
            return (
              <div
                key={msg.id}
                data-message-id={msg.id}
                className={`group flex ${
                  isAnnouncement
                    ? "justify-center"
                    : isOwn
                      ? "justify-end"
                      : "justify-start"
                }`}
              >
                <div
                  className={`relative min-w-0 rounded-2xl px-4 py-2.5 ${
                    isVocalBubble || isExerciseCard || focusedId === msg.id
                      ? "w-full max-w-sm"
                      : "max-w-[80%]"
                  } ${
                    focusedId === msg.id ? "ring-2 ring-studio-accent/80" : ""
                  } ${
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
                  {isDeleted ? (
                    <p className="text-sm italic opacity-60">
                      Сообщение удалено
                    </p>
                  ) : msg.messageType === "sticker" && sticker ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={sticker.src}
                      alt={sticker.label}
                      className="h-28 w-28 object-contain"
                    />
                  ) : msg.messageType === "image" && msg.mediaUrl ? (
                    <div className="space-y-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={msg.mediaUrl}
                        alt={isExerciseCard ? "Результаты упражнения" : "Фото в чате"}
                        className={
                          isExerciseCard
                            ? "max-h-[28rem] w-full rounded-xl object-contain"
                            : "max-h-56 rounded-xl object-cover"
                        }
                      />
                      {isExerciseCard ? (
                        <p className="text-xs text-studio-accent-light">Результаты упражнения</p>
                      ) : null}
                    </div>
                  ) : msg.messageType === "video" && msg.mediaUrl ? (
                    <div className="space-y-1">
                      <CircleVideoFrame className="h-48 w-48">
                        <video
                          controls
                          playsInline
                          {...{ "webkit-playsinline": "true" }}
                          src={msg.mediaUrl}
                          className="h-full w-full object-cover"
                        />
                      </CircleVideoFrame>
                      {msg.mediaDurationSec ? (
                        <p className="text-center text-[10px] opacity-60">
                          {msg.mediaDurationSec} сек
                        </p>
                      ) : null}
                    </div>
                  ) : vocalReport ? (
                    <VocalReportCard payload={vocalReport} compact />
                  ) : msg.messageType === "vocal_report" ||
                    isVocalReportText(msg.text || "") ? (
                    <p className="text-sm">Отчет от ученика</p>
                  ) : msg.messageType === "voice" && msg.mediaUrl ? (
                    <div className="space-y-1">
                      <MediaAudio controls src={msg.mediaUrl} className="max-w-full" />
                      {msg.mediaDurationSec ? (
                        <p className="text-[10px] opacity-60">
                          {msg.mediaDurationSec} сек
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap break-words text-sm">{msg.text}</p>
                  )}
                  <p className="mt-1 text-[10px] opacity-60">
                    {formatTime(msg.createdAt)}
                    {msg.editedAt && !isDeleted ? " · изменено" : ""}
                  </p>
                  {canManage && (
                    <div className="mt-1.5 flex gap-1 opacity-80 sm:absolute sm:-top-2 sm:right-2 sm:mt-0 sm:rounded-lg sm:bg-studio-bg/90 sm:p-1 sm:opacity-0 sm:ring-1 sm:ring-studio-border sm:group-hover:opacity-100">
                      {onEdit &&
                        (!msg.messageType || msg.messageType === "text") &&
                        !vocalReport && (
                          <button
                            type="button"
                            className="rounded-md p-1.5 text-studio-muted hover:text-studio-text"
                            title="Изменить"
                            onClick={() => {
                              setEditingId(msg.id);
                              setText(msg.text);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                      {onDelete && (
                        <button
                          type="button"
                          className="rounded-md p-1.5 text-studio-muted hover:text-red-300"
                          title="Удалить"
                          onClick={() => {
                            if (window.confirm("Удалить это сообщение?")) {
                              onDelete(msg.id);
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )}
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
                <CircleVideoFrame className="mx-auto h-44 w-44">
                  <video
                    ref={previewRef}
                    muted
                    playsInline
                    autoPlay
                    width={640}
                    height={480}
                    // iOS Safari / standalone PWA: without this the camera stays black
                    {...{ "webkit-playsinline": "true" }}
                    className={`h-full w-full object-cover ${
                      isAppleWebKit() ? "" : "scale-x-[-1]"
                    }`}
                  />
                </CircleVideoFrame>
              )}
              <div className="flex items-center gap-2 rounded-2xl bg-red-500/10 px-2 py-1.5 ring-1 ring-red-500/25">
                <button
                  type="button"
                  onClick={cancelRecording}
                  disabled={phase === "sending"}
                  className="flex h-10 w-10 items-center justify-center rounded-xl text-red-400 transition hover:bg-red-500/15 disabled:opacity-40"
                  aria-label="Отменить"
                  title="Отменить"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={phase === "paused" ? resumeRecording : pauseRecording}
                  disabled={phase === "sending"}
                  className="flex h-10 w-10 items-center justify-center rounded-xl text-studio-text transition hover:bg-studio-card disabled:opacity-40"
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
                    {phase === "sending"
                      ? "Отправка…"
                      : `${formatRecordTime(recordMs)}`}
                    {phase !== "sending" && (
                      <span className="text-red-300/50">
                        {" "}
                        / {formatRecordTime(maxMs)}
                      </span>
                    )}
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
                  disabled={phase === "sending"}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-studio-accent text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
                  aria-label="Отправить"
                  title="Отправить"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-2 flex flex-wrap gap-1">
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
                <div className="min-w-0 flex-1">
                  {editingId ? (
                    <div className="mb-1.5 flex items-center justify-between rounded-lg bg-studio-accent/10 px-3 py-1.5 text-xs text-studio-accent-light">
                      <span>Редактирование сообщения</span>
                      <button
                        type="button"
                        className="underline"
                        onClick={() => {
                          setEditingId(null);
                          setText("");
                        }}
                      >
                        Отмена
                      </button>
                    </div>
                  ) : null}
                  <input
                    type="text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSendText()}
                    placeholder={
                      editingId ? "Измените текст..." : placeholder
                    }
                    className="w-full rounded-xl bg-studio-card px-4 py-2.5 text-sm ring-1 ring-studio-border focus:outline-none focus:ring-studio-accent"
                  />
                </div>
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
          {(recordError || sendError) && (
            <p className="mt-2 text-xs text-red-400">{recordError || sendError}</p>
          )}
          {sending && phase === "idle" && (
            <p className="mt-2 text-xs text-studio-muted">Отправка файла…</p>
          )}
          <input
            ref={galleryRef}
            type="file"
            accept="image/*,.heic,.heif,image/heic,image/heif"
            className="hidden"
            onChange={(event) => {
              sendImage(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <input
            ref={cameraRef}
            type="file"
            accept="image/*,.heic,.heif,image/heic,image/heif"
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

/** Live camera must not be clipped — overflow/radius/mask paint black on iPhone. */
function CircleVideoFrame({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`bg-black ${className ?? ""}`}>{children}</div>;
}
