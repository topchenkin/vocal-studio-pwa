"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookmarkPlus,
  Download,
  FolderOpen,
  Lock,
  Mic,
  Square,
  Sparkles,
  Upload,
  Waves,
} from "lucide-react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import LibraryTrackPicker from "@/components/student/LibraryTrackPicker";
import { useAuth } from "@/context/AuthContext";
import { AUDIO_FILE_ACCEPT, isAllowedAudioFile } from "@/lib/file-accept";
import { getSingingMicStream } from "@/lib/mic-audio";
import { beginAudioKeepAlive, endAudioKeepAlive } from "@/lib/audio-keep-alive";
import { cancelArmedIosCapture, releaseIosCapture } from "@/lib/ios-audio-session";
import { downloadAudioUrl, saveAudioFromUrl } from "@/lib/student-audio";
import { decodeBlobToAudioBuffer, encodeWavBlob } from "@/lib/wav-client";
import {
  VOCAL_FX_PRESETS,
  clampWet,
  connectVocalFx,
  renderVocalFxWav,
  vocalFxFileSlug,
  type VocalFxPreset,
} from "@/lib/vocal-fx";
import CabinetTabLink from "@/components/dashboard/CabinetTabLink";

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_RECORD_SEC = 90;

type Props = { locked?: boolean };

const PRESET_GROUPS = Array.from(
  new Set(VOCAL_FX_PRESETS.map((item) => item.group))
);

function pickRecorderMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg",
  ];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function formatTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function ensureAudioContext(): AudioContext {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  return new Ctor();
}

