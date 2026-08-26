"use client";

import { useEffect, useRef, useState } from "react";
import { Headphones, Mic, RotateCcw, Send, Square, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import { sendChatMessageDirect, uploadChatMediaFile } from "@/lib/chat-media";
import { renderExerciseResultPng } from "@/lib/exercise-result-card";
import {
  bestScoreMap,
  countPassedPhrases,
  phraseProgressPercent,
  progressLabel,
} from "@/lib/exercise-progress";
import {
  exerciseResultChatText,
  type ExerciseResultPayload,
} from "@/lib/exercise-result-payload";
import { getSingingMicStream } from "@/lib/mic-audio";
import { audioBufferToWavBlob, startPcmCapture, type PcmCaptureSession } from "@/lib/pcm-capture";
import { supabase } from "@/lib/supabase";
import {
  EXERCISE_ATTEMPT_MAX_SEC,
  sanitizeAttemptFeedback,
  teacherReaction,
  weakestDimension,
} from "@/lib/vocal-exercise";
import type { Exercise, ExercisePhrase, PhrasePitchFeatures, VocalExerciseAttempt } from "@/types";
import LiveMelodyGuide, { type MelodyGuidePhase } from "@/components/exercises/LiveMelodyGuide";

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
  const { user, profile } = useAuth();
  const audioRef = useRef<HTMLAudioElement>(null);
  const captureRef = useRef<PcmCaptureSession | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const vizStreamRef = useRef<MediaStream | null>(null);
  const stopRecordingRef = useRef<(() => void) | null>(null);
  const stageRef = useRef<PracticeStage>("idle");
  const selectedRef = useRef(phrases[0] ?? null);
  const [selected, setSelected] = useState(phrases[0] ?? null);
  const [stage, setStage] = useState<PracticeStage>("idle");
  const [countIn, setCountIn] = useState(true);
  const [count, setCount] = useState(0);
  const [attempt, setAttempt] = useState<VocalExerciseAttempt | null>(null);
  const [error, setError] = useState("");
  const [sharing, setSharing] = useState(false);
  const [bestScores, setBestScores] = useState<Record<string, number>>({});
  const [guideOn, setGuideOn] = useState(false);
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null);
  const [phraseFeatures, setPhraseFeatures] = useState<PhrasePitchFeatures | null>(null);
  const [playheadSec, setPlayheadSec] = useState(0);

  stageRef.current = stage;
  selectedRef.current = selected;

  useEffect(
    () => () => {
      captureRef.current?.abort();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      stopRecordingRef.current?.();
      audioRef.current?.pause();
    },
    []
  );

  useEffect(() => {
    if (!selected?.id || selected.feature_status !== "ready") {
      setPhraseFeatures(null);
      return;
    }
    let mounted = true;
    const loadFeatures = async () => {
      const { data, error: loadError } = await supabase
        .from("exercise_phrase_features")
        .select("features")
        .eq("phrase_id", selected.id)
        .maybeSingle();
      if (!mounted) return;
      if (loadError) {
        setPhraseFeatures(null);
        return;
      }
      setPhraseFeatures((data?.features as PhrasePitchFeatures | null) ?? null);
    };
    void loadFeatures();
    return () => {
      mounted = false;
    };
  }, [selected?.id, selected?.feature_status]);

  useEffect(() => {
    if (!user || phrases.length === 0) return;
    let mounted = true;
    const loadProgress = async () => {
      const { data } = await supabase
        .from("vocal_phrase_progress")
        .select("phrase_id,best_score")
        .eq("student_id", user.id)
        .in(
          "phrase_id",
          phrases.map((phrase) => phrase.id)
        );
      if (!mounted) return;
      setBestScores(bestScoreMap(data ?? []));
    };
    void loadProgress();
    return () => {
      mounted = false;
    };
  }, [phrases, user]);

  const passedCount = countPassedPhrases(
    phrases.map((phrase) => phrase.id),
    bestScores
  );
  const percent = phraseProgressPercent(phrases.length, passedCount);

  const setPracticeStage = (next: PracticeStage) => {
    stageRef.current = next;
    setStage(next);
  };

  const stopCaptureOnly = () => {
    captureRef.current?.abort();
    captureRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    vizStreamRef.current?.getTracks().forEach((track) => track.stop());
    vizStreamRef.current = null;
    setLiveStream(null);
    stopRecordingRef.current?.();
    stopRecordingRef.current = null;
  };

  const stopEverything = () => {
    audioRef.current?.pause();
    stopCaptureOnly();
  };

  const playSelectedPhrase = async () => {
    const phrase = selectedRef.current;
    const audio = audioRef.current;
    if (!phrase || !audio) return;
    audio.currentTime = Number(phrase.start_sec);
    try {
      await audio.play();
    } catch {
      /* iOS may interrupt; recording still continues */
    }
  };

  const listen = async () => {
    const phrase = selectedRef.current;
    if (!phrase || !audioRef.current) return;
    const audio = audioRef.current;
    const current = stageRef.current;
    if (!audio.paused && (current === "listening" || current === "recording")) {
      audio.pause();
      if (current === "listening") {
        setPlayheadSec(0);
        setPracticeStage("idle");
      }
      return;
    }
    await playSelectedPhrase();
    if (current !== "recording" && current !== "counting") {
      setPracticeStage("listening");
    }
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
    audioRef.current?.pause();
    stopCaptureOnly();
    setError("");
    setAttempt(null);
    try {
      const stream = await getSingingMicStream();
      streamRef.current = stream;
      const visual = stream.clone();
      vizStreamRef.current = visual;
      setLiveStream(visual);
      setPlayheadSec(0);
      if (countIn) {
        setPracticeStage("counting");
        for (const value of [3, 2, 1]) {
          setCount(value);
          await sleep(650);
        }
        setCount(0);
      }
      setPracticeStage("recording");
      const capture = await startPcmCapture(stream);
      captureRef.current = capture;
      await playSelectedPhrase();
      const seconds = Math.min(
        EXERCISE_ATTEMPT_MAX_SEC,
        Math.max(3, Number(selected.end_sec) - Number(selected.start_sec) + 1.5)
      );
      await Promise.race([
        sleep(seconds * 1_000),
        new Promise<void>((resolve) => {
          stopRecordingRef.current = resolve;
        }),
      ]);
      stopRecordingRef.current = null;
      audioRef.current?.pause();
      const buffer = await capture.stop();
      if (buffer.duration < 1) {
        throw new Error("Запись слишком короткая. Попробуйте ещё раз.");
      }
      captureRef.current = null;
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      visual.getTracks().forEach((track) => track.stop());
      vizStreamRef.current = null;
      setLiveStream(null);
      const blob = audioBufferToWavBlob(buffer);
      setPracticeStage("uploading");
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
      setPracticeStage("evaluating");
      const evaluated = await pollAttempt(created.id);
      setAttempt(evaluated);
      if (evaluated.status === "failed") {
        throw new Error(evaluated.error || "Не удалось обработать запись");
      }
      if (evaluated.overall_score != null) {
        setBestScores((current) => ({
          ...current,
          [selected.id]: Math.max(current[selected.id] ?? 0, evaluated.overall_score ?? 0),
        }));
      }
      setPracticeStage("result");
    } catch (caught) {
      stopEverything();
      setError(caught instanceof Error ? caught.message : "Не удалось записать попытку");
      setPracticeStage("failed");
    }
  };

  const stopRecording = async () => {
    if (!captureRef.current || stageRef.current !== "recording") return;
    setPracticeStage("uploading");
    audioRef.current?.pause();
    stopRecordingRef.current?.();
  };

  const discard = async () => {
    if (attempt && attempt.status !== "shared") {
      await supabase.rpc("discard_vocal_attempt", { p_attempt_id: attempt.id });
    }
    setAttempt(null);
    setError("");
    setPracticeStage("idle");
  };

  const share = async () => {
    if (!attempt || sharing || !user || !selected) return;
    setSharing(true);
    setError("");
    try {
      const studentName = profile?.full_name?.trim() || "Ученик";
      const payload: ExerciseResultPayload = {
        v: 2,
        kind: "exercise_result",
        overall: attempt.overall_score ?? 0,
        intonation: attempt.intonation_score ?? 0,
        rhythm: attempt.rhythm_score ?? 0,
        completeness: attempt.completeness_score ?? 0,
        exerciseTitle: exercise.title,
        phraseTitle: selected.title || "Фраза",
        shift: attempt.global_shift_semitones,
      };
      const card = await renderExerciseResultPng({
        studentName,
        payload,
        weakest: weakestDimension(attempt),
      });
      const file = new File([card], "exercise-result.png", { type: "image/png" });
      const uploaded = await uploadChatMediaFile(user.id, "image", file);
      await sendChatMessageDirect({
        studentId: user.id,
        senderId: user.id,
        senderName: studentName,
        messageType: "image",
        message: exerciseResultChatText(studentName, payload),
        mediaPath: uploaded.path,
        mediaMime: uploaded.mime,
      });
      const { error: shareError } = await supabase.rpc("request_vocal_attempt_share", {
        p_attempt_id: attempt.id,
      });
      if (shareError) throw shareError;
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

  const canListen = Boolean(selected) && ["idle", "listening", "recording", "failed"].includes(stage);
  const canRecord =
    selected?.feature_status === "ready" && ["idle", "listening", "failed"].includes(stage);

  return (
    <div className="mt-3 rounded-2xl bg-studio-card p-4 ring-1 ring-studio-accent/25">
      <audio
        ref={audioRef}
        src={exercise.media_url}
        preload="metadata"
        playsInline
        onPlay={() => setGuideOn(true)}
        onPause={() => setGuideOn(false)}
        onTimeUpdate={(event) => {
          const phrase = selectedRef.current;
          if (!phrase) return;
          setPlayheadSec(Math.max(0, event.currentTarget.currentTime - Number(phrase.start_sec)));
          if (event.currentTarget.currentTime >= Number(phrase.end_sec)) {
            event.currentTarget.pause();
            if (stageRef.current === "listening") {
              setPlayheadSec(0);
              setPracticeStage("idle");
            }
          }
        }}
        onEnded={() => {
          if (stageRef.current === "listening") {
            setPlayheadSec(0);
            setPracticeStage("idle");
          }
        }}
      />
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-studio-accent/15">
          <Mic className="h-5 w-5 text-studio-accent-light" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h4 className="font-medium">Повторите за преподавателем</h4>
            <span className="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-medium text-emerald-200">
              {progressLabel(percent)}
            </span>
          </div>
          <p className="mt-1 text-xs text-studio-muted">
            Слушайте фразу и пойте вместе с ней — как караоке. На записи эталон светится коридором, ваш голос рисуется поверх вживую.
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-studio-surface">
            <div
              className="h-full rounded-full bg-emerald-400 transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {phrases.map((phrase, index) => {
          const passed = (bestScores[phrase.id] ?? 0) > 80;
          return (
            <button
              key={phrase.id}
              type="button"
              disabled={!["idle", "listening", "result", "failed"].includes(stage)}
              onClick={() => {
                setSelected(phrase);
                setAttempt(null);
                setPlayheadSec(0);
                setPracticeStage("idle");
              }}
              className={`shrink-0 rounded-xl px-3 py-2 text-xs ring-1 ${
                selected?.id === phrase.id
                  ? "bg-studio-accent/20 text-white ring-studio-accent"
                  : "bg-studio-surface text-studio-muted ring-studio-border"
              }`}
            >
              {phrase.title || `Фраза ${index + 1}`} ·{" "}
              {Math.round(Number(phrase.end_sec) - Number(phrase.start_sec))} сек
              {phrase.feature_status !== "ready"
                ? phrase.feature_status === "failed"
                  ? " · ошибка"
                  : " · готовится"
                : passed
                  ? " · ✓"
                  : ""}
            </button>
          );
        })}
      </div>

      {(stage === "idle" ||
        stage === "listening" ||
        stage === "counting" ||
        stage === "recording" ||
        stage === "failed") &&
        (phraseFeatures || liveStream) && (
        <div className="relative">
          <LiveMelodyGuide
            features={phraseFeatures}
            stream={liveStream}
            phase={
              (
                {
                  recording: "live",
                  counting: "armed",
                  listening: "listening",
                } as Partial<Record<PracticeStage, MelodyGuidePhase>>
              )[stage] ?? "idle"
            }
            playheadSec={playheadSec}
            phraseDurationSec={
              selected ? Math.max(0.9, Number(selected.end_sec) - Number(selected.start_sec)) : 0
            }
            clockSynced={guideOn}
          />
          {stage === "counting" && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-[10px] uppercase tracking-[0.2em] text-violet-200/80">Приготовьтесь</p>
              <p className="font-display text-7xl font-semibold text-white drop-shadow-[0_0_28px_rgba(167,139,250,0.85)]">
                {count}
              </p>
            </div>
          )}
        </div>
      )}

      {!resultReaction && attempt?.status !== "rejected" && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              disabled={!canListen}
              onClick={() => void listen()}
            >
              {guideOn ? "Остановить фонограмму" : "Послушать"}
            </Button>
            {stage === "recording" ? (
              <Button variant="danger" onClick={() => void stopRecording()}>
                <Square className="h-4 w-4 fill-current" />
                Стоп
              </Button>
            ) : (
              <Button disabled={!canRecord} onClick={() => void record()}>
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
      {stage === "recording" && (
        <p className="mt-3 animate-pulse text-center text-sm text-red-300">
          ● Идёт запись… фонограмма играет вместе с вами
        </p>
      )}
      {(stage === "uploading" || stage === "evaluating") && (
        <div className="mt-4 rounded-xl bg-studio-surface p-4 text-center text-sm text-studio-muted">
          {stage === "uploading" ? "Безопасно загружаем короткую запись…" : "Сопоставляем мелодию и ритм…"}
        </div>
      )}

      {attempt?.status === "rejected" && (
        <div className="mt-4 rounded-2xl bg-amber-500/10 p-4 ring-1 ring-amber-400/25">
          <h5 className="font-medium text-amber-100">Не удалось оценить</h5>
          <p className="mt-1 text-sm text-studio-muted">{sanitizeAttemptFeedback(attempt.feedback)}</p>
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
              ["Мелодия", attempt.intonation_score, "50%"],
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
              Карточка и запись отправлены преподавателю в чат.
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
        Лучше использовать наушники: так фонограмма не попадёт в микрофон и не завысит оценку. Неотправленная запись удалится максимум через час.
      </p>
    </div>
  );
}
