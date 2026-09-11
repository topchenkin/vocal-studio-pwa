"use client";

import { useEffect, useRef, useState } from "react";
import { Headphones, Mic, RotateCcw, Send, Square, Waves } from "lucide-react";
import Button from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import { awardCatXp } from "@/lib/cat-xp";
import { logPracticeSeconds } from "@/lib/practice-log";
import { sendChatMessageDirect, uploadChatMediaFile } from "@/lib/chat-media";
import { renderPracticeSharePng } from "@/lib/exercise-result-card";
import {
  exercisePracticeChatText,
  exerciseVoiceFollowupText,
} from "@/lib/exercise-result-payload";
import { TIER_RANK } from "@/lib/constants";
import { useVocalAnalyzer } from "@/hooks/useVocalAnalyzer";
import { usePracticeHeartbeat } from "@/hooks/usePracticeHeartbeat";
import {
  audioBufferToWavBlob,
  startContextPcmCapture,
  type PcmCaptureSession,
} from "@/lib/pcm-capture";
import { EXERCISE_ATTEMPT_MAX_SEC } from "@/lib/vocal-exercise";
import type { Exercise } from "@/types";
import Link from "next/link";

type PracticeStage = "idle" | "live" | "recording" | "ready" | "sending";

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

export default function VocalExercisePractice({
  exercise,
}: {
  exercise: Exercise;
}) {
  const { user, profile, refreshProfile, tier, isAdmin } = useAuth();
  const analyzer = useVocalAnalyzer();
  const audioRef = useRef<HTMLAudioElement>(null);
  const captureRef = useRef<PcmCaptureSession | null>(null);
  const stopRecordingRef = useRef<(() => void) | null>(null);
  const stageRef = useRef<PracticeStage>("idle");
  const [stage, setStage] = useState<PracticeStage>("idle");
  const [error, setError] = useState("");
  const [take, setTake] = useState<{ blob: Blob; durationSec: number } | null>(
    null
  );
  const [sharing, setSharing] = useState(false);

  stageRef.current = stage;
  usePracticeHeartbeat(
    "exercise",
    (stage === "live" || stage === "recording") && !isAdmin
  );

  const canSend =
    isAdmin || TIER_RANK[tier] >= TIER_RANK.standard;

  const stopListening = analyzer.stopListening;

  useEffect(
    () => () => {
      captureRef.current?.abort();
      audioRef.current?.pause();
      stopListening();
    },
    [stopListening]
  );

  const setPracticeStage = (next: PracticeStage) => {
    stageRef.current = next;
    setStage(next);
  };

  const stopBacking = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
  };

  const playBacking = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    try {
      await audio.play();
    } catch {
      /* iOS may interrupt */
    }
  };

  const startLive = async () => {
    setError("");
    setTake(null);
    try {
      await analyzer.startListening();
      setPracticeStage("live");
      void awardCatXp("exercise").then((result) => {
        if (result?.awarded) void refreshProfile();
      });
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Не удалось включить микрофон"
      );
    }
  };

  const stopLive = () => {
    captureRef.current?.abort();
    captureRef.current = null;
    stopRecordingRef.current?.();
    stopRecordingRef.current = null;
    stopBacking();
    analyzer.stopListening();
    setPracticeStage(take ? "ready" : "idle");
  };

  const record = async () => {
    if (!user || !exercise.media_url) return;
    setError("");
    setTake(null);
    try {
      if (!analyzer.listening) {
        await analyzer.startListening();
      }
      const graph = analyzer.getAudioGraph();
      if (!graph) {
        throw new Error("Микрофон ещё не готов. Нажмите ещё раз.");
      }
      setPracticeStage("recording");
      const capture = startContextPcmCapture(
        graph.context,
        graph.stream,
        graph.context.currentTime
      );
      captureRef.current = capture;
      await playBacking();
      const seconds = Math.min(EXERCISE_ATTEMPT_MAX_SEC, 180);
      await Promise.race([
        sleep(seconds * 1_000),
        new Promise<void>((resolve) => {
          stopRecordingRef.current = resolve;
        }),
      ]);
      stopRecordingRef.current = null;
      stopBacking();
      const buffer = await capture.stop();
      captureRef.current = null;
      analyzer.stopListening();
      if (buffer.duration < 1) {
        throw new Error("Запись слишком короткая. Попробуйте ещё раз.");
      }
      const blob = audioBufferToWavBlob(buffer);
      setTake({
        blob,
        durationSec: Math.max(1, Math.round(buffer.duration)),
      });
      setPracticeStage("ready");
      void logPracticeSeconds("exercise", Math.round(buffer.duration));
      void awardCatXp("exercise").then((result) => {
        if (result?.awarded) void refreshProfile();
      });
    } catch (caught) {
      captureRef.current?.abort();
      captureRef.current = null;
      stopBacking();
      analyzer.stopListening();
      setError(
        caught instanceof Error ? caught.message : "Не удалось записать"
      );
      setPracticeStage("idle");
    }
  };

  const stopRecording = () => {
    if (stageRef.current !== "recording") return;
    stopRecordingRef.current?.();
  };

  const share = async () => {
    if (!take || sharing || !user) return;
    if (!canSend) {
      setError("Отправка преподавателю доступна с подписки Standard.");
      return;
    }
    setSharing(true);
    setError("");
    setPracticeStage("sending");
    try {
      const studentName = profile?.full_name?.trim() || "Ученик";
      const card = await renderPracticeSharePng({
        studentName,
        exerciseTitle: exercise.title,
        durationSec: take.durationSec,
      });
      const imageFile = new File([card], "exercise-practice.png", {
        type: "image/png",
      });
      const voiceFile = new File([take.blob], "exercise-practice.wav", {
        type: "audio/wav",
      });
      const uploadedCard = await uploadChatMediaFile(user.id, "image", imageFile);
      await sendChatMessageDirect({
        studentId: user.id,
        senderId: user.id,
        senderName: studentName,
        messageType: "image",
        message: exercisePracticeChatText(
          studentName,
          exercise.title,
          take.durationSec
        ),
        mediaPath: uploadedCard.path,
        mediaMime: uploadedCard.mime,
      });
      const uploadedVoice = await uploadChatMediaFile(
        user.id,
        "voice",
        voiceFile
      );
      await sendChatMessageDirect({
        studentId: user.id,
        senderId: user.id,
        senderName: studentName,
        messageType: "voice",
        message: exerciseVoiceFollowupText(exercise.title, "Практика"),
        mediaPath: uploadedVoice.path,
        mediaMime: uploadedVoice.mime,
        mediaDurationSec: take.durationSec,
      });
      void awardCatXp("exercise_share", `practice:${exercise.id}`).then(
        (result) => {
          if (result?.awarded) void refreshProfile();
        }
      );
      setTake(null);
      setPracticeStage("idle");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Не удалось отправить в чат"
      );
      setPracticeStage("ready");
    } finally {
      setSharing(false);
    }
  };

  const { listening, live } = analyzer;
  const note = live.note ?? "—";
  const hz = live.frequencyHz ? Math.round(live.frequencyHz * 10) / 10 : 0;

  return (
    <div className="mt-3 w-full min-w-0 max-w-[100vw]">
      <div className="min-w-0 w-full max-w-full overflow-hidden rounded-2xl bg-studio-card p-3 ring-1 ring-studio-accent/25 sm:p-4">
        <audio
          ref={audioRef}
          src={exercise.media_url}
          preload="metadata"
          playsInline
        />
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-studio-accent/15">
            <Mic className="h-5 w-5 text-studio-accent-light" />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="font-medium">Пойте вместе с волной</h4>
            <p className="mt-1 text-xs text-studio-muted">
              Та же живая волна, что в нейроанализаторе нот. Автооценки нет —
              можно просто практиковаться и при желании отправить запись
              преподавателю.
            </p>
          </div>
        </div>

        <div className="relative mt-4 overflow-hidden rounded-2xl bg-studio-bg p-3 ring-1 ring-studio-border">
          <canvas
            ref={analyzer.attachWaveformCanvas}
            width={640}
            height={140}
            className="h-28 w-full sm:h-32"
            aria-label="Визуализация аудио-волны"
          />
          {!listening && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <Waves className="h-10 w-10 text-studio-border" />
            </div>
          )}
          {listening && (
            <div className="pointer-events-none absolute inset-x-0 bottom-2 text-center">
              <p className="font-display text-3xl font-semibold leading-none drop-shadow">
                {note}
              </p>
              <p className="mt-1 text-[11px] text-studio-muted">
                {hz > 0 ? `${hz} Hz` : "Спойте — нота появится здесь"}
              </p>
            </div>
          )}
        </div>

        {stage === "recording" && (
          <p className="mt-3 animate-pulse text-center text-sm text-red-300">
            ● Идёт запись… фонограмма играет вместе с вами
          </p>
        )}

        <div className="mt-4 flex w-full flex-wrap justify-center gap-2 px-2">
          {stage === "recording" ? (
            <Button
              variant="danger"
              className="w-full text-sm sm:w-auto sm:text-base"
              onClick={stopRecording}
            >
              <Square className="h-4 w-4 fill-current" />
              Стоп
            </Button>
          ) : stage === "live" ? (
            <>
              <Button
                variant="secondary"
                className="w-full text-sm sm:w-auto sm:text-base"
                onClick={stopLive}
              >
                Остановить микрофон
              </Button>
              <Button
                className="w-full text-sm sm:w-auto sm:text-base"
                onClick={() => void record()}
              >
                <Mic className="h-4 w-4" />
                Записать
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="secondary"
                className="w-full text-sm sm:w-auto sm:text-base"
                onClick={() => void startLive()}
              >
                <Waves className="h-4 w-4" />
                Включить волну
              </Button>
              <Button
                className="w-full text-sm sm:w-auto sm:text-base"
                onClick={() => void record()}
              >
                <Mic className="h-4 w-4" />
                Записать
              </Button>
            </>
          )}
        </div>

        {stage === "ready" && take && (
          <div className="mt-4 space-y-3 rounded-2xl bg-studio-surface p-4 ring-1 ring-studio-border">
            <p className="text-sm text-studio-muted">
              Запись {take.durationSec} сек готова. Оценки нет — преподаватель
              услышит вас как есть.
            </p>
            {canSend ? (
              <Button
                className="w-full"
                disabled={sharing}
                onClick={() => void share()}
              >
                <Send className="h-4 w-4" />
                {sharing ? "Отправляем…" : "Отправить преподавателю"}
              </Button>
            ) : (
              <Link
                href="/dashboard/student/subscription"
                className="block rounded-xl bg-studio-accent/15 px-4 py-3 text-center text-sm text-studio-accent-light ring-1 ring-studio-accent/30"
              >
                Отправка в чат — с подписки Standard
              </Link>
            )}
            <button
              type="button"
              onClick={() => {
                setTake(null);
                setPracticeStage("idle");
              }}
              className="mx-auto flex items-center gap-1 text-xs text-studio-muted"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Сбросить запись
            </button>
          </div>
        )}

        {error && <p className="mt-3 break-words text-sm text-red-300">{error}</p>}
        <p className="mt-4 flex items-start gap-2 text-[11px] text-studio-muted">
          <Headphones className="h-4 w-4 shrink-0" />
          <span>
            Лучше наушники: так фонограмма не попадёт в микрофон. Запись уходит
            преподавателю только если вы нажмёте отправку.
          </span>
        </p>
      </div>
    </div>
  );
}
