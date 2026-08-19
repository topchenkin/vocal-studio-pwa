"use client";

import { useEffect, useRef, useState } from "react";
import {
  CircleHelp,
  Download,
  Gauge,
  Lock,
  Music2,
  Pause,
  Play,
  Sparkles,
  Upload,
} from "lucide-react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import SaveToLibraryButton from "@/components/student/SaveToLibraryButton";
import {
  clampPitchShift,
  clampTempoPercent,
  decodeBlobToAudioBuffer,
  PITCH_SHIFT_MAX,
  PITCH_SHIFT_MIN,
  processPitchTempoBuffer,
  renderPitchTempoWav,
  TEMPO_SHIFT_MAX,
  TEMPO_SHIFT_MIN,
  tempoToPlaybackRate,
} from "@/lib/wav-client";

const MAX_BYTES = 10 * 1024 * 1024;

type Props = {
  locked?: boolean;
};

function formatSigned(value: number, digits = 1) {
  const abs = Math.abs(value).toFixed(digits);
  if (value > 0) return `+${abs}`;
  if (value < 0) return `-${abs}`;
  return abs;
}

function NumberStepper({
  value,
  min,
  max,
  step,
  disabled,
  onChange,
  format,
  inputMode = "decimal",
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  onChange: (next: number) => void;
  format: (value: number) => string;
  inputMode?: "decimal" | "numeric";
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? format(value);

  const commit = (raw: string) => {
    const parsed = Number(raw.replace(",", ".").replace(/[^\d.+-]/g, ""));
    setDraft(null);
    if (!Number.isFinite(parsed)) return;
    onChange(Math.max(min, Math.min(max, parsed)));
  };

  return (
    <div className="inline-flex items-center rounded-xl bg-studio-bg ring-1 ring-studio-border">
      <button
        type="button"
        aria-label="Уменьшить"
        disabled={disabled || value <= min}
        onClick={() => onChange(Math.max(min, value - step))}
        className="px-3 py-2 text-sm font-semibold text-studio-muted transition hover:text-studio-text disabled:opacity-30"
      >
        −
      </button>
      <input
        type="text"
        inputMode={inputMode}
        aria-label="Значение"
        disabled={disabled}
        value={shown}
        onFocus={() => setDraft(String(value))}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => commit(draft ?? String(value))}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
        className="w-[4.75rem] bg-transparent py-2 text-center text-sm tabular-nums font-medium text-studio-text outline-none disabled:opacity-50"
      />
      <button
        type="button"
        aria-label="Увеличить"
        disabled={disabled || value >= max}
        onClick={() => onChange(Math.min(max, value + step))}
        className="px-3 py-2 text-sm font-semibold text-studio-muted transition hover:text-studio-text disabled:opacity-30"
      >
        +
      </button>
    </div>
  );
}

