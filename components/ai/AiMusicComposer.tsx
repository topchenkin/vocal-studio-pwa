"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Download, Lock, Music2, Sparkles } from "lucide-react";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import MediaAudio from "@/components/media/MediaAudio";
import SaveToLibraryButton from "@/components/student/SaveToLibraryButton";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { downloadAudioUrl } from "@/lib/student-audio";

const PLACEHOLDER =
  "Например: Медленный джазовый бит с саксофоном и пианино...";

const CHIPS = [
  { label: "Lo-Fi Hip Hop", prompt: "Lo-Fi Hip Hop" },
  { label: "Pop Acoustic Guitar", prompt: "Pop Acoustic Guitar" },
  { label: "Dark Synthwave", prompt: "Dark Synthwave" },
] as const;

const DURATIONS = [10, 15, 20, 25, 30] as const;

const WAIT_STEPS = [
  "Отправляем запрос...",
  "Нейросеть сочиняет ноты...",
  "Сводим трек... Длиннее клип — дольше ожидание",
] as const;

type GenerateOk = { audioBase64: string; mime?: string };
type GenerateErr = { error?: string; estimated_time?: number };

function revoke(url: string | null) {
  if (url) URL.revokeObjectURL(url);
}

function decodeAudio(base64: string, mime: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime || "audio/flac" });
}

function extensionFor(mime: string) {
  if (/wav/i.test(mime)) return "wav";
  if (/aac|mp4|m4a/i.test(mime)) return "m4a";
  if (/mpeg|mp3/i.test(mime)) return "mp3";
  return "flac";
}

function humanizeError(code: string | undefined) {
  switch (code) {
    case "premium_required":
      return "Создание авторских треков с помощью нейросетей доступно в Premium.";
    case "unauthorized":
      return "Сессия истекла. Обновите страницу и войдите снова.";
    case "empty_prompt":
      return "Опишите трек чуть подробнее.";
    case "prompt_too_long":
      return "Описание слишком длинное. Сократите текст.";
    case "timeout":
      return "Генерация заняла слишком много времени. Попробуйте ещё раз.";
    case "busy":
    case "space_gpu":
      return "Нейросеть остывает после прошлого трека. Подождите полминуты и нажмите ещё раз.";
    case "missing_hf_key":
      return "Сервер генерации не настроен. Напишите преподавателю.";
    default:
      return "Не удалось сгенерировать трек. Попробуйте ещё раз через минуту.";
  }
}

function loadingMessage(seconds: number | undefined) {
  const wait =
    typeof seconds === "number" && seconds > 0 ? Math.round(seconds) : 25;
  return `Нейросеть разогревается. Пожалуйста, подождите ${wait} секунд и попробуйте снова`;
}

type Props = {
  locked?: boolean;
};

