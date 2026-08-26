"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Download,
  Headphones,
  Library,
  Mic,
  Square,
  Sparkles,
  Upload,
} from "lucide-react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import MediaAudio from "@/components/media/MediaAudio";
import Spinner from "@/components/ui/Spinner";
import SaveToLibraryButton from "@/components/student/SaveToLibraryButton";
import { useAuth } from "@/context/AuthContext";
import { AUDIO_FILE_ACCEPT, isAllowedAudioFile } from "@/lib/file-accept";
import { getSingingMicStream } from "@/lib/mic-audio";
import { releaseIosCapture } from "@/lib/ios-audio-session";
import {
  DEFAULT_BACKING_GAIN,
  DEFAULT_VOCAL_GAIN,
  mixAndEnhanceAudio,
  pickRecorderMime,
} from "@/lib/pocket-studio";
import { decodeBlobToAudioBuffer } from "@/lib/wav-client";
import { downloadAudioUrl } from "@/lib/student-audio";
import { supabase } from "@/lib/supabase";
import { rewriteSupabaseAssetUrl } from "@/lib/supabase-origin";
import type { Exercise } from "@/types";

const MAX_RECORD_SEC = 600;

type Stage = "setup" | "ready" | "recording" | "mix";

type LibraryItem = { id: string; title: string; url: string };

function revoke(url: string | null) {
  if (url) URL.revokeObjectURL(url);
}

function micMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : "";
  if (/NotAllowed|Permission|denied/i.test(text)) {
    return "Разрешите доступ к микрофону в настройках браузера.";
  }
  if (/NotFound|DevicesNotFound/i.test(text)) {
    return "Микрофон не найден. Подключите его и попробуйте снова.";
  }
  return text || "Не удалось включить микрофон. Проверьте разрешения.";
}

