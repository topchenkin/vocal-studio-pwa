"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Download,
  Lock,
  Mic2,
  Music2,
  Sparkles,
  Upload,
  WandSparkles,
} from "lucide-react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import { getChatSessionToken } from "@/lib/chat-media";
import { splitStereoCenterCancel } from "@/lib/wav-client";
import SaveToLibraryButton from "@/components/student/SaveToLibraryButton";
import MediaAudio from "@/components/media/MediaAudio";
import { downloadAudioUrl } from "@/lib/student-audio";

const MAX_BYTES = 10 * 1024 * 1024;
const API_TIMEOUT_MS = 240_000;

const STEPS = [
  "1. Загружаем трек…",
  "2. Отделяем вокал от музыки…",
  "3. Готовим минусовку и вокал…",
] as const;

type ResultTracks = {
  minusUrl: string;
  vocalUrl: string;
  model: string;
};

type Props = {
  locked?: boolean;
};

function base64ToObjectUrl(b64: string, mime: string) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

function isJsonContentType(value: string | null) {
  return Boolean(value && /application\/json/i.test(value.split(";")[0]));
}

class AuthSeparateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthSeparateError";
  }
}

function revokeIfBlob(url?: string | null) {
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
}

function abortAfter(ms: number) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    cancel: () => window.clearTimeout(timer),
  };
}

async function separateViaApi(
  file: File,
  token: string,
  signal: AbortSignal
): Promise<ResultTracks> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch("/api/ai/separate-vocal", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
    signal,
  });

  const contentType = response.headers.get("content-type");
  if (!isJsonContentType(contentType)) {
    throw new Error("API_UNAVAILABLE");
  }

  let payload: {
    error?: string;
    vocalUrl?: string;
    minusUrl?: string;
    vocalBase64?: string;
    minusBase64?: string;
    vocalMime?: string;
    minusMime?: string;
    model?: string;
    space?: string;
  };
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    throw new Error("API_UNAVAILABLE");
  }

  if (response.status === 401 || response.status === 403) {
    throw new AuthSeparateError(
      payload.error || "Нет доступа к разделению вокала."
    );
  }

  const vocalUrl =
    payload.vocalUrl ||
    (payload.vocalBase64
      ? base64ToObjectUrl(
          payload.vocalBase64,
          payload.vocalMime || "audio/wav"
        )
      : "");
  const minusUrl =
    payload.minusUrl ||
    (payload.minusBase64
      ? base64ToObjectUrl(
          payload.minusBase64,
          payload.minusMime || "audio/wav"
        )
      : "");

  if (!response.ok || !vocalUrl || !minusUrl) {
    throw new Error(
      payload.error || "Нейросеть не вернула минусовку и вокал."
    );
  }

  return {
    vocalUrl,
    minusUrl,
    model: payload.model || payload.space || "htdemucs",
  };
}

async function separateLocally(file: File): Promise<{
  tracks: ResultTracks;
  notice: string;
}> {
  const split = await splitStereoCenterCancel(file);
  const weakMinus = split.monoSource || split.minusPeak < 0.02;
  return {
    tracks: {
      vocalUrl: URL.createObjectURL(split.vocal),
      minusUrl: URL.createObjectURL(split.minus),
      model: "local-ms",
    },
    notice: weakMinus
      ? "Сервер нейросети недоступен. Использовано локальное stereo-разделение: минусовка почти тихая на моно-треке. Загрузите стереозапись."
      : "Сервер нейросети недоступен (статический хостинг). Минус и вокал собраны локально: mid/side, приближённо.",
  };
}