export default function AiMusicComposer({ locked }: Props) {
  const { tier, isAdmin } = useAuth();
  const blocked =
    locked ?? !(isAdmin || tier === "premium" || tier === "vip");
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState<(typeof DURATIONS)[number]>(15);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioMime, setAudioMime] = useState("audio/flac");
  const [clipDuration, setClipDuration] = useState<number | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => revoke(urlRef.current);
  }, []);

  useEffect(() => {
    if (!busy) {
      setStep(0);
      return;
    }
    const id = window.setInterval(() => {
      setStep((current) => Math.min(current + 1, WAIT_STEPS.length - 1));
    }, 4000);
    return () => window.clearInterval(id);
  }, [busy]);

  const setResultUrl = (next: string | null) => {
    revoke(urlRef.current);
    urlRef.current = next;
    setAudioUrl(next);
  };

  const generate = async () => {
    const text = prompt.trim();
    if (!text || busy) return;
    setBusy(true);
    setError("");
    setStep(0);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke<
        GenerateOk & GenerateErr
      >("generate-music", { body: { prompt: text, duration } });

      if (data?.error === "loading") {
        setError(loadingMessage(data.estimated_time));
        return;
      }

      if (invokeError) {
        const context = invokeError as { context?: Response };
        let payload: GenerateErr | null = null;
        try {
          payload = context.context
            ? ((await context.context.json()) as GenerateErr)
            : null;
        } catch {
          payload = data ?? null;
        }
        if (payload?.error === "loading") {
          setError(loadingMessage(payload.estimated_time));
          return;
        }
        setError(humanizeError(payload?.error || data?.error));
        return;
      }

      if (data?.error) {
        setError(humanizeError(data.error));
        return;
      }

      if (!data?.audioBase64) {
        setError("Нейросеть не вернула аудио. Измените описание и попробуйте снова.");
        return;
      }

      const mime = data.mime || "audio/flac";
      const blob = decodeAudio(data.audioBase64, mime);
      setAudioMime(mime);
      setClipDuration(duration);
      setResultUrl(URL.createObjectURL(blob));
    } catch {
      setError("Не удалось связаться с нейросетью. Проверьте интернет и повторите.");
    } finally {
      setBusy(false);
    }
  };

  if (blocked) {
    return (
      <section className="relative overflow-hidden rounded-3xl bg-studio-surface p-5 ring-1 ring-studio-border sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-studio-bg/50 backdrop-blur-[2px]" />
        <div className="relative z-10 flex flex-col items-center py-10 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15 ring-1 ring-amber-400/30">
            <Lock className="h-7 w-7 text-amber-300" />
          </div>
          <h2 className="mt-4 font-display text-2xl font-semibold">
            ИИ-композитор
          </h2>
          <p className="mt-2 max-w-sm text-sm text-studio-muted">
            Создание авторских треков с помощью нейросетей доступно в Premium.
          </p>
          <Link href="/dashboard/student/subscription" className="mt-6 w-full max-w-xs">
            <Button fullWidth size="lg">
              <Sparkles className="h-5 w-5" />
              Обновить тариф
            </Button>
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="relative overflow-hidden rounded-3xl bg-studio-card p-4 ring-1 ring-studio-accent/20 sm:p-6">
      <div
        className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-violet-500/20 blur-3xl"
        aria-hidden
      />
      <div className="relative">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-500/15 ring-1 ring-violet-400/30">
            <Music2 className="h-5 w-5 text-violet-200" />
          </div>
          <div>
            <h2 className="font-display text-2xl font-semibold">ИИ-композитор</h2>
            <p className="mt-1 text-sm text-studio-muted">
              Опишите минусовку своими словами — MusicGen соберёт авторский трек
              на 10–30 секунд.
            </p>
          </div>
        </div>

        <label className="mt-5 block">
          <span className="mb-2 block text-sm text-studio-muted">Описание трека</span>
          <textarea
            value={prompt}
            maxLength={400}
            rows={4}
            placeholder={PLACEHOLDER}
            onChange={(event) => setPrompt(event.target.value)}
            className="w-full resize-y rounded-2xl bg-studio-surface px-4 py-3 text-sm ring-1 ring-studio-border placeholder:text-studio-muted/70 focus:outline-none focus:ring-studio-accent"
          />
        </label>

        <div className="mt-4">
          <p className="mb-2 text-sm text-studio-muted">Длительность</p>
          <div className="flex flex-wrap gap-2">
            {DURATIONS.map((sec) => (
              <button
                key={sec}
                type="button"
                disabled={busy}
                onClick={() => setDuration(sec)}
                className={`rounded-full px-3 py-1.5 text-xs transition ring-1 ${
                  duration === sec
                    ? "bg-violet-500/25 text-violet-50 ring-violet-300/50"
                    : "bg-studio-surface text-violet-100 ring-violet-400/30 hover:bg-violet-500/15"
                }`}
              >
                {sec} сек
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {CHIPS.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => setPrompt(chip.prompt)}
              className="rounded-full bg-studio-surface px-3 py-1.5 text-xs text-violet-100 ring-1 ring-violet-400/30 transition hover:bg-violet-500/15"
            >
              {chip.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          disabled={busy || prompt.trim().length < 3}
          onClick={() => void generate()}
          className="mt-5 w-full rounded-2xl bg-gradient-to-r from-violet-500 via-fuchsia-500 to-amber-400 px-6 py-4 text-base font-semibold text-white shadow-[0_0_36px_rgba(192,132,252,0.5)] transition hover:shadow-[0_0_56px_rgba(232,121,249,0.7)] disabled:opacity-60"
        >
          <span className="inline-flex items-center justify-center gap-2">
            <Sparkles className="h-5 w-5" />
            Сгенерировать {duration} сек
          </span>
        </button>

        {busy && (
          <div className="mt-6 rounded-2xl bg-studio-bg/60 py-8">
            <Spinner size="lg" label={WAIT_STEPS[step]} />
          </div>
        )}

        {error && <p className="mt-4 text-sm text-amber-200">{error}</p>}

        {!busy && audioUrl && (
          <div className="mt-6 space-y-3 rounded-2xl bg-studio-bg/50 p-4 ring-1 ring-violet-400/20">
            <p className="text-sm font-medium text-violet-100">
              Готовая минусовка · {clipDuration ?? duration} сек
            </p>
            <MediaAudio src={audioUrl} controls className="w-full" preload="metadata" />
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                onClick={() =>
                  void downloadAudioUrl(
                    audioUrl,
                    `ai-minusovka.${extensionFor(audioMime)}`
                  )
                }
              >
                <Download className="h-4 w-4" />
                Скачать минусовку
              </Button>
              <SaveToLibraryButton
                url={audioUrl}
                source="mixer"
                title={prompt.trim().slice(0, 80) || "ИИ-минусовка"}
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
