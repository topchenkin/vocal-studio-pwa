"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  Layers,
  Mic,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Square,
  Trash2,
} from "lucide-react";
import Button from "@/components/ui/Button";
import { decodeBlobToAudioBuffer, mixAudioBuffers } from "@/lib/wav-client";

const MAX_TRACKS = 10;

type Track = {
  id: string;
  name: string;
  blob: Blob;
  url: string;
  durationSec: number;
  peaks: number[];
};

type Props = { locked?: boolean };

function buildPeaks(buffer: AudioBuffer, buckets = 96): number[] {
  const channel = buffer.getChannelData(0);
  const block = Math.max(1, Math.floor(channel.length / buckets));
  const peaks: number[] = [];
  for (let i = 0; i < buckets; i += 1) {
    let peak = 0;
    const start = i * block;
    const end = Math.min(channel.length, start + block);
    for (let j = start; j < end; j += 1) {
      peak = Math.max(peak, Math.abs(channel[j] ?? 0));
    }
    peaks.push(peak);
  }
  const max = Math.max(...peaks, 0.001);
  return peaks.map((p) => p / max);
}

function Waveform({
  peaks,
  progress = 0,
  active = false,
}: {
  peaks: number[];
  progress?: number;
  active?: boolean;
}) {
  return (
    <div className="flex h-12 items-end gap-[2px] rounded-xl bg-studio-bg px-2 py-1.5 ring-1 ring-studio-border">
      {peaks.map((peak, index) => {
        const filled = index / Math.max(1, peaks.length - 1) <= progress;
        return (
          <span
            key={index}
            className={`w-full rounded-sm ${
              filled || active
                ? "bg-gradient-to-t from-studio-accent to-studio-gold"
                : "bg-studio-accent/35"
            }`}
            style={{ height: `${Math.max(8, peak * 100)}%` }}
          />
        );
      })}
    </div>
  );
}