export default function PocketStudio() {
  const { tier, isAdmin } = useAuth();
  const canEnhance = isAdmin || tier === "premium" || tier === "vip";

  const [stage, setStage] = useState<Stage>("setup");
  const [backingName, setBackingName] = useState("");
  const [backingUrl, setBackingUrl] = useState<string | null>(null);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [studioMix, setStudioMix] = useState(false);
  const [mixUrl, setMixUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [vocalPct, setVocalPct] = useState(100);
  const [musicPct, setMusicPct] = useState(80);

  const backingAudioRef = useRef<HTMLAudioElement | null>(null);
  const backingBufferRef = useRef<AudioBuffer | null>(null);
  const vocalBufferRef = useRef<AudioBuffer | null>(null);
  const backingUrlRef = useRef<string | null>(null);
  const mixUrlRef = useRef<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number>(0);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const canEnhanceRef = useRef(canEnhance);
  canEnhanceRef.current = canEnhance;
  const vocalPctRef = useRef(vocalPct);
  vocalPctRef.current = vocalPct;
  const musicPctRef = useRef(musicPct);
  musicPctRef.current = musicPct;
  const studioMixRef = useRef(studioMix);
  studioMixRef.current = studioMix;
  const stageRef = useRef(stage);
  stageRef.current = stage;
  const sliderSnapshotRef = useRef({ vocal: vocalPct, music: musicPct });

  const setBackingObjectUrl = useCallback((next: string | null) => {
    revoke(backingUrlRef.current);
    backingUrlRef.current = next;
    setBackingUrl(next);
  }, []);

  const setMixObjectUrl = useCallback((next: string | null) => {
    revoke(mixUrlRef.current);
    mixUrlRef.current = next;
    setMixUrl(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error: queryError } = await supabase
        .from("exercises")
        .select("id,title,type,storage_path,media_url")
        .eq("type", "audio")
        .order("title");
      if (cancelled || queryError) return;
      const items = await Promise.all(
        (data ?? []).map(async (row) => {
          const exercise = row as Pick<
            Exercise,
            "id" | "title" | "storage_path" | "media_url"
          >;
          let url = exercise.media_url || "";
          if (exercise.storage_path) {
            const { data: signed } = await supabase.storage
              .from("exercise-media")
              .createSignedUrl(exercise.storage_path, 60 * 60);
            url = rewriteSupabaseAssetUrl(signed?.signedUrl ?? url);
          }
          return url ? { id: exercise.id, title: exercise.title, url } : null;
        })
      );
      if (!cancelled) {
        setLibrary(items.filter((item): item is LibraryItem => Boolean(item)));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const stopMic = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        /* already stopped */
      }
    }
    recorderRef.current = null;
    const stream = streamRef.current;
    stream?.getTracks().forEach((track) => track.stop());
    releaseIosCapture(stream);
    streamRef.current = null;
    window.clearInterval(timerRef.current);
  }, []);

  useEffect(() => {
    return () => {
      stopMic();
      backingAudioRef.current?.pause();
      revoke(backingUrlRef.current);
      revoke(mixUrlRef.current);
    };
  }, [stopMic]);

  const loadBacking = async (file: File | Blob, name: string) => {
    setError("");
    const buffer = await decodeBlobToAudioBuffer(file);
    backingBufferRef.current = buffer;
    const url = URL.createObjectURL(file);
    setBackingObjectUrl(url);
    setBackingName(name);
    setStage("ready");
    setStudioMix(false);
    setMixObjectUrl(null);
    vocalBufferRef.current = null;
  };

  const onUpload = async (file: File | null) => {
    if (!file) return;
    if (!isAllowedAudioFile(file)) {
      setError("Выберите аудио: MP3, M4A, WAV, OGG, AAC или FLAC.");
      return;
    }
    try {
      await loadBacking(file, file.name.replace(/\.[^.]+$/, "") || "Минусовка");
    } catch {
      setError("Не удалось прочитать минусовку. Попробуйте другой файл.");
    }
  };

  const onPickLibrary = async (item: LibraryItem) => {
    setLibraryOpen(false);
    setError("");
    try {
      const response = await fetch(item.url);
      if (!response.ok) throw new Error("fetch");
      const blob = await response.blob();
      await loadBacking(blob, item.title);
    } catch {
      setError("Не удалось загрузить минусовку из базы.");
    }
  };

  const renderMix = useCallback(
    async (applyEffects: boolean) => {
      const backing = backingBufferRef.current;
      const vocal = vocalBufferRef.current;
      if (!backing || !vocal) return;
      setRendering(true);
      setError("");
      try {
        const blob = await mixAndEnhanceAudio(backing, vocal, applyEffects, {
          vocalGain: (vocalPctRef.current / 100) * DEFAULT_VOCAL_GAIN,
          backingGain: (musicPctRef.current / 100) * (DEFAULT_BACKING_GAIN / 0.8),
        });
        setMixObjectUrl(URL.createObjectURL(blob));
        setStudioMix(applyEffects);
      } catch {
        setError("Не удалось свести трек. Попробуйте короче запись.");
      } finally {
        setRendering(false);
      }
    },
    [setMixObjectUrl]
  );

  const startRecording = async () => {
    const audio = backingAudioRef.current;
    if (!audio || !backingBufferRef.current) return;
    setError("");
    try {
      const stream = await getSingingMicStream();
      streamRef.current = stream;
      chunksRef.current = [];
      const mime = pickRecorderMime();
      const recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setError("Запись прервалась. Попробуйте ещё раз.");
        stopMic();
        audio.pause();
        setStage("ready");
      };
      audio.currentTime = 0;
      recorder.start(250);
      await audio.play();
      setElapsed(0);
      setStage("recording");
      const startedAt = performance.now();
      timerRef.current = window.setInterval(() => {
        const sec = (performance.now() - startedAt) / 1000;
        setElapsed(sec);
        if (sec >= MAX_RECORD_SEC) {
          void stopRecording();
        }
      }, 200);
    } catch (caught) {
      stopMic();
      backingAudioRef.current?.pause();
      setError(micMessage(caught));
      setStage("ready");
    }
  };

  const stopRecording = async () => {
    const audio = backingAudioRef.current;
    audio?.pause();
    const recorder = recorderRef.current;
    const mime = recorder?.mimeType || "audio/webm";
    const stopped = new Promise<Blob>((resolve) => {
      if (!recorder || recorder.state === "inactive") {
        resolve(new Blob(chunksRef.current, { type: mime }));
        return;
      }
      recorder.onstop = () => {
        resolve(new Blob(chunksRef.current, { type: mime }));
      };
      try {
        recorder.stop();
      } catch {
        resolve(new Blob(chunksRef.current, { type: mime }));
      }
    });
    window.clearInterval(timerRef.current);
    const blob = await stopped;
    const stream = streamRef.current;
    stream?.getTracks().forEach((track) => track.stop());
    releaseIosCapture(stream);
    streamRef.current = null;
    recorderRef.current = null;

    if (blob.size < 1024) {
      setError("Запись получилась пустой. Проверьте микрофон и наушники.");
      setStage("ready");
      return;
    }
    try {
      vocalBufferRef.current = await decodeBlobToAudioBuffer(blob);
      setStage("mix");
      await renderMix(false);
    } catch {
      setError("Не удалось разобрать запись голоса. Попробуйте ещё раз.");
      setStage("ready");
    }
  };

  const requestStudio = () => {
    if (!canEnhance) {
      setPaywallOpen(true);
      return;
    }
    void renderMix(true);
  };

  const onSliderPointer = () => {
    if (canEnhance) return;
    setPaywallOpen(true);
  };

  useEffect(() => {
    if (stage !== "mix" || !canEnhance) return;
    const prev = sliderSnapshotRef.current;
    if (prev.vocal === vocalPct && prev.music === musicPct) return;
    sliderSnapshotRef.current = { vocal: vocalPct, music: musicPct };
    const handle = window.setTimeout(() => {
      void renderMix(studioMixRef.current);
    }, 420);
    return () => window.clearTimeout(handle);
  }, [vocalPct, musicPct, canEnhance, renderMix, stage]);

  const formatClock = (sec: number) => {
    const total = Math.max(0, Math.floor(sec));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  };

  return (
    <section className="relative overflow-hidden rounded-3xl bg-studio-card p-4 ring-1 ring-studio-accent/20 sm:p-6">
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-violet-500/15 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-20 -left-10 h-40 w-40 rounded-full bg-fuchsia-500/10 blur-3xl"
        aria-hidden
      />

      <div className="relative">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-500/15 ring-1 ring-violet-400/30">
            <Sparkles className="h-5 w-5 text-violet-200" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-2xl font-semibold">Карманная студия</h2>
            <p className="mt-1 text-sm text-studio-muted">
              Пойте под минусовку — сведём голос со студийной обработкой прямо на
              телефоне.
            </p>
          </div>
        </div>

        <p className="mt-4 flex items-start gap-2 text-[11px] text-studio-muted">
          <Headphones className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
          Надевайте наушники: так минус не попадёт в микрофон и сведение будет чистым.
        </p>

        {backingUrl && (
          <MediaAudio
            ref={backingAudioRef}
            src={backingUrl}
            preload="auto"
            className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0"
            onEnded={() => {
              if (stageRef.current === "recording") void stopRecording();
            }}
          />
        )}

        {stage !== "mix" && (
          <div className="mt-5 space-y-3">
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                variant="secondary"
                onClick={() => fileRef.current?.click()}
                disabled={stage === "recording"}
              >
                <Upload className="h-4 w-4" />
                Загрузить минусовку
              </Button>
              <Button
                variant="secondary"
                onClick={() => setLibraryOpen(true)}
                disabled={stage === "recording" || library.length === 0}
              >
                <Library className="h-4 w-4" />
                Из базы
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept={AUDIO_FILE_ACCEPT}
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  event.target.value = "";
                  void onUpload(file);
                }}
              />
            </div>
            {backingName && (
              <p className="text-center text-sm text-violet-100">
                Минус: <span className="font-medium">{backingName}</span>
              </p>
            )}
            {stage === "recording" ? (
              <div className="flex flex-col items-center gap-3">
                <p className="animate-pulse font-display text-3xl text-red-300">
                  ● {formatClock(elapsed)}
                </p>
                <Button variant="danger" size="lg" onClick={() => void stopRecording()}>
                  <Square className="h-4 w-4 fill-current" />
                  Остановить
                </Button>
              </div>
            ) : (
              <Button
                size="lg"
                fullWidth
                disabled={stage !== "ready"}
                onClick={() => void startRecording()}
              >
                <Mic className="h-5 w-5" />
                Начать запись
              </Button>
            )}
          </div>
        )}

        {stage === "mix" && (
          <div className="mt-6 space-y-5">
            <div>
              <h3 className="font-display text-xl font-semibold">Ваш микс</h3>
              <p className="mt-1 text-sm text-studio-muted">
                {studioMix
                  ? "Студийная обработка наложена: воздух, компрессия и ревер."
                  : "Черновой микс без эффектов. Premium добавит студийную цепь."}
              </p>
            </div>

            <div className="space-y-4 rounded-2xl bg-studio-surface p-4 ring-1 ring-studio-border">
              <label className="block">
                <span className="mb-2 flex items-center justify-between text-sm">
                  Громкость голоса
                  <span className="text-studio-muted">{vocalPct}%</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={150}
                  value={vocalPct}
                  disabled={!canEnhance || rendering}
                  onPointerDown={onSliderPointer}
                  onChange={(event) => {
                    if (!canEnhance) return;
                    setVocalPct(Number(event.target.value));
                  }}
                  className="w-full accent-violet-400 disabled:opacity-40"
                />
              </label>
              <label className="block">
                <span className="mb-2 flex items-center justify-between text-sm">
                  Громкость музыки
                  <span className="text-studio-muted">{musicPct}%</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={musicPct}
                  disabled={!canEnhance || rendering}
                  onPointerDown={onSliderPointer}
                  onChange={(event) => {
                    if (!canEnhance) return;
                    setMusicPct(Number(event.target.value));
                  }}
                  className="w-full accent-violet-400 disabled:opacity-40"
                />
              </label>
              {!canEnhance && (
                <p className="text-center text-[11px] text-amber-200/80">
                  Ползунки доступны на Premium и VIP
                </p>
              )}
            </div>

            <button
              type="button"
              disabled={rendering}
              onClick={requestStudio}
              className="relative w-full overflow-hidden rounded-2xl bg-gradient-to-r from-violet-500 via-fuchsia-500 to-amber-400 px-6 py-4 text-base font-semibold text-white shadow-[0_0_36px_rgba(192,132,252,0.55)] transition hover:shadow-[0_0_56px_rgba(232,121,249,0.7)] disabled:opacity-60"
            >
              <span className="relative z-10 inline-flex items-center justify-center gap-2">
                <Sparkles className="h-5 w-5" />
                Сделать студийно
              </span>
            </button>
            <p className="text-center text-[11px] text-studio-muted">
              Накладывает эквалайзер, компрессор и реверберацию
            </p>

            {rendering && (
              <div className="rounded-2xl bg-studio-bg/60 py-8">
                <Spinner size="lg" label="Сводим трек…" />
              </div>
            )}

            {!rendering && mixUrl && (
              <div className="space-y-3 rounded-2xl bg-studio-bg/50 p-4 ring-1 ring-violet-400/20">
                <MediaAudio
                  src={mixUrl}
                  controls
                  className="w-full"
                  preload="metadata"
                />
                <div className="flex flex-wrap justify-center gap-2">
                  <Button
                    onClick={() =>
                      void downloadAudioUrl(
                        mixUrl,
                        `${backingName || "pocket-studio"}-mix.wav`
                      )
                    }
                  >
                    <Download className="h-4 w-4" />
                    Скачать трек
                  </Button>
                  <SaveToLibraryButton
                    url={mixUrl}
                    source="mixer"
                    title={`${backingName || "Карманная студия"} — микс`}
                  />
                </div>
              </div>
            )}

            <Button
              variant="secondary"
              fullWidth
              disabled={rendering}
              onClick={() => {
                setStage("ready");
                setStudioMix(false);
                setMixObjectUrl(null);
                vocalBufferRef.current = null;
              }}
            >
              Записать снова
            </Button>
          </div>
        )}

        {error && <p className="mt-4 text-sm text-red-300">{error}</p>}
      </div>

      <Modal
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        title="Минусовка из базы"
        size="md"
      >
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {library.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => void onPickLibrary(item)}
                className="w-full rounded-xl px-3 py-2.5 text-left text-sm hover:bg-studio-surface"
              >
                {item.title}
              </button>
            </li>
          ))}
        </ul>
      </Modal>

      <Modal
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        title="Premium"
        size="sm"
      >
        <p className="text-sm text-studio-muted">
          Студийная обработка вокала доступна только в Premium.
        </p>
        <Link href="/dashboard/student/subscription" className="mt-5 block">
          <Button fullWidth>
            <Sparkles className="h-4 w-4" />
            Обновить тариф
          </Button>
        </Link>
      </Modal>
    </section>
  );
}
