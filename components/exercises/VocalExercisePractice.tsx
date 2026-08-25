"use client";

import { useEffect, useRef, useState } from "react";
import { Headphones, Mic, RotateCcw, Send, Square, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import { getSingingMicStream } from "@/lib/mic-audio";
import { audioBufferToWavBlob, startPcmCapture, type PcmCaptureSession } from "@/lib/pcm-capture";
import { supabase } from "@/lib/supabase";
import { teacherReaction, weakestDimension } from "@/lib/vocal-exercise";
import type { Exercise, ExercisePhrase, VocalExerciseAttempt } from "@/types";

type PracticeStage =
  | "idle"
  | "listening"
  | "counting"
  | "recording"
  | "uploading"
  | "evaluating"
  | "result"
  | "failed";

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

export default function VocalExercisePractice({
  exercise,
  phrases,
}: {
  exercise: Exercise;
  phrases: ExercisePhrase[];
}) {
  const { user } = useAuth();
  const audioRef = useRef<HTMLAudioElement>(null);
  const captureRef = useRef<PcmCaptureSession | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stopRecordingRef = useRef<(() => void) | null>(null);
  const [selected, setSelected] = useState(phrases[0] ?? null);
  const [stage, setStage] = useState<PracticeStage>("idle");
  const [countIn, setCountIn] = useState(true);
  const [count, setCount] = useState(0);
  const [attempt, setAttempt] = useState<VocalExerciseAttempt | null>(null);
  const [error, setError] = useState("");
  const [sharing, setSharing] = useState(false);

  useEffect(
    () => () => {
      captureRef.current?.abort();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      stopRecordingRef.current?.();
      audioRef.current?.pause();
    },
    []
  );

  const stopEverything = () => {
    audioRef.current?.pause();
    captureRef.current?.abort();
    captureRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    stopRecordingRef.current?.();
    stopRecordingRef.current = null;
  };

  const listen = async () => {
    if (!selected || !audioRef.current || stage === "recording") return;
    const audio = audioRef.current;
    if (stage === "listening") {
      audio.pause();
      setStage("idle");
      return;
    }
    audio.currentTime = Number(selected.start_sec);
    setStage("listening");
    await audio.play();
  };

  const pollAttempt = async (
    attemptId: string,
    waitForShare = false
  ): Promise<VocalExerciseAttempt> => {
    for (let index = 0; index < 90; index += 1) {
      const { data, error: loadError } = await supabase
        .from("vocal_exercise_attempts")
        .select("*")
        .eq("id", attemptId)
        .single();
      if (loadError) throw loadError;
      const terminal = waitForShare
        ? ["failed", "shared"].includes(data.status) ||
          (data.status === "evaluated" && !data.share_requested && Boolean(data.error))
        : ["evaluated", "rejected", "failed", "shared"].includes(data.status);
      if (terminal) return data;
      await sleep(2_000);
    }
    throw new Error("Оценивание заняло больше обычного. Нажмите «Повторить» через минуту.");
  };

  const record = async () => {
    if (!user || !selected || !exercise.media_url) return;
    stopEverything();
    setError("");
    setAttempt(null);
    try {
      const stream = await getSingingMicStream();
      streamRef.current = stream;
      if (countIn) {
        setStage("counting");
        for (const value of [3, 2, 1]) {
          setCount(value);
          await sleep(650);
        }
        setCount(0);
      }
      setStage("recording");
      const capture = await startPcmCapture(stream);
      captureRef.current = capture;
      const seconds = Math.min(
        45,
        Math.max(3, Number(selected.end_sec) - Number(selected.start_sec) + 1.5)
      );
      await Promise.race([
        sleep(seconds * 1_000),
        new Promise<void>((resolve) => {
          stopRecordingRef.current = resolve;
        }),
      ]);
      stopRecordingRef.current = null;
      const buffer = await capture.stop();
      if (buffer.duration < 1) {
        throw new Error("Запись слишком короткая. Попробуйте ещё раз.");
      }
      captureRef.current = null;
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      const blob = audioBufferToWavBlob(buffer);
      setStage("uploading");
      const storagePath = `${user.id}/${crypto.randomUUID()}.wav`;
      const { error: uploadError } = await supabase.storage
        .from("vocal-attempts")
        .upload(storagePath, blob, {
          contentType: "audio/wav",
          upsert: false,
          cacheControl: "0",
        });
      if (uploadError) throw uploadError;
      const { data: created, error: insertError } = await supabase
        .from("vocal_exercise_attempts")
        .insert({
          phrase_id: selected.id,
          student_id: user.id,
          storage_path: storagePath,
          media_mime: "audio/wav",
          duration_sec: Number(buffer.duration.toFixed(2)),
          status: "queued",
        })
        .select("*")
        .single();
      if (insertError) {
        await supabase.storage.from("vocal-attempts").remove([storagePath]);
        throw insertError;
      }
      setStage("evaluating");
      const evaluated = await pollAttempt(created.id);
      setAttempt(evaluated);
      if (evaluated.status === "failed") {
        throw new Error(evaluated.error || "Не удалось обработать запись");
      }
      setStage("result");
    } catch (caught) {
      stopEverything();
      setError(caught instanceof Error ? caught.message : "Не удалось записать попытку");
      setStage("failed");
    }
  };

  const stopRecording = async () => {
    if (!captureRef.current || stage !== "recording") return;
    setStage("uploading");
    stopRecordingRef.current?.();
  };

  const discard = async () => {
    if (attempt && attempt.status !== "shared") {
      await supabase.rpc("discard_vocal_attempt", { p_attempt_id: attempt.id });
    }
    setAttempt(null);
    setError("");
    setStage("idle");
  };

  const share = async () => {
    if (!attempt || sharing) return;
    setSharing(true);
    setError("");
    const { error: shareError } = await supabase.rpc("request_vocal_attempt_share", {
      p_attempt_id: attempt.id,
    });
    if (shareError) {
      setError(shareError.message);
      setSharing(false);
      return;
    }
    try {
      const shared = await pollAttempt(attempt.id, true);
      setAttempt(shared);
      if (shared.status !== "shared") {
        throw new Error(shared.error || "Не удалось сохранить запись в чате");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось отправить в чат");
    } finally {
      setSharing(false);
    }
  };

  const resultReaction =
    attempt?.status === "evaluated" && attempt.overall_score !== null
      ? teacherReaction(attempt.overall_score, weakestDimension(attempt))
      : null;

  return (
    <div className="mt-3 rounded-2xl bg-studio-card p-4 ring-1 ring-studio-accent/25">
      <audio
        ref={audioRef}
        src={exercise.media_url}
        preload="metadata"
        playsInline
        onTimeUpdate={(event) => {
          if (
            stage === "listening" &&
            selected &&
            event.currentTarget.currentTime >= Number(selected.end_sec)
          ) {
            event.currentTarget.pause();
            setStage("idle");
          }
        }}
        onEnded={() => setStage("idle")}
      />
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-studio-accent/15">
          <Mic className="h-5 w-5 text-studio-accent-light" />
        </div>
        <div>
          <h4 className="font-medium">Повторите за преподавателем</h4>
          <p className="mt-1 text-xs text-studio-muted">
            Сначала послушайте фразу, затем спойте её в удобной тональности.
          </p>
        </div>
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {phrases.map((phrase, index) => (
          <button
            key={phrase.id}
            type="button"
            disabled={!["idle", "result", "failed"].includes(stage)}
            onClick={() => {
              setSelected(phrase);
              setAttempt(null);
              setStage("idle");
            }}
            className={`shrink-0 rounded-xl px-3 py-2 text-xs ring-1 ${
              selected?.id === phrase.id
                ? "bg-studio-accent/20 text-white ring-studio-accent"
                : "bg-studio-surface text-studio-muted ring-studio-border"
            }`}
          >
            {phrase.title || `Фраза ${index + 1}`} ·{" "}
            {Math.round(Number(phrase.end_sec) - Number(phrase.start_sec))} сек
          </button>
        ))}
      </div>

      {!resultReaction && attempt?.status !== "rejected" && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              disabled={!selected || !["idle", "listening", "failed"].includes(stage)}
              onClick={() => void listen()}
            >
              {stage === "listening" ? "Остановить" : "Послушать"}
            </Button>
            {stage === "recording" ? (
              <Button variant="danger" onClick={() => void stopRecording()}>
                <Square className="h-4 w-4 fill-current" />
                Стоп
              </Button>
            ) : (
              <Button
                disabled={!selected || !["idle", "failed"].includes(stage)}
                onClick={() => void record()}
              >
                <Mic className="h-4 w-4" />
                Записать
              </Button>
            )}
          </div>
          <label className="mt-3 flex items-center gap-2 text-xs text-studio-muted">
            <input
              type="checkbox"
              checked={countIn}
              onChange={(event) => setCountIn(event.target.checked)}
            />
            Отсчёт 3–2–1 перед записью
          </label>
        </>
      )}

      {stage === "counting" && (
        <div className="mt-4 rounded-2xl bg-studio-accent/10 p-5 text-center">
          <p className="text-xs text-studio-muted">Приготовьтесь</p>
          <p className="mt-1 font-display text-5xl font-semibold">{count}</p>
        </div>
      )}
      {stage === "recording" && (
        <p className="mt-3 animate-pulse text-center text-sm text-red-300">● Идёт запись…</p>
      )}
      {(stage === "uploading" || stage === "evaluating") && (
        <div className="mt-4 rounded-xl bg-studio-surface p-4 text-center text-sm text-studio-muted">
          {stage === "uploading" ? "Безопасно загружаем короткую запись…" : "Сопоставляем мелодию и ритм…"}
        </div>
      )}

      {attempt?.status === "rejected" && (
        <div className="mt-4 rounded-2xl bg-amber-500/10 p-4 ring-1 ring-amber-400/25">
          <h5 className="font-medium text-amber-100">Не удалось оценить</h5>
          <p className="mt-1 text-sm text-studio-muted">{attempt.feedback}</p>
          <Button className="mt-3" fullWidth variant="secondary" onClick={() => void discard()}>
            <RotateCcw className="h-4 w-4" />
            Повторить
          </Button>
        </div>
      )}

      {resultReaction && attempt && (
        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-4 rounded-2xl bg-studio-surface p-4">
            <img
              src={resultReaction.avatar}
              alt=""
              width={112}
              height={112}
              className="h-24 w-24 shrink-0 object-contain"
            />
            <div>
              <p className="font-display text-4xl font-semibold">{attempt.overall_score}</p>
              <h5 className="mt-1 font-medium">{resultReaction.title}</h5>
              <p className="mt-1 text-xs text-studio-muted">{resultReaction.message}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              ["Интонация", attempt.intonation_score, "50%"],
              ["Ритм", attempt.rhythm_score, "30%"],
              ["Полнота", attempt.completeness_score, "20%"],
            ].map(([label, value, weight]) => (
              <div key={String(label)} className="rounded-xl bg-studio-surface p-3 text-center">
                <p className="text-[10px] text-studio-muted">{label} · {weight}</p>
                <p className="mt-1 text-xl font-semibold">{value}</p>
              </div>
            ))}
          </div>
          {attempt.global_shift_semitones !== null && attempt.global_shift_semitones !== 0 && (
            <p className="text-center text-xs text-studio-muted">
              Учтена единая транспозиция: {attempt.global_shift_semitones > 0 ? "+" : ""}
              {attempt.global_shift_semitones} полутонов
            </p>
          )}
          {attempt.status === "shared" ? (
            <p className="text-center text-sm text-emerald-300">
              Запись сохранена и отправлена преподавателю в чат.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="secondary" onClick={() => void discard()}>
                <RotateCcw className="h-4 w-4" />
                Повторить
              </Button>
              <Button disabled={sharing} onClick={() => void share()}>
                <Send className="h-4 w-4" />
                {sharing ? "Отправляем…" : "Отправить преподавателю в чат"}
              </Button>
            </div>
          )}
          {attempt.status !== "shared" && (
            <button
              type="button"
              onClick={() => void discard()}
              className="mx-auto flex items-center gap-1 text-xs text-studio-muted"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Удалить запись сейчас
            </button>
          )}
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
      <p className="mt-4 flex items-center gap-2 text-[11px] text-studio-muted">
        <Headphones className="h-4 w-4 shrink-0" />
        Лучше использовать наушники: так фонограмма не попадёт в микрофон. Неотправленная запись удалится максимум через час.
      </p>
    </div>
  );
}