export default function VocalFxBox({ locked = false }: Props) {
  const { user, isAdmin, tier } = useAuth();
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [fileName, setFileName] = useState("");
  const [preset, setPreset] = useState<VocalFxPreset>("hall");
  const [wet, setWet] = useState(0.7);
  const [playing, setPlaying] = useState(false);
  const [recording, setRecording] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const fxRef = useRef<{ stop: () => void } | null>(null);
  const startedAtRef = useRef(0);
  const offsetRef = useRef(0);
  const rafRef = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recordTimerRef = useRef(0);
  const playingRef = useRef(false);
  const genRef = useRef(0);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const presetRef = useRef(preset);
  const wetRef = useRef(wet);
  const saveUrlRef = useRef("");

  bufferRef.current = buffer;
  presetRef.current = preset;
  wetRef.current = wet;
  playingRef.current = playing;

  const activePreset = useMemo(
    () => VOCAL_FX_PRESETS.find((item) => item.id === preset) ?? VOCAL_FX_PRESETS[0],
    [preset]
  );

  const closeGraph = useCallback(() => {
    genRef.current += 1;
    fxRef.current?.stop();
    fxRef.current = null;
    for (const source of sourcesRef.current) {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
      try {
        source.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    sourcesRef.current = [];
  }, []);

  const stopPlayback = useCallback(() => {
    if (playingRef.current && ctxRef.current) {
      offsetRef.current += Math.max(
        0,
        ctxRef.current.currentTime - startedAtRef.current
      );
    }
    closeGraph();
    playingRef.current = false;
    setPlaying(false);
    endAudioKeepAlive();
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  }, [closeGraph]);

  const drawWave = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;
    const width = canvas.width;
    const height = canvas.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "rgba(10,10,18,0.9)";
    ctx.fillRect(0, 0, width, height);
    ctx.beginPath();
    ctx.strokeStyle = "#c084fc";
    ctx.lineWidth = 2;
    const slice = width / data.length;
    for (let i = 0; i < data.length; i += 1) {
      const x = i * slice;
      const y = (data[i] / 255) * height;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    if (playingRef.current) {
      rafRef.current = requestAnimationFrame(drawWave);
    }
  }, []);

  const startPlayback = useCallback(
    async (fromSec?: number) => {
      const audio = bufferRef.current;
      if (!audio) return;
      if (!ctxRef.current || ctxRef.current.state === "closed") {
        ctxRef.current = ensureAudioContext();
      }
      const ctx = ctxRef.current;
      if (ctx.state === "suspended") await ctx.resume();
      closeGraph();
      if (!analyserRef.current || analyserRef.current.context !== ctx) {
        analyserRef.current = ctx.createAnalyser();
        analyserRef.current.fftSize = 2048;
        analyserRef.current.connect(ctx.destination);
      }
      const analyser = analyserRef.current;
      const input = ctx.createGain();
      const output = ctx.createGain();
      output.connect(analyser);

      const offset = Math.min(
        audio.duration - 0.02,
        Math.max(0, fromSec ?? offsetRef.current)
      );
      const gen = genRef.current;
      const source = ctx.createBufferSource();
      source.buffer = audio;
      source.connect(input);
      source.start(ctx.currentTime, offset);
      source.onended = () => {
        if (genRef.current !== gen) return;
        sourcesRef.current = sourcesRef.current.filter((item) => item !== source);
        if (sourcesRef.current.length === 0) {
          offsetRef.current = 0;
          playingRef.current = false;
          setPlaying(false);
          endAudioKeepAlive();
        }
      };
      sourcesRef.current.push(source);
      fxRef.current = connectVocalFx(
        ctx,
        input,
        output,
        presetRef.current,
        wetRef.current
      );
      startedAtRef.current = ctx.currentTime;
      offsetRef.current = offset;
      playingRef.current = true;
      setPlaying(true);
      beginAudioKeepAlive();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(drawWave);
    },
    [closeGraph, drawWave]
  );

  useEffect(() => {
    return () => {
      stopPlayback();
      if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      releaseIosCapture(streamRef.current);
      if (saveUrlRef.current) URL.revokeObjectURL(saveUrlRef.current);
      const ctx = ctxRef.current;
      ctxRef.current = null;
      if (ctx && ctx.state !== "closed") void ctx.close();
    };
  }, [stopPlayback]);

  const adoptBuffer = (decoded: AudioBuffer, name: string) => {
    stopPlayback();
    offsetRef.current = 0;
    setSaved(false);
    setBuffer(decoded);
    setFileName(name.replace(/\.\w+$/, "") || "вокал");
  };

  const loadFile = async (file?: File) => {
    if (!file) return;
    if (!isAllowedAudioFile(file)) {
      setError("Нужен MP3 или WAV.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Файл больше 10MB.");
      return;
    }
    setError("");
    try {
      const decoded = await decodeBlobToAudioBuffer(file);
      adoptBuffer(decoded, file.name);
    } catch {
      setError("Не удалось прочитать файл. Попробуйте MP3 или WAV.");
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
  };

  const startRecording = async () => {
    setError("");
    stopPlayback();
    try {
      const stream = await getSingingMicStream();
      streamRef.current = stream;
      const mime = pickRecorderMime();
      const recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        releaseIosCapture(stream);
        streamRef.current = null;
        setRecording(false);
        if (recordTimerRef.current) {
          window.clearInterval(recordTimerRef.current);
          recordTimerRef.current = 0;
        }
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        if (blob.size < 64) {
          setError("Запись слишком короткая.");
          return;
        }
        try {
          const decoded = await decodeBlobToAudioBuffer(blob);
          adoptBuffer(decoded, "запись");
        } catch {
          setError("Не удалось разобрать запись. Попробуйте ещё раз.");
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setElapsed(0);
      const started = Date.now();
      recordTimerRef.current = window.setInterval(() => {
        const sec = (Date.now() - started) / 1000;
        setElapsed(sec);
        if (sec >= MAX_RECORD_SEC) stopRecording();
      }, 200);
    } catch {
      cancelArmedIosCapture();
      setError("Разрешите микрофон в браузере и повторите.");
    }
  };

  const togglePlay = async () => {
    if (!buffer) return;
    if (playing) {
      stopPlayback();
      return;
    }
    await startPlayback(offsetRef.current);
  };

  const changePreset = (next: VocalFxPreset) => {
    setPreset(next);
    if (playingRef.current) {
      const ctx = ctxRef.current;
      const pos = ctx
        ? offsetRef.current + (ctx.currentTime - startedAtRef.current)
        : offsetRef.current;
      void startPlayback(pos);
    }
  };

  const changeWet = (value: number) => {
    const next = clampWet(value);
    setWet(next);
    if (playingRef.current && presetRef.current !== "original") {
      const ctx = ctxRef.current;
      const pos = ctx
        ? offsetRef.current + (ctx.currentTime - startedAtRef.current)
        : offsetRef.current;
      wetRef.current = next;
      void startPlayback(pos);
    }
  };

  const renderWavBlob = async () => {
    if (!buffer) throw new Error("Нет аудио");
    const rendered = await renderVocalFxWav(buffer, preset, wet);
    const channels: Float32Array[] = [];
    for (let i = 0; i < rendered.numberOfChannels; i += 1) {
      channels.push(rendered.getChannelData(i));
    }
    return encodeWavBlob(channels, rendered.sampleRate);
  };

  const download = async () => {
    if (!buffer || rendering) return;
    setRendering(true);
    setError("");
    try {
      const wav = await renderWavBlob();
      const url = URL.createObjectURL(wav);
      await downloadAudioUrl(
        url,
        `${fileName || "vocal"}-${vocalFxFileSlug(preset)}.wav`
      );
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch {
      setError("Не удалось собрать WAV. Попробуйте короче запись.");
    } finally {
      setRendering(false);
    }
  };

  const openSave = async () => {
    if (!buffer || rendering || !user) return;
    setRendering(true);
    setError("");
    try {
      const wav = await renderWavBlob();
      if (saveUrlRef.current) URL.revokeObjectURL(saveUrlRef.current);
      saveUrlRef.current = URL.createObjectURL(wav);
      setSaveName(`${fileName || "вокал"} · ${activePreset.label}`);
      setSaveOpen(true);
    } catch {
      setError("Не удалось подготовить файл для «Мои аудио».");
    } finally {
      setRendering(false);
    }
  };

  const saveToLibrary = async () => {
    if (!user || saving || !saveUrlRef.current) return;
    const nextTitle = saveName.trim();
    if (!nextTitle) {
      setError("Напишите название трека");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await saveAudioFromUrl({
        url: saveUrlRef.current,
        source: "vocalfx",
        title: nextTitle,
        userId: user.id,
        isAdmin,
      });
      setSaved(true);
      setSaveOpen(false);
      window.dispatchEvent(new Event("uvs-audio-saved"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  if (locked) {
    return (
      <section className="relative overflow-hidden rounded-3xl bg-studio-surface p-5 ring-1 ring-studio-border sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-studio-bg/40 backdrop-blur-[2px]" />
        <div className="relative z-10 flex flex-col items-center py-10 text-center">
          <Lock className="h-7 w-7 text-amber-300" />
          <h2 className="mt-4 font-display text-2xl font-semibold">
            Обработка голоса
          </h2>
          <p className="mt-2 max-w-sm text-sm text-studio-muted">
            Инструмент доступен по тарифу администратора. Сейчас у вас:{" "}
            <span className="font-medium text-studio-text">{tier}</span>.
          </p>
          <Link href="/dashboard/student/subscription" className="mt-6 w-full max-w-xs">
            <Button fullWidth size="lg">
              <Sparkles className="h-5 w-5" />
              Купить премиум
            </Button>
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-3xl bg-studio-surface p-4 ring-1 ring-studio-border sm:p-6">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-fuchsia-500/15 text-fuchsia-300">
          <Waves className="h-6 w-6" />
        </div>
        <div>
          <h2 className="font-display text-2xl font-semibold">
            Обработка голоса
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-studio-muted">
            Ваша домашняя студия эффектов: запишите дубль, загрузите MP3 или
            возьмите трек из «Мои аудио» — и за секунду примерьте собор,
            улицу, винтажное радио, дабл-трек или гейт 80-х. Слушайте вживую,
            крутите глубину эффекта и сохраняйте готовый вокал обратно в
            кабинет. Всё считается в браузере, без сервера и ожидания.
          </p>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={AUDIO_FILE_ACCEPT}
        className="hidden"
        onChange={(event) => void loadFile(event.target.files?.[0])}
      />

      <div className="mt-5 grid gap-2 sm:grid-cols-3">
        <Button
          variant={recording ? "danger" : "secondary"}
          onClick={() => (recording ? stopRecording() : void startRecording())}
        >
          {recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          {recording ? `Стоп · ${formatTime(elapsed)}` : "Запись"}
        </Button>
        <Button variant="secondary" onClick={() => fileRef.current?.click()}>
          <Upload className="h-4 w-4" />
          Загрузить MP3/WAV
        </Button>
        <Button variant="secondary" onClick={() => setLibraryOpen(true)}>
          <FolderOpen className="h-4 w-4" />
          Из «Мои аудио»
        </Button>
      </div>

      <canvas
        ref={canvasRef}
        width={640}
        height={120}
        className="mt-5 h-24 w-full rounded-2xl bg-black/50 ring-1 ring-fuchsia-500/20"
      />

      <label className="mt-5 block text-sm text-studio-muted">
        Стиль обработки
        <select
          value={preset}
          onChange={(event) => changePreset(event.target.value as VocalFxPreset)}
          className="mt-1 w-full rounded-xl bg-studio-bg px-3 py-2.5 text-studio-text ring-1 ring-fuchsia-400/40"
        >
          {PRESET_GROUPS.map((group) => (
            <optgroup key={group} label={group}>
              {VOCAL_FX_PRESETS.filter((item) => item.group === group).map(
                (item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                )
              )}
            </optgroup>
          ))}
        </select>
      </label>
      <p className="mt-2 rounded-2xl bg-fuchsia-500/10 px-4 py-3 text-sm text-fuchsia-100 ring-1 ring-fuchsia-400/30">
        {activePreset.hint}
      </p>

      <label className="mt-5 block text-sm text-studio-muted">
        Эффект (Wet/Dry): {Math.round(wet * 100)}%
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(wet * 100)}
          onChange={(event) => changeWet(Number(event.target.value) / 100)}
          className="mt-2 w-full accent-fuchsia-400"
        />
      </label>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button onClick={() => void togglePlay()} disabled={!buffer}>
          {playing ? <Square className="h-4 w-4" /> : <Waves className="h-4 w-4" />}
          {playing ? "Стоп" : "Слушать"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => void download()}
          disabled={!buffer || rendering}
        >
          <Download className="h-4 w-4" />
          {rendering ? "Собираем WAV…" : "Скачать обработанный трек"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => void openSave()}
          disabled={!buffer || rendering || !user}
        >
          <BookmarkPlus className="h-4 w-4" />
          {saved ? "В кабинете" : "В «Мои аудио»"}
        </Button>
      </div>

      {saved && (
        <CabinetTabLink
          href={
            isAdmin
              ? "/dashboard/admin?tab=audio"
              : "/dashboard/student?tab=audio"
          }
          tabId="audio"
          className="mt-2 inline-block text-[11px] text-studio-accent hover:underline"
        >
          Открыть библиотеку
        </CabinetTabLink>
      )}

      {buffer && (
        <p className="mt-3 text-xs text-studio-muted">
          {fileName || "трек"} · {formatTime(buffer.duration)}
        </p>
      )}
      {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}

      <LibraryTrackPicker
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onPicked={(decoded, title) => {
          setError("");
          adoptBuffer(decoded, title);
        }}
      />

      <Modal
        open={saveOpen}
        onClose={() => {
          if (!saving) setSaveOpen(false);
        }}
        title="Сохранить в Мои аудио"
        size="sm"
      >
        <label className="block text-sm">
          <span className="mb-1.5 block text-studio-muted">Название трека</span>
          <input
            autoFocus
            value={saveName}
            maxLength={120}
            onChange={(event) => setSaveName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void saveToLibrary();
              }
            }}
            className="w-full rounded-xl bg-studio-surface px-3 py-2.5 text-sm ring-1 ring-studio-border"
            placeholder="Например, Куплет · Церковь"
          />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={saving}
            onClick={() => setSaveOpen(false)}
          >
            Отмена
          </Button>
          <Button size="sm" disabled={saving || !user} onClick={() => void saveToLibrary()}>
            {saving ? "Сохраняем…" : "Сохранить"}
          </Button>
        </div>
      </Modal>
    </section>
  );
}