export default function PitchShiftStudio({ locked = false }: Props) {
  const { isAdmin, tier } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [pitch, setPitch] = useState(0);
  const [tempo, setTempo] = useState(0);
  const [decoding, setDecoding] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [showTempoHelp, setShowTempoHelp] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<{
    ctx: AudioContext;
    source: AudioBufferSourceNode;
  } | null>(null);

  const resultUrlRef = useRef<string | null>(null);

  const maxBytes = isAdmin ? Number.POSITIVE_INFINITY : MAX_BYTES;
  const unchanged = pitch === 0 && tempo === 0;

  useEffect(
    () => () => {
      stopPreview();
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const stopPreview = () => {
    if (audioRef.current) {
      try {
        audioRef.current.source.stop();
      } catch {
        /* already stopped */
      }
      void audioRef.current.ctx.close();
      audioRef.current = null;
    }
    setPlaying(false);
  };

  const clearResult = () => {
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    resultUrlRef.current = null;
    setResultUrl(null);
  };

  const resetAudio = () => {
    stopPreview();
    clearResult();
    setBuffer(null);
    setPitch(0);
    setTempo(0);
  };

  const selectFile = async (selected?: File | null) => {
    if (!selected) return;
    const name = selected.name.toLowerCase();
    const okType =
      selected.type.includes("mpeg") ||
      selected.type.includes("wav") ||
      selected.type.includes("wave") ||
      name.endsWith(".mp3") ||
      name.endsWith(".wav");
    if (!okType) {
      setError("Загрузите MP3 или WAV.");
      return;
    }
    if (selected.size > maxBytes) {
      setError("Файл больше 10 МБ. Администратору лимит не действует.");
      return;
    }
    resetAudio();
    setFile(selected);
    setError("");
    setDecoding(true);
    try {
      const decoded = await decodeBlobToAudioBuffer(selected);
      setBuffer(decoded);
    } catch {
      setFile(null);
      setError("Не удалось прочитать аудио. Попробуйте другой MP3 или WAV.");
    } finally {
      setDecoding(false);
    }
  };

  const changePitch = (next: number) => {
    stopPreview();
    clearResult();
    setPitch(clampPitchShift(next));
  };

  const changeTempo = (next: number) => {
    stopPreview();
    clearResult();
    setTempo(clampTempoPercent(next));
  };

  const togglePreview = async () => {
    if (!buffer || decoding || rendering) return;
    if (playing) {
      stopPreview();
      return;
    }
    setRendering(true);
    setError("");
    try {
      const processed = await processPitchTempoBuffer(buffer, pitch, tempo);
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AudioCtx();
      if (ctx.state === "suspended") await ctx.resume();
      const source = ctx.createBufferSource();
      source.buffer = processed;
      source.connect(ctx.destination);
      source.onended = () => {
        if (audioRef.current?.source === source) {
          void ctx.close();
          audioRef.current = null;
          setPlaying(false);
        }
      };
      audioRef.current = { ctx, source };
      source.start(0);
      setPlaying(true);
    } catch {
      setError("Не удалось включить превью. Попробуйте другие значения.");
    } finally {
      setRendering(false);
    }
  };

  const renderResult = async () => {
    if (!buffer || rendering) return;
    stopPreview();
    setRendering(true);
    setError("");
    try {
      const wav = await renderPitchTempoWav(buffer, pitch, tempo);
      clearResult();
      const url = URL.createObjectURL(wav);
      resultUrlRef.current = url;
      setResultUrl(url);
    } catch {
      setError("Не удалось собрать файл. Попробуйте короче трек или другие значения.");
    } finally {
      setRendering(false);
    }
  };

  if (locked) {
    return (
      <section className="relative overflow-hidden rounded-3xl bg-studio-surface p-5 ring-1 ring-studio-border sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-studio-bg/40 backdrop-blur-[2px]" />
        <div className="relative z-10 flex flex-col items-center py-10 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15 ring-1 ring-amber-400/30">
            <Lock className="h-7 w-7 text-amber-300" />
          </div>
          <h2 className="mt-4 font-display text-2xl font-semibold">
            Изменение тональности
          </h2>
          <p className="mt-2 max-w-sm text-sm text-studio-muted">
            Инструмент доступен по тарифу, заданному администратором. Сейчас у
            вас:{" "}
            <span className="font-medium text-studio-text">{tier}</span>.
          </p>
          <Link href="/dashboard/student" className="mt-6 w-full max-w-xs">
            <Button fullWidth size="lg">
              <Sparkles className="h-5 w-5" />
              Перейти на Premium
            </Button>
          </Link>
        </div>
      </section>
    );
  }

  const baseName = file?.name.replace(/\.\w+$/, "") || "трек";
  const outDuration = buffer
    ? buffer.duration / tempoToPlaybackRate(tempo)
    : 0;

  return (
    <section className="rounded-3xl bg-studio-surface p-5 ring-1 ring-studio-border sm:p-6">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-studio-accent/15 text-studio-accent">
          <Music2 className="h-6 w-6" />
        </div>
        <div>
          <h2 className="font-display text-2xl font-semibold">
            Изменение тональности
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-studio-muted">
            Подстройте готовый трек под свой голос: поднимите или опустите
            тональность и отдельно ускорьте или замедлите темп. Удобно, когда
            минусовка в другой тональности или песня чуть быстрая для
            разучивания. Готовый файл можно сохранить в «Мои аудио».
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="audio/mpeg,audio/wav,audio/x-wav,audio/wave,.mp3,.wav"
        className="hidden"
        onChange={(event) => void selectFile(event.target.files?.[0])}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void selectFile(event.dataTransfer.files[0]);
        }}
        onDragOver={(event) => event.preventDefault()}
        className={`mt-6 flex w-full flex-col items-center rounded-2xl border border-dashed px-4 py-8 text-center transition ${
          dragging
            ? "border-studio-accent bg-studio-accent/10"
            : "border-studio-border bg-studio-bg/60 hover:border-studio-accent/60"
        }`}
      >
        <Upload className="h-8 w-8 text-studio-accent" />
        <span className="mt-3 text-sm font-medium">
          {file ? file.name : "Перетащите MP3 / WAV сюда"}
        </span>
        <span className="mt-1 text-xs text-studio-muted">
          {isAdmin ? "MP3 или WAV · без лимита размера" : "MP3 или WAV · до 10 МБ"}
        </span>
      </button>

      {decoding && (
        <p className="mt-4 flex items-center gap-2 text-sm text-studio-muted">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-studio-accent border-t-transparent" />
          Читаем трек…
        </p>
      )}

      {buffer && file && (
        <div className="mt-5 space-y-3">
          <div className="rounded-2xl bg-studio-card p-4 ring-1 ring-studio-border">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <Music2 className="h-4 w-4 shrink-0 text-studio-accent" />
                <span className="text-sm font-medium">Тональность</span>
              </div>
              <NumberStepper
                value={pitch}
                min={PITCH_SHIFT_MIN}
                max={PITCH_SHIFT_MAX}
                step={0.5}
                disabled={decoding || rendering}
                format={formatSigned}
                onChange={changePitch}
              />
            </div>
            <p className="mt-2 text-[11px] text-studio-muted">
              Полутона, от {PITCH_SHIFT_MIN} до {PITCH_SHIFT_MAX}. Можно ввести
              число вручную или шагать кнопками (±0,5). {formatSigned(pitch)} —{" "}
              {pitch === 0
                ? "исходная тональность"
                : pitch > 0
                  ? "выше"
                  : "ниже"}
              .
            </p>
          </div>

          <div className="rounded-2xl bg-studio-card p-4 ring-1 ring-studio-border">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <Gauge className="h-4 w-4 shrink-0 text-studio-accent" />
                <span className="text-sm font-medium">Темп, %</span>
                <button
                  type="button"
                  className="text-studio-muted hover:text-studio-text"
                  aria-label="Что значит темп"
                  onClick={() => setShowTempoHelp((open) => !open)}
                >
                  <CircleHelp className="h-4 w-4" />
                </button>
              </div>
              <NumberStepper
                value={tempo}
                min={TEMPO_SHIFT_MIN}
                max={TEMPO_SHIFT_MAX}
                step={1}
                inputMode="numeric"
                disabled={decoding || rendering}
                format={(value) => formatSigned(value, 0)}
                onChange={changeTempo}
              />
            </div>
            {showTempoHelp && (
              <p className="mt-2 text-[11px] leading-relaxed text-studio-muted">
                0% — исходный темп. Плюс ускоряет и укорачивает, минус замедляет
                и удлиняет, тональность при этом не «уедет». Можно ввести число
                от {TEMPO_SHIFT_MIN} до {TEMPO_SHIFT_MAX}. Длительность результата
                ≈ {Math.max(1, Math.round(outDuration))} с.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="secondary"
              className="flex-1"
              disabled={decoding || rendering}
              onClick={() => void togglePreview()}
            >
              {playing ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {playing ? "Стоп" : rendering ? "Готовим…" : "Слушать с правками"}
            </Button>
            <Button
              className="flex-1"
              disabled={decoding || rendering || unchanged}
              onClick={() => void renderResult()}
            >
              {rendering ? "Собираем…" : "Собрать файл"}
            </Button>
          </div>
          {unchanged && (
            <p className="text-center text-[11px] text-studio-muted">
              Сдвиньте тональность или темп, чтобы собрать новый файл.
            </p>
          )}
        </div>
      )}

      {resultUrl && file && (
        <div className="mt-5 rounded-2xl bg-studio-card p-4 ring-1 ring-studio-border">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">Готовый трек</p>
              <p className="text-[11px] text-studio-muted">
                Тональность {formatSigned(pitch)} · темп {formatSigned(tempo)}%
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <SaveToLibraryButton
                url={resultUrl}
                source="pitchshift"
                title={`${baseName} · ${formatSigned(pitch)} · ${formatSigned(tempo)}%`}
              />
              <a
                href={resultUrl}
                download={`${baseName}-pitch.wav`}
                className="rounded-lg p-2 text-studio-muted hover:bg-studio-surface hover:text-white"
                aria-label="Скачать результат"
              >
                <Download className="h-4 w-4" />
              </a>
            </div>
          </div>
          <audio controls playsInline src={resultUrl} className="h-10 w-full" />
        </div>
      )}

      {file && (
        <button
          type="button"
          className="mt-4 w-full text-sm text-studio-accent hover:underline"
          onClick={() => {
            resetAudio();
            setFile(null);
            setError("");
          }}
        >
          Загрузить другой файл
        </button>
      )}

      {error && (
        <p className="mt-4 rounded-2xl bg-amber-500/10 p-4 text-sm text-amber-100 ring-1 ring-amber-400/30">
          {error}
        </p>
      )}
    </section>
  );
}
