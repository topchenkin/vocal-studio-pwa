"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Pause, Play, Plus, Scissors, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import { supabase } from "@/lib/supabase";
import { rewriteSupabaseAssetUrl } from "@/lib/supabase-origin";
import type { Exercise, ExerciseAnalysisJob, ExercisePhrase } from "@/types";

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
  const [phrases, setPhrases] = useState<ExercisePhrase[]>([]);
  const [audioUrl, setAudioUrl] = useState("");
  const [duration, setDuration] = useState(Number(job.duration_sec) || 0);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const phraseResult = await supabase
      .from("exercise_phrases")
      .select("*")
      .eq("exercise_id", exercise.id)
      .order("sort_order");
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

  const addPhrase = async () => {
    const audio = audioRef.current;
    const start = Math.min(Math.max(0, audio?.currentTime ?? 0), Math.max(0, duration - 1));
    const end = Math.min(duration || start + 10, start + 10);
    const { error: insertError } = await supabase.from("exercise_phrases").insert({
      exercise_id: exercise.id,
      sort_order: phrases.length,
      title: `Фраза ${phrases.length + 1}`,
      start_sec: Number(start.toFixed(2)),
      end_sec: Number(Math.max(start + 1, end).toFixed(2)),
      feature_status: "pending",
    });
    if (insertError) setError(insertError.message);
    else await load();
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

  const preview = async (phrase: ExercisePhrase) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playingId === phrase.id) {
      audio.pause();
      setPlayingId(null);
      return;
    }
    audio.currentTime = Number(phrase.start_sec);
    setPlayingId(phrase.id);
    await audio.play();
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

  return (
    <div className="mt-4 rounded-2xl bg-studio-bg/70 p-4 ring-1 ring-studio-accent/25">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h5 className="font-medium">Фразы для интерактивной практики</h5>
          <p className="mt-1 text-xs text-studio-muted">
            Отметьте законченные фразы, обычно по 5–20 секунд. Можно задать до 45 секунд.
          </p>
        </div>
        <Scissors className="h-5 w-5 text-studio-accent" />
      </div>

      <audio
        ref={audioRef}
        src={audioUrl}
        preload="metadata"
        onTimeUpdate={(event) => {
          const active = phrases.find((phrase) => phrase.id === playingId);
          if (active && event.currentTarget.currentTime >= Number(active.end_sec)) {
            event.currentTarget.pause();
            setPlayingId(null);
          }
        }}
        onEnded={() => setPlayingId(null)}
      />
      <div className="relative mt-4 overflow-hidden rounded-xl">
        <canvas ref={canvasRef} width={900} height={130} className="h-28 w-full" />
        {duration > 0 &&
          phrases.map((phrase) => (
            <div
              key={phrase.id}
              className="pointer-events-none absolute inset-y-0 border-x border-emerald-300/70 bg-emerald-400/15"
              style={{
                left: `${(Number(phrase.start_sec) / duration) * 100}%`,
                width: `${((Number(phrase.end_sec) - Number(phrase.start_sec)) / duration) * 100}%`,
              }}
            />
          ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => void addPhrase()}>
          <Plus className="h-4 w-4" />
          Добавить от позиции плеера
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