export default function VocalRemover({ locked = false }: Props) {
  const { tier } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<ResultTracks | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      revokeIfBlob(result?.minusUrl);
      revokeIfBlob(result?.vocalUrl);
    },
    [result]
  );

  const clearResult = () => {
    revokeIfBlob(result?.minusUrl);
    revokeIfBlob(result?.vocalUrl);
    setResult(null);
  };

  const selectFile = (selected?: File | null) => {
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
    if (selected.size > MAX_BYTES) {
      setError("Файл больше 10MB.");
      return;
    }
    clearResult();
    setFile(selected);
    setError("");
    setNotice("");
    setStepIndex(0);
  };

  const processAudio = async () => {
    if (!file || processing || locked) return;
    setProcessing(true);
    setError("");
    setNotice("");
    setStepIndex(0);

    const stepTimer = window.setInterval(() => {
      setStepIndex((current) => Math.min(STEPS.length - 1, current + 1));
    }, 4500);
    const timeout = abortAfter(API_TIMEOUT_MS);

    try {
      let token: string | null = null;
      try {
        token = await Promise.race([
          getChatSessionToken(),
          new Promise<null>((resolve) => {
            window.setTimeout(() => resolve(null), 12_000);
          }),
        ]);
      } catch {
        token = null;
      }
      if (token) {
        try {
          const tracks = await separateViaApi(file, token, timeout.signal);
          clearResult();
          setResult(tracks);
          setStepIndex(STEPS.length - 1);
          return;
        } catch (err) {
          if (err instanceof AuthSeparateError) {
            setError(err.message);
            clearResult();
            return;
          }
          const aborted =
            (err instanceof DOMException && err.name === "AbortError") ||
            (err instanceof Error && /abort|timeout/i.test(err.message));
          if (aborted) {
            setError(
              "Нейросеть обрабатывает трек дольше обычного. Попробуйте файл покороче или повторите через минуту."
            );
            clearResult();
            return;
          }
          if (err instanceof Error && err.message !== "API_UNAVAILABLE") {
            setError(err.message);
            clearResult();
            return;
          }
        }
      }

      try {
        const local = await separateLocally(file);
        clearResult();
        setResult(local.tracks);
        setNotice(
          "Нейросеть сейчас недоступна, поэтому минус собран упрощённо на телефоне. Попробуйте ещё раз через пару минут — тогда будет Demucs."
        );
        setStepIndex(STEPS.length - 1);
      } catch {
        setError(
          "Не удалось разделить трек. Проверьте файл (MP3/WAV) или попробуйте позже."
        );
        clearResult();
      }
    } finally {
      timeout.cancel();
      window.clearInterval(stepTimer);
      setProcessing(false);
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
            Удаление вокала
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

  return (
    <section className="rounded-3xl bg-studio-surface p-4 ring-1 ring-studio-border sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
          <WandSparkles className="h-5 w-5 text-blue-400" />
        </div>
        <div>
          <h2 className="font-display text-2xl font-semibold">
            Удаление вокала
          </h2>
          <p className="mt-1 text-sm text-studio-muted">
            Загрузите трек — получите чистую минусовку и отдельно вокал для
            практики.
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="audio/mpeg,audio/wav,audio/x-wav,audio/wave,.mp3,.wav"
        className="hidden"
        onChange={(event) => selectFile(event.target.files?.[0])}
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
          selectFile(event.dataTransfer.files[0]);
        }}
        onDragOver={(event) => event.preventDefault()}
        className={`mt-6 flex w-full flex-col items-center rounded-2xl border border-dashed px-4 py-8 text-center transition ${
          dragging
            ? "border-studio-accent bg-studio-accent/10"
            : "border-studio-border bg-studio-bg/60 hover:border-studio-accent/60"
        }`}
      >
        <Upload className="h-8 w-8 text-studio-accent" />
        <span className="mt-3 max-w-full break-words px-2 text-sm font-medium leading-snug">
          {file ? file.name : "Перетащите MP3 / WAV сюда"}
        </span>
        <span className="mt-1 text-xs text-studio-muted">
          MP3 или WAV · до 10 МБ
        </span>
      </button>

      {file && !result && (
        <div className="mt-4">
          {processing && (
            <div className="mb-4 space-y-3 rounded-2xl bg-studio-bg/70 p-4 ring-1 ring-studio-border">
              {STEPS.map((step, index) => (
                <div key={step} className="flex items-center gap-3 text-sm">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                      index < stepIndex
                        ? "bg-emerald-500/20 text-emerald-300"
                        : index === stepIndex
                          ? "bg-studio-accent/25 text-studio-accent-light"
                          : "bg-studio-card text-studio-muted"
                    }`}
                  >
                    {index < stepIndex ? "✓" : index + 1}
                  </span>
                  <span
                    className={
                      index === stepIndex
                        ? "text-studio-text"
                        : "text-studio-muted"
                    }
                  >
                    {step}
                  </span>
                  {index === stepIndex && (
                    <span className="ml-auto h-4 w-4 animate-spin rounded-full border-2 border-studio-accent border-t-transparent" />
                  )}
                </div>
              ))}
              <p className="text-[11px] text-studio-muted">
                Обычно занимает 1–3 минуты — не закрывайте страницу.
              </p>
            </div>
          )}
          <Button
            fullWidth
            size="lg"
            disabled={processing}
            onClick={() => void processAudio()}
          >
            <WandSparkles className="h-5 w-5" />
            {processing ? "Обрабатываем…" : "Разделить на минус и вокал"}
          </Button>
        </div>
      )}

      {result && file && (
        <div className="mt-6 space-y-3">
          {notice && (
            <div className="flex gap-3 rounded-2xl bg-amber-500/10 p-4 text-sm text-amber-100 ring-1 ring-amber-400/30">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
              <p>{notice}</p>
            </div>
          )}
          <ResultTrack
            title="Минусовка (Backing Track)"
            icon={<Music2 className="h-5 w-5 text-studio-accent" />}
            src={result.minusUrl}
            filename={`minus-${file.name.replace(/\.\w+$/, "")}.wav`}
            source="remover_minus"
            saveTitle={`Минусовка · ${file.name.replace(/\.\w+$/, "")}`}
          />
          <ResultTrack
            title="Изолированный вокал"
            icon={<Mic2 className="h-5 w-5 text-blue-400" />}
            src={result.vocalUrl}
            filename={`vocal-${file.name.replace(/\.\w+$/, "")}.wav`}
            source="remover_vocal"
            saveTitle={`Вокал · ${file.name.replace(/\.\w+$/, "")}`}
          />
          <button
            type="button"
            className="w-full text-sm text-studio-accent hover:underline"
            onClick={() => {
              clearResult();
              setFile(null);
              setNotice("");
            }}
          >
            Загрузить другой файл
          </button>
        </div>
      )}

      {error && (
        <div className="mt-4 flex gap-3 rounded-2xl bg-amber-500/10 p-4 text-sm text-amber-100 ring-1 ring-amber-400/30">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
          <p className="whitespace-pre-wrap break-words">{error}</p>
        </div>
      )}
    </section>
  );
}

function ResultTrack({
  title,
  icon,
  src,
  filename,
  source,
  saveTitle,
}: {
  title: string;
  icon: React.ReactNode;
  src: string;
  filename: string;
  source: "remover_minus" | "remover_vocal";
  saveTitle: string;
}) {
  const [downloading, setDownloading] = useState(false);

  const onDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadAudioUrl(src, filename);
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : "Не удалось скачать файл"
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="rounded-2xl bg-studio-card p-4 ring-1 ring-studio-border">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {icon}
          <span className="truncate text-sm font-medium">{title}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <SaveToLibraryButton url={src} source={source} title={saveTitle} />
          <button
            type="button"
            onClick={() => void onDownload()}
            disabled={downloading}
            className="rounded-lg p-2 text-studio-muted hover:bg-studio-surface hover:text-white disabled:opacity-40"
            aria-label={`Скачать ${title}`}
          >
            <Download className="h-4 w-4" />
          </button>
        </div>
      </div>
      <MediaAudio controls src={src} className="h-10 w-full" />
    </div>
  );
}