export default function MultitrackMixer({ locked = false }: Props) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playProgress, setPlayProgress] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [mixing, setMixing] = useState(false);
  const [mixUrl, setMixUrl] = useState("");
  const [mixPeaks, setMixPeaks] = useState<number[]>([]);
  const [error, setError] = useState("");

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const secondsRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const playStartedAtRef = useRef(0);
  const playDurationRef = useRef(0);
  const playRafRef = useRef<number | null>(null);

  const selectedTracks = useMemo(
    () => tracks.filter((track) => selectedIds.includes(track.id)),
    [selectedIds, tracks]
  );

  const stopPlayback = () => {
    if (playRafRef.current) cancelAnimationFrame(playRafRef.current);
    playRafRef.current = null;
    sourcesRef.current.forEach((source) => {
      try {
        source.stop();
      } catch {
        // already stopped
      }
    });
    sourcesRef.current = [];
    setPlaying(false);
    setPlayProgress(0);
  };

  const stopMic = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setRecordingId(null);
    setSeconds(0);
  };

  useEffect(
    () => () => {
      stopMic();
      stopPlayback();
      void audioCtxRef.current?.close();
      tracks.forEach((t) => URL.revokeObjectURL(t.url));
      if (mixUrl) URL.revokeObjectURL(mixUrl);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const ensureAudioCtx = async () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    if (audioCtxRef.current.state === "suspended") {
      await audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  };

  const playSelected = async () => {
    if (selectedTracks.length === 0 || recordingId) return;
    stopPlayback();
    try {
      const ctx = await ensureAudioCtx();
      const buffers = await Promise.all(
        selectedTracks.map((track) => decodeBlobToAudioBuffer(track.blob))
      );
      const duration = Math.max(...buffers.map((buffer) => buffer.duration), 0.1);
      playDurationRef.current = duration;
      playStartedAtRef.current = ctx.currentTime;
      sourcesRef.current = buffers.map((buffer) => {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start();
        return source;
      });
      setPlaying(true);
      const tick = () => {
        const elapsed = ctx.currentTime - playStartedAtRef.current;
        setPlayProgress(Math.min(1, elapsed / playDurationRef.current));
        if (elapsed >= playDurationRef.current) {
          stopPlayback();
          return;
        }
        playRafRef.current = requestAnimationFrame(tick);
      };
      playRafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось воспроизвести");
      stopPlayback();
    }
  };

  const startTrack = async () => {
    if (tracks.length >= MAX_TRACKS || recordingId) return;
    setError("");
    // During overdub: stop monitor playback so earlier tracks aren't heard in the take.
    stopPlayback();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;
      chunksRef.current = [];
      const id = crypto.randomUUID();
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";
      const recorder = new MediaRecorder(
        stream,
        mime ? { mimeType: mime } : undefined
      );
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        void (async () => {
          const blob = new Blob(chunksRef.current, {
            type: recorder.mimeType || "audio/webm",
          });
          const url = URL.createObjectURL(blob);
          const approxSec = secondsRef.current;
          let peaks = Array.from({ length: 64 }, () => 0.2);
          try {
            const buffer = await decodeBlobToAudioBuffer(blob);
            peaks = buildPeaks(buffer);
          } catch {
            // keep fallback peaks
          }
          setTracks((current) => {
            const next = [
              ...current,
              {
                id,
                name: `Дорожка ${current.length + 1}`,
                blob,
                url,
                durationSec: approxSec,
                peaks,
              },
            ];
            setSelectedIds((selected) => [...selected, id]);
            return next;
          });
          stopMic();
        })();
      };
      recorder.start(200);
      setRecordingId(id);
      secondsRef.current = 0;
      setSeconds(0);
      timerRef.current = window.setInterval(() => {
        secondsRef.current += 1;
        setSeconds(secondsRef.current);
      }, 1000);
    } catch {
      setError("Не удалось получить доступ к микрофону");
      stopMic();
    }
  };

  const stopTrack = () => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    } else {
      stopMic();
    }
  };

  const removeTrack = (id: string) => {
    setTracks((current) => {
      const track = current.find((t) => t.id === id);
      if (track) URL.revokeObjectURL(track.url);
      return current.filter((t) => t.id !== id);
    });
    setSelectedIds((current) => current.filter((item) => item !== id));
  };

  const resetAll = () => {
    if (recordingId) stopTrack();
    stopPlayback();
    setTracks((current) => {
      current.forEach((t) => URL.revokeObjectURL(t.url));
      return [];
    });
    setSelectedIds([]);
    if (mixUrl) {
      URL.revokeObjectURL(mixUrl);
      setMixUrl("");
    }
    setMixPeaks([]);
    setError("");
    setSeconds(0);
  };

  const mixAll = async () => {
    if (tracks.length === 0 || mixing) return;
    setMixing(true);
    setError("");
    try {
      const buffers = await Promise.all(
        tracks.map((track) => decodeBlobToAudioBuffer(track.blob))
      );
      const mixed = await mixAudioBuffers(buffers);
      const mixBuffer = await decodeBlobToAudioBuffer(mixed);
      if (mixUrl) URL.revokeObjectURL(mixUrl);
      setMixUrl(URL.createObjectURL(mixed));
      setMixPeaks(buildPeaks(mixBuffer, 120));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось свести дорожки"
      );
    } finally {
      setMixing(false);
    }
  };

  if (locked) {
    return (
      <section className="rounded-3xl bg-studio-surface p-6 text-center ring-1 ring-studio-border">
        <Sparkles className="mx-auto h-8 w-8 text-amber-300" />
        <h2 className="mt-3 font-display text-2xl font-semibold">
          Сведение дорожек
        </h2>
        <p className="mt-2 text-sm text-studio-muted">
          Мультитрек 1–10 дорожек доступен начиная с Standard (настраивается).
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-3xl bg-studio-surface p-4 ring-1 ring-studio-border sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
          <Layers className="h-5 w-5 text-emerald-300" />
        </div>
        <div>
          <h2 className="font-display text-2xl font-semibold">
            Сведение дорожек
          </h2>
          <p className="mt-1 text-sm text-studio-muted">
            Волна показывает, когда вступать. Можно слушать несколько дорожек
            сразу; при записи следующей они не звучат в мониторе.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        {!recordingId ? (
          <Button
            fullWidth
            size="lg"
            disabled={tracks.length >= MAX_TRACKS}
            onClick={() => void startTrack()}
          >
            <Plus className="h-5 w-5" />
            Записать дорожку ({tracks.length}/{MAX_TRACKS})
          </Button>
        ) : (
          <Button fullWidth size="lg" variant="danger" onClick={stopTrack}>
            <Square className="h-4 w-4 fill-current" />
            Стоп · {seconds}с · монитор выкл
          </Button>
        )}
        {selectedTracks.length > 0 && !recordingId && (
          <Button
            fullWidth
            size="lg"
            variant="secondary"
            onClick={() =>
              playing ? stopPlayback() : void playSelected()
            }
          >
            {playing ? (
              <Pause className="h-5 w-5" />
            ) : (
              <Play className="h-5 w-5" />
            )}
            {playing
              ? "Пауза"
              : `Слушать выбранные (${selectedTracks.length})`}
          </Button>
        )}
        {(tracks.length > 0 || mixUrl) && !recordingId && (
          <Button fullWidth size="lg" variant="secondary" onClick={resetAll}>
            <RotateCcw className="h-5 w-5" />
            Сбросить всё
          </Button>
        )}
      </div>

      {tracks.length > 0 && (
        <ul className="mt-5 space-y-3">
          {tracks.map((track, index) => {
            const selected = selectedIds.includes(track.id);
            return (
              <li
                key={track.id}
                className={`rounded-2xl bg-studio-card p-3 ring-1 transition ${
                  selected
                    ? "ring-studio-accent/50"
                    : "ring-studio-border"
                }`}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <label className="flex min-w-0 items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleSelect(track.id)}
                      disabled={Boolean(recordingId)}
                    />
                    <Mic className="h-4 w-4 shrink-0 text-studio-accent" />
                    <span className="truncate">
                      {track.name || `Дорожка ${index + 1}`}
                    </span>
                    <span className="text-xs text-studio-muted">
                      ~{track.durationSec}с
                    </span>
                  </label>
                  <button
                    type="button"
                    className="rounded-lg p-2 text-studio-muted hover:bg-studio-surface hover:text-red-300"
                    onClick={() => removeTrack(track.id)}
                    aria-label="Удалить дорожку"
                    disabled={Boolean(recordingId)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <Waveform
                  peaks={track.peaks}
                  progress={selected && playing ? playProgress : 0}
                  active={selected && playing}
                />
              </li>
            );
          })}
        </ul>
      )}

      {tracks.length > 0 && (
        <Button
          className="mt-4"
          fullWidth
          size="lg"
          disabled={mixing || Boolean(recordingId)}
          onClick={() => void mixAll()}
        >
          <Layers className="h-5 w-5" />
          {mixing ? "Сводим…" : `Свести все (${tracks.length}) в один файл`}
        </Button>
      )}

      {mixUrl && (
        <div className="mt-4 rounded-2xl bg-studio-card p-4 ring-1 ring-studio-border">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium">Результат сведения</span>
            <a
              href={mixUrl}
              download="uvs-mixdown.wav"
              className="rounded-lg p-2 text-studio-muted hover:bg-studio-surface hover:text-white"
              aria-label="Скачать микс"
            >
              <Download className="h-4 w-4" />
            </a>
          </div>
          {mixPeaks.length > 0 && <Waveform peaks={mixPeaks} />}
          <audio
            controls
            playsInline
            src={mixUrl}
            className="mt-3 h-10 w-full"
          />
        </div>
      )}

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
    </section>
  );
}
