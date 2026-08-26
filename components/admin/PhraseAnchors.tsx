"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Pause, Play, Square, Upload } from "lucide-react";
import Button from "@/components/ui/Button";
import { getSingingMicStream } from "@/lib/mic-audio";
import { audioBufferToWavBlob, startPcmCapture, type PcmCaptureSession } from "@/lib/pcm-capture";
import { supabase } from "@/lib/supabase";
import { rewriteSupabaseAssetUrl } from "@/lib/supabase-origin";
import type { ExercisePhrase, ExercisePhraseAnchor, PhraseAnchorBand } from "@/types";

const BANDS: Array<{ band: PhraseAnchorBand; label: string; hint: string }> = [
  { band: "high", label: "80–100", hint: "Сильный пример" },
  { band: "mid", label: "50–79", hint: "Средний пример" },
  { band: "low", label: "0–49", hint: "Слабый пример" },
];

const statusLabel: Record<ExercisePhraseAnchor["feature_status"], string> = {
  pending: "в очереди",
  extracting: "обрабатывается",
  ready: "готов",
  failed: "ошибка",
};

export default function PhraseAnchors({
  exerciseId,
  phrase,
}: {
  exerciseId: string;
  phrase: ExercisePhrase;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const captureRef = useRef<PcmCaptureSession | null>(null);
  const [anchors, setAnchors] = useState<ExercisePhraseAnchor[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [recording, setRecording] = useState<PhraseAnchorBand | null>(null);
  const [playing, setPlaying] = useState<PhraseAnchorBand | null>(null);
  const [busy, setBusy] = useState<PhraseAnchorBand | null>(null);
  const [error, setError] = useState("");

  const stopRef = useRef<(() => void) | null>(null);

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from("exercise_phrase_anchors")
      .select("*")
      .eq("phrase_id", phrase.id);
    if (loadError) {
      setError(loadError.message);
      return;
    }
    const rows = data ?? [];
    setAnchors(rows);
    const nextUrls: Record<string, string> = {};
    for (const row of rows) {
      const { data: signed } = await supabase.storage
        .from("exercise-analysis")
        .createSignedUrl(row.storage_path, 30 * 60);
      if (signed?.signedUrl) nextUrls[row.band] = rewriteSupabaseAssetUrl(signed.signedUrl);
    }
    setUrls(nextUrls);
  }, [phrase.id]);

  useEffect(() => {
    void load();
    return () => {
      captureRef.current?.abort();
    };
  }, [load]);

  useEffect(() => {
    if (!anchors.some((row) => row.feature_status === "pending" || row.feature_status === "extracting")) {
      return;
    }
    const timer = window.setInterval(() => void load(), 4_000);
    return () => window.clearInterval(timer);
  }, [anchors, load]);

  const saveBlob = async (band: PhraseAnchorBand, blob: Blob, filename = `${band}.wav`) => {
    setBusy(band);
    setError("");
    const storagePath = `${exerciseId}/anchors/${phrase.id}/${filename}`;
    const { error: uploadError } = await supabase.storage
      .from("exercise-analysis")
      .upload(storagePath, blob, {
        contentType: blob.type || "audio/wav",
        upsert: true,
        cacheControl: "0",
      });
    if (uploadError) {
      setError(uploadError.message);
      setBusy(null);
      return;
    }
    const { error: upsertError } = await supabase.from("exercise_phrase_anchors").upsert(
      {
        phrase_id: phrase.id,
        band,
        storage_path: storagePath,
        feature_status: "pending",
        features: null,
        error: null,
      },
      { onConflict: "phrase_id,band" }
    );
    if (upsertError) setError(upsertError.message);
    setBusy(null);
    await load();
  };

  const record = async (band: PhraseAnchorBand) => {
    if (recording) return;
    setError("");
    try {
      const stream = await getSingingMicStream();
      setRecording(band);
      const capture = await startPcmCapture(stream);
      captureRef.current = capture;
      const seconds = Math.min(
        45,
        Math.max(3, Number(phrase.end_sec) - Number(phrase.start_sec) + 1.5)
      );
      await Promise.race([
        new Promise<void>((resolve) => {
          window.setTimeout(resolve, seconds * 1000);
        }),
        new Promise<void>((resolve) => {
          stopRef.current = resolve;
        }),
      ]);
      stopRef.current = null;
      const buffer = await capture.stop();
      captureRef.current = null;
      stream.getTracks().forEach((track) => track.stop());
      setRecording(null);
      if (buffer.duration < 1) {
        setError("Запись слишком короткая.");
        return;
      }
      await saveBlob(band, audioBufferToWavBlob(buffer));
    } catch (caught) {
      captureRef.current?.abort();
      captureRef.current = null;
      stopRef.current = null;
      setRecording(null);
      setError(caught instanceof Error ? caught.message : "Не удалось записать пример");
    }
  };

  const stop = () => {
    stopRef.current?.();
  };

  const uploadFile = async (band: PhraseAnchorBand, file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "wav";
    await saveBlob(band, file, `${band}.${ext}`);
  };

  const play = async (band: PhraseAnchorBand) => {
    const audio = audioRef.current;
    const url = urls[band];
    if (!audio || !url) return;
    if (playing === band) {
      audio.pause();
      setPlaying(null);
      return;
    }
    audio.src = url;
    setPlaying(band);
    await audio.play();
  };

  return (
    <div className="mt-2 rounded-xl bg-studio-bg/60 p-3 ring-1 ring-studio-border">
      <audio ref={audioRef} onEnded={() => setPlaying(null)} />
      <p className="text-[11px] text-studio-muted">
        Три калибровочных примера с того же микрофона: алгоритм подтягивает оценку к 90 / 65 / 28,
        если ученик похож на сильный, средний или слабый образец.
      </p>
      <div className="mt-2 space-y-2">
        {BANDS.map(({ band, label, hint }) => {
          const row = anchors.find((item) => item.band === band);
          const isRecording = recording === band;
          return (
            <div key={band} className="flex flex-wrap items-center gap-2 text-xs">
              <span className="w-16 shrink-0 font-medium text-studio-text">{label}</span>
              <span className="min-w-[5.5rem] text-studio-muted">
                {row ? statusLabel[row.feature_status] : "нет"}
              </span>
              {isRecording ? (
                <Button size="sm" variant="danger" onClick={stop}>
                  <Square className="h-3.5 w-3.5 fill-current" />
                  Стоп
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy === band || recording !== null}
                  onClick={() => void record(band)}
                >
                  <Mic className="h-3.5 w-3.5" />
                  Записать
                </Button>
              )}
              <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-studio-surface px-2 py-1.5 ring-1 ring-studio-border">
                <Upload className="h-3.5 w-3.5" />
                Файл
                <input
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  disabled={busy === band || recording !== null}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void uploadFile(band, file);
                  }}
                />
              </label>
              {urls[band] && (
                <button
                  type="button"
                  onClick={() => void play(band)}
                  className="rounded-lg p-1.5 hover:bg-studio-surface"
                  aria-label={`Слушать пример ${label}`}
                >
                  {playing === band ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                </button>
              )}
              <span className="text-[10px] text-studio-muted">{hint}</span>
            </div>
          );
        })}
      </div>
      {error && <p className="mt-2 text-[11px] text-red-300">{error}</p>}
    </div>
  );
}
