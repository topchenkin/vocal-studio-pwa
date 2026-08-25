"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Pause, Play, Plus, Scissors, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import { supabase } from "@/lib/supabase";
import { rewriteSupabaseAssetUrl } from "@/lib/supabase-origin";
import {
  EXERCISE_PHRASE_LIST_LIMIT,
  EXERCISE_PHRASE_MAX_SEC,
  nextPhraseSortOrder,
} from "@/lib/vocal-exercise";
import type { Exercise, ExerciseAnalysisJob, ExercisePhrase } from "@/types";

type DragKind = "create" | "start" | "end";

export default function PhraseEditor({
  exercise,
  job,
  onChanged,
}: {
  exercise: Exercise;
  job: ExerciseAnalysisJob;
  onChanged: () => Promise<void>;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const waveRef = useRef<HTMLDivElement>(null);
  const [phrases, setPhrases] = useState<ExercisePhrase[]>([]);
  const [audioUrl, setAudioUrl] = useState("");
  const [duration, setDuration] = useState(Number(job.duration_sec) || 0);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const [drag, setDrag] = useState<{ kind: DragKind; origin: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const phraseResult = await supabase
      .from("exercise_phrases")
      .select("*")
      .eq("exercise_id", exercise.id)
      .order("sort_order")
      .order("created_at")
      .limit(EXERCISE_PHRASE_LIST_LIMIT);
    if (phraseResult.error) {
      setError(phraseResult.error.message);
      return;
    }
    setPhrases(phraseResult.data ?? []);
    if (job.vocal_storage_path) {
      const { data } = await supabase.storage
        .from("exercise-analysis")
        .createSignedUrl(job.vocal_storage_path, 30 * 60);
      setAudioUrl(rewriteSupabaseAssetUrl(data?.signedUrl ?? ""));
    }
  }, [exercise.id, job.vocal_storage_path]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!audioUrl) return;
    let cancelled = false;
    void fetch(audioUrl)
      .then((response) => response.arrayBuffer())
      .then(async (bytes) => {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const context = new AudioCtx();
        const buffer = await context.decodeAudioData(bytes);
        if (cancelled) return;
        setDuration(buffer.duration);
        const canvas = canvasRef.current;
        const drawing = canvas?.getContext("2d");
        if (canvas && drawing) {
          const samples = buffer.getChannelData(0);
          drawing.clearRect(0, 0, canvas.width, canvas.height);
          drawing.fillStyle = "#15121f";
          drawing.fillRect(0, 0, canvas.width, canvas.height);
          drawing.strokeStyle = "#d984f5";
          drawing.lineWidth = 2;
          drawing.beginPath();
          for (let x = 0; x < canvas.width; x += 1) {
            const from = Math.floor((x / canvas.width) * samples.length);
            const to = Math.max(from + 1, Math.floor(((x + 1) / canvas.width) * samples.length));
            let peak = 0;
            for (let index = from; index < to; index += 1) {
              peak = Math.max(peak, Math.abs(samples[index] ?? 0));
            }
            const height = peak * canvas.height * 0.45;
            drawing.moveTo(x, canvas.height / 2 - height);
            drawing.lineTo(x, canvas.height / 2 + height);
          }
          drawing.stroke();
        }
        await context.close();
      })
      .catch(() => setError("Не удалось построить волну, но границы можно задать вручную."));
    return () => {
      cancelled = true;
    };
  }, [audioUrl]);

  const timeFromClientX = (clientX: number) => {
    const el = waveRef.current;
    if (!el || duration <= 0) return 0;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Number((ratio * duration).toFixed(2));
  };

  const clampRange = (start: number, end: number) => {
    const minLen = Math.min(1, Math.max(0.4, duration));
    let nextStart = Math.min(Math.max(0, start), Math.max(0, duration - minLen));
    let nextEnd = Math.min(duration, Math.max(nextStart + 0.4, end));
    const maxLen = Math.min(EXERCISE_PHRASE_MAX_SEC, Math.max(1, duration));
    if (nextEnd - nextStart > maxLen) nextEnd = nextStart + maxLen;
    return {
      start: Number(nextStart.toFixed(2)),
      end: Number(nextEnd.toFixed(2)),
    };
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    const target = event.target as HTMLElement;
    const handle = target.dataset.handle as "start" | "end" | undefined;
    const time = timeFromClientX(event.clientX);
    event.currentTarget.setPointerCapture(event.pointerId);
    if (handle && selection) {
      setDrag({ kind: handle, origin: time });
      return;
    }
    setDrag({ kind: "create", origin: time });
    setSelection(clampRange(time, time + 0.6));
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const time = timeFromClientX(event.clientX);
    if (drag.kind === "create") {
      setSelection(clampRange(Math.min(drag.origin, time), Math.max(drag.origin, time)));
      return;
    }
    if (!selection) return;
    if (drag.kind === "start") {
      setSelection(clampRange(time, selection.end));
    } else {
      setSelection(clampRange(selection.start, time));
    }
  };

  const onPointerUp = () => setDrag(null);

  const addFromSelection = async (startSec: number, endSec: number) => {
    const range = clampRange(startSec, endSec);
    const sortOrder = nextPhraseSortOrder(phrases);
    const { error: insertError } = await supabase.from("exercise_phrases").insert({
      exercise_id: exercise.id,
      sort_order: sortOrder,
      title: `Фраза ${phrases.length + 1}`,
      start_sec: range.start,
      end_sec: range.end,
      feature_status: "pending",
    });
    if (insertError) setError(insertError.message);
    else {
      setSelection(null);
      await load();
    }
  };

  const addPhrase = async () => {
    if (selection) {
      await addFromSelection(selection.start, selection.end);
      return;
    }
    const audio = audioRef.current;
    const start = Math.min(Math.max(0, audio?.currentTime ?? 0), Math.max(0, duration - 1));
    await addFromSelection(start, Math.min(duration || start + 10, start + 10));
  };

  const updatePhrase = async (
    phrase: ExercisePhrase,
    fields: Partial<Pick<ExercisePhrase, "title" | "start_sec" | "end_sec">>
  ) => {
    const next = { ...phrase, ...fields };
    if (next.start_sec < 0 || next.end_sec <= next.start_sec || next.end_sec > duration + 0.25) {
      setError("Проверьте границы: конец должен быть позже начала и внутри записи.");
      return;
    }
    setPhrases((current) => current.map((item) => (item.id === phrase.id ? next : item)));
    const { error: updateError } = await supabase
      .from("exercise_phrases")
      .update({ ...fields, feature_status: "pending" })
      .eq("id", phrase.id);
    if (updateError) setError(updateError.message);
  };

  const remove = async (phrase: ExercisePhrase) => {
    const { error: deleteError } = await supabase
      .from("exercise_phrases")
      .delete()
      .eq("id", phrase.id);
    if (deleteError) setError(deleteError.message);
    else {
      const rest = phrases.filter((item) => item.id !== phrase.id);
      for (const [index, item] of rest.entries()) {
        await supabase.from("exercise_phrases").update({ sort_order: 1000 + index }).eq("id", item.id);
      }
      for (const [index, item] of rest.entries()) {
        await supabase.from("exercise_phrases").update({ sort_order: index }).eq("id", item.id);
      }
      await load();
    }
  };

  const move = async (index: number, direction: -1 | 1) => {
    const otherIndex = index + direction;
    const current = phrases[index];
    const other = phrases[otherIndex];
    if (!current || !other) return;
    await supabase.from("exercise_phrases").update({ sort_order: 9999 }).eq("id", current.id);
    await supabase
      .from("exercise_phrases")
      .update({ sort_order: current.sort_order })
      .eq("id", other.id);
    await supabase
      .from("exercise_phrases")
      .update({ sort_order: other.sort_order })
      .eq("id", current.id);
    await load();
  };

  const previewRange = async (start: number, end: number, id: string) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playingId === id) {
      audio.pause();
      setPlayingId(null);
      return;
    }
    audio.currentTime = start;
    setPlayingId(id);
    await audio.play();
  };

  const preview = async (phrase: ExercisePhrase) => {
    await previewRange(Number(phrase.start_sec), Number(phrase.end_sec), phrase.id);
  };

  const approve = async () => {
    setBusy(true);
    setError("");
    const { error: rpcError } = await supabase.rpc("admin_extract_exercise_phrases", {
      p_exercise_id: exercise.id,
    });
    if (rpcError) setError(rpcError.message);
    else await onChanged();
    setBusy(false);
  };

  const activeEnd =
    playingId === "draft" && selection
      ? selection.end
      : phrases.find((phrase) => phrase.id === playingId)?.end_sec;

  return (
    <div className="mt-4 rounded-2xl bg-studio-bg/70 p-4 ring-1 ring-studio-accent/25">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h5 className="font-medium">Фразы для интерактивной практики</h5>
          <p className="mt-1 text-xs text-studio-muted">
            Выделите фрагмент на волне пальцем или мышью — начало и конец подставятся сами.
            Фразы остаются детьми этого упражнения.
          </p>
        </div>
        <Scissors className="h-5 w-5 text-studio-accent" />
      </div>

      <audio
        ref={audioRef}
        src={audioUrl}
        preload="metadata"
        onTimeUpdate={(event) => {
          if (activeEnd != null && event.currentTarget.currentTime >= Number(activeEnd)) {
            event.currentTarget.pause();
            setPlayingId(null);
          }
        }}
        onEnded={() => setPlayingId(null)}
      />
      <div
        ref={waveRef}
        className="relative mt-4 touch-none overflow-hidden rounded-xl"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <canvas ref={canvasRef} width={900} height={130} className="h-28 w-full" />
        {duration > 0 &&
          phrases.map((phrase) => (
            <div
              key={phrase.id}
              className="pointer-events-none absolute inset-y-0 border-x border-emerald-300/50 bg-emerald-400/10"
              style={{
                left: `${(Number(phrase.start_sec) / duration) * 100}%`,
                width: `${((Number(phrase.end_sec) - Number(phrase.start_sec)) / duration) * 100}%`,
              }}
            />
          ))}
        {duration > 0 && selection && (
          <div
            className="absolute inset-y-0 border-x-2 border-studio-accent bg-studio-accent/25"
            style={{
              left: `${(selection.start / duration) * 100}%`,
              width: `${((selection.end - selection.start) / duration) * 100}%`,
            }}
          >
            <button
              type="button"
              data-handle="start"
              aria-label="Начало выделения"
              className="absolute -left-2 top-1/2 h-8 w-4 -translate-y-1/2 rounded-full bg-white shadow"
            />
            <button
              type="button"
              data-handle="end"
              aria-label="Конец выделения"
              className="absolute -right-2 top-1/2 h-8 w-4 -translate-y-1/2 rounded-full bg-white shadow"
            />
          </div>
        )}
      </div>
      {selection && (
        <div className="mt-3 grid gap-2 rounded-xl bg-studio-card p-3 sm:grid-cols-[1fr_1fr_auto]">
          <label className="text-xs text-studio-muted">
            Начало, сек
            <input
              type="number"
              min={0}
              max={duration}
              step={0.1}
              value={selection.start}
              onChange={(event) =>
                setSelection(clampRange(Number(event.target.value), selection.end))
              }
              className="mt-1 w-full rounded-lg bg-studio-surface px-2 py-2 text-sm text-studio-text ring-1 ring-studio-border"
            />
          </label>
          <label className="text-xs text-studio-muted">
            Конец, сек
            <input
              type="number"
              min={0}
              max={duration}
              step={0.1}
              value={selection.end}
              onChange={(event) =>
                setSelection(clampRange(selection.start, Number(event.target.value)))
              }
              className="mt-1 w-full rounded-lg bg-studio-surface px-2 py-2 text-sm text-studio-text ring-1 ring-studio-border"
            />
          </label>
          <div className="flex items-end gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void previewRange(selection.start, selection.end, "draft")}
            >
              {playingId === "draft" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              Превью
            </Button>
          </div>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => void addPhrase()}>
          <Plus className="h-4 w-4" />
          {selection ? "Добавить выделенный фрагмент" : "Добавить от позиции плеера"}
        </Button>
        {audioUrl && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              const audio = audioRef.current;
              if (!audio) return;
              if (audio.paused) void audio.play();
              else audio.pause();
            }}
          >
            <Play className="h-4 w-4" />
            Слушать вокальную дорожку
          </Button>
        )}
      </div>

      <div className="mt-4 space-y-2">
        {phrases.map((phrase, index) => (
          <div key={phrase.id} className="grid gap-2 rounded-xl bg-studio-card p-3 sm:grid-cols-[1fr_90px_90px_auto]">
            <input
              value={phrase.title}
              onChange={(event) =>
                setPhrases((current) =>
                  current.map((item) =>
                    item.id === phrase.id ? { ...item, title: event.target.value } : item
                  )
                )
              }
              onBlur={(event) => void updatePhrase(phrase, { title: event.target.value.trim() })}
              className="rounded-lg bg-studio-surface px-3 py-2 text-sm ring-1 ring-studio-border"
              aria-label="Название фразы"
            />
            <input
              type="number"
              min={0}
              max={duration}
              step={0.1}
              value={phrase.start_sec}
              onChange={(event) => void updatePhrase(phrase, { start_sec: Number(event.target.value) })}
              className="rounded-lg bg-studio-surface px-2 py-2 text-sm ring-1 ring-studio-border"
              aria-label="Начало, секунд"
            />
            <input
              type="number"
              min={0}
              max={duration}
              step={0.1}
              value={phrase.end_sec}
              onChange={(event) => void updatePhrase(phrase, { end_sec: Number(event.target.value) })}
              className="rounded-lg bg-studio-surface px-2 py-2 text-sm ring-1 ring-studio-border"
              aria-label="Конец, секунд"
            />
            <div className="flex items-center justify-end gap-1">
              <button type="button" onClick={() => void preview(phrase)} className="rounded-lg p-2 hover:bg-studio-surface">
                {playingId === phrase.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>
              <button type="button" disabled={index === 0} onClick={() => void move(index, -1)} className="rounded-lg p-2 disabled:opacity-30">
                <ChevronUp className="h-4 w-4" />
              </button>
              <button type="button" disabled={index === phrases.length - 1} onClick={() => void move(index, 1)} className="rounded-lg p-2 disabled:opacity-30">
                <ChevronDown className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => void remove(phrase)} className="rounded-lg p-2 text-red-300">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
      {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
      <Button className="mt-4" fullWidth disabled={busy || phrases.length === 0} onClick={() => void approve()}>
        {busy ? "Ставим извлечение в очередь…" : "Утвердить фразы и извлечь признаки"}
      </Button>
    </div>
  );
}
