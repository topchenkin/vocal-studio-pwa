"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Circle,
  Download,
  Headphones,
  Layers,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Square,
  Trash2,
} from "lucide-react";
import Button from "@/components/ui/Button";
import { decodeBlobToAudioBuffer, mixAudioBuffers } from "@/lib/wav-client";

const MAX_TRACKS = 10;
const PEAK_BUCKETS = 120;

type Track = {
  id: string;
  name: string;
  blob: Blob;
  url: string;
  durationSec: number;
  peaks: number[];
};

type Props = { locked?: boolean };

function buildPeaks(buffer: AudioBuffer, buckets = PEAK_BUCKETS): number[] {
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

function formatTime(sec: number) {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 10);
  return `${m}:${String(r).padStart(2, "0")}.${ms}`;
}

function WaveformLane({
  peaks,
  durationSec,
  timelineSec,
  playheadSec,
  tone = "accent",
  live = false,
}: {
  peaks: number[];
  durationSec: number;
  timelineSec: number;
  playheadSec: number;
  tone?: "accent" | "rec" | "mix";
  live?: boolean;
}) {
  const span = Math.max(timelineSec, 0.001);
  const widthPct = Math.min(100, (Math.max(durationSec, 0.05) / span) * 100);
  const playheadPct = Math.min(100, (playheadSec / span) * 100);
  const activeClass =
    tone === "rec"
      ? "bg-gradient-to-t from-rose-500 to-amber-300"
      : tone === "mix"
        ? "bg-gradient-to-t from-emerald-500 to-studio-accent"
        : "bg-gradient-to-t from-studio-accent to-studio-gold";
  const idleClass =
    tone === "rec" ? "bg-rose-400/35" : "bg-studio-accent/30";

  return (
    <div className="relative h-14 overflow-hidden rounded-xl bg-studio-bg ring-1 ring-studio-border">
      <div
        className="absolute inset-y-0 left-0 flex items-end gap-px px-1.5 py-1.5"
        style={{ width: `${widthPct}%` }}
      >
        {peaks.map((peak, index) => {
          const t = (index / Math.max(1, peaks.length - 1)) * durationSec;
          const played = live || t <= playheadSec;
          return (
            <span
              key={index}
              className={`w-full rounded-sm ${played ? activeClass : idleClass}`}
              style={{ height: `${Math.max(6, peak * 100)}%` }}
            />
          );
        })}
      </div>
      {playheadSec > 0 && (
        <div
          className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-white shadow-[0_0_8px_rgba(255,255,255,0.85)]"
          style={{ left: `${playheadPct}%` }}
        />
      )}
    </div>
  );
}

export default function MultitrackMixer({ locked = false }: Props) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [monitorIds, setMonitorIds] = useState<string[]>([]);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playheadSec, setPlayheadSec] = useState(0);
  const [inputLevel, setInputLevel] = useState(0);
  const [mixing, setMixing] = useState(false);
  const [mixUrl, setMixUrl] = useState("");
  const [mixPeaks, setMixPeaks] = useState<number[]>([]);
  const [error, setError] = useState("");

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const playStartedAtRef = useRef(0);
  const playDurationRef = useRef(0);
  const playRafRef = useRef<number | null>(null);
  const meterRafRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recordingIdRef = useRef<string | null>(null);
  const tracksRef = useRef<Track[]>([]);

  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);

  useEffect(() => {
    recordingIdRef.current = recordingId;
  }, [recordingId]);

  const monitorTracks = useMemo(
    () => tracks.filter((track) => monitorIds.includes(track.id)),
    [monitorIds, tracks]
  );

  const timelineSec = useMemo(() => {
    const longest = Math.max(
      0,
      ...tracks.map((track) => track.durationSec),
      playheadSec
    );
    return Math.max(longest, 4);
  }, [playheadSec, tracks]);

  const stopMeter = () => {
    if (meterRafRef.current) cancelAnimationFrame(meterRafRef.current);
    meterRafRef.current = null;
    analyserRef.current = null;
    setInputLevel(0);
  };

  const stopPlayback = (keepPlayhead = false) => {
    if (playRafRef.current) cancelAnimationFrame(playRafRef.current);
    playRafRef.current = null;
    sourcesRef.current.forEach((source) => {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
    });
    sourcesRef.current = [];
    setPlaying(false);
    if (!keepPlayhead) setPlayheadSec(0);
  };

  const stopMic = () => {
    stopMeter();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setRecordingId(null);
  };

  useEffect(
    () => () => {
      if (recorderRef.current?.state === "recording") {
        try {
          recorderRef.current.stop();
        } catch {
          /* ignore */
        }
      }
      stopMic();
      stopPlayback();
      void audioCtxRef.current?.close();
      tracksRef.current.forEach((t) => URL.revokeObjectURL(t.url));
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

  const startPlayhead = (ctx: AudioContext, durationSec: number) => {
    playDurationRef.current = Math.max(durationSec, 0.1);
    playStartedAtRef.current = ctx.currentTime;
    setPlaying(true);
    const tick = () => {
      const elapsed = ctx.currentTime - playStartedAtRef.current;
      setPlayheadSec(elapsed);
      const recording = Boolean(recordingIdRef.current);
      if (!recording && elapsed >= playDurationRef.current) {
        stopPlayback();
        return;
      }
      playRafRef.current = requestAnimationFrame(tick);
    };
    playRafRef.current = requestAnimationFrame(tick);
  };

  const playMonitorTracks = async (
    ctx: AudioContext,
    list: Track[],
    when: number
  ) => {
    if (list.length === 0) return 0;
    const buffers = await Promise.all(
      list.map((track) => decodeBlobToAudioBuffer(track.blob))
    );
    const duration = Math.max(...buffers.map((b) => b.duration), 0.1);
    sourcesRef.current = buffers.map((buffer) => {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(when);
      return source;
    });
    return duration;
  };

  const startInputMeter = (ctx: AudioContext, stream: MediaStream) => {
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    analyserRef.current = analyser;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) {
        const v = ((data[i] ?? 128) - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      setInputLevel(Math.min(1, rms * 3.2));
      meterRafRef.current = requestAnimationFrame(tick);
    };
    meterRafRef.current = requestAnimationFrame(tick);
  };

  const toggleMonitor = (id: string) => {
    if (recordingId || playing) return;
    setMonitorIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  };

  const listenOnly = async () => {
    if (recordingId || monitorTracks.length === 0) return;
    stopPlayback();
    setError("");
    try {
      const ctx = await ensureAudioCtx();
      const duration = await playMonitorTracks(
        ctx,
        monitorTracks,
        ctx.currentTime
      );
      startPlayhead(ctx, duration);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось воспроизвести");
      stopPlayback();
    }
  };

  /** Reaper-style overdub: play armed tracks + record new lane in sync. */
  const startOverdub = async () => {
    if (tracks.length >= MAX_TRACKS || recordingId) return;
    setError("");
    stopPlayback();

    try {
      const ctx = await ensureAudioCtx();
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
          const recordedSec =
            audioCtxRef.current && playStartedAtRef.current
              ? Math.max(
                  0.1,
                  audioCtxRef.current.currentTime - playStartedAtRef.current
                )
              : playheadSec;
          stopPlayback();
          stopMic();

          const blob = new Blob(chunksRef.current, {
            type: recorder.mimeType || "audio/webm",
          });
          const url = URL.createObjectURL(blob);
          let peaks = Array.from({ length: 64 }, () => 0.15);
          let durationSec = recordedSec;
          try {
            const buffer = await decodeBlobToAudioBuffer(blob);
            peaks = buildPeaks(buffer);
            durationSec = buffer.duration || recordedSec;
          } catch {
            /* keep approx */
          }
          setTracks((current) => {
            const next = [
              ...current,
              {
                id,
                name: `Дорожка ${current.length + 1}`,
                blob,
                url,
                durationSec,
                peaks,
              },
            ];
            setMonitorIds((selected) => [...selected, id]);
            return next;
          });
          setPlayheadSec(0);
        })();
      };

      const t0 = ctx.currentTime + 0.05;
      const monitorDuration = await playMonitorTracks(ctx, monitorTracks, t0);
      startInputMeter(ctx, stream);
      recorder.start(100);
      setRecordingId(id);
      // While recording, playhead runs freely (not capped by monitor length)
      startPlayhead(ctx, Math.max(monitorDuration, 60));
      // Align transport clock to scheduled start
      playStartedAtRef.current = t0;
    } catch {
      setError("Не удалось получить доступ к микрофону");
      stopMic();
      stopPlayback();
    }
  };

  const stopAll = () => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
      return;
    }
    stopMic();
    stopPlayback();
  };

  const removeTrack = (id: string) => {
    if (recordingId || playing) return;
    setTracks((current) => {
      const track = current.find((t) => t.id === id);
      if (track) URL.revokeObjectURL(track.url);
      return current.filter((t) => t.id !== id);
    });
    setMonitorIds((current) => current.filter((item) => item !== id));
  };

  const resetAll = () => {
    stopAll();
    setTracks((current) => {
      current.forEach((t) => URL.revokeObjectURL(t.url));
      return [];
    });
    setMonitorIds([]);
    if (mixUrl) {
      URL.revokeObjectURL(mixUrl);
      setMixUrl("");
    }
    setMixPeaks([]);
    setError("");
    setPlayheadSec(0);
  };

  const mixAll = async () => {
    if (tracks.length === 0 || mixing || recordingId) return;
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
      setMixPeaks(buildPeaks(mixBuffer, 140));
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

  const busy = Boolean(recordingId) || playing;

  return (
    <section className="rounded-3xl bg-studio-surface p-4 ring-1 ring-studio-border sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
          <Layers className="h-5 w-5 text-emerald-300" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-2xl font-semibold">
            Сведение дорожек
          </h2>
          <p className="mt-1 text-sm text-studio-muted">
            Как в Reaper: отметьте дорожки для прослушки → «Запись с
            прослушкой» одновременно играет их и пишет новую. Смотрите волны и
            playhead, чтобы вовремя вступить.
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-2xl bg-studio-bg/70 px-3 py-2.5 text-xs text-studio-muted ring-1 ring-studio-border">
        <Headphones className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
        <p>
          Наденьте наушники — иначе микрофон поймает прослушку (обратная
          связь). Галочка у дорожки = она звучит при записи и при «Слушать».
        </p>
      </div>

      {/* Transport */}
      <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {!recordingId ? (
          <Button
            fullWidth
            size="lg"
            disabled={tracks.length >= MAX_TRACKS}
            onClick={() => void startOverdub()}
          >
            <Circle className="h-5 w-5 fill-current text-rose-400" />
            {tracks.length === 0
              ? "Записать первую дорожку"
              : "Запись с прослушкой"}
          </Button>
        ) : (
          <Button fullWidth size="lg" variant="danger" onClick={stopAll}>
            <Square className="h-4 w-4 fill-current" />
            Стоп · {formatTime(playheadSec)}
          </Button>
        )}

        <Button
          fullWidth
          size="lg"
          variant="secondary"
          disabled={monitorTracks.length === 0 || Boolean(recordingId)}
          onClick={() =>
            playing && !recordingId ? stopPlayback() : void listenOnly()
          }
        >
          {playing && !recordingId ? (
            <Pause className="h-5 w-5" />
          ) : (
            <Play className="h-5 w-5" />
          )}
          {playing && !recordingId
            ? "Стоп прослушка"
            : `Слушать (${monitorTracks.length})`}
        </Button>

        <Button
          fullWidth
          size="lg"
          variant="secondary"
          disabled={tracks.length === 0 || busy || mixing}
          onClick={() => void mixAll()}
        >
          <Layers className="h-5 w-5" />
          {mixing ? "Сводим…" : "Свести всё"}
        </Button>

        <Button
          fullWidth
          size="lg"
          variant="secondary"
          disabled={(!tracks.length && !mixUrl) || Boolean(recordingId)}
          onClick={resetAll}
        >
          <RotateCcw className="h-5 w-5" />
          Сбросить
        </Button>
      </div>

      {/* Timeline ruler */}
      <div className="mt-5 flex items-center justify-between text-xs text-studio-muted">
        <span className="font-medium text-studio-text">
          {recordingId ? (
            <span className="inline-flex items-center gap-1.5 text-rose-300">
              <span className="h-2 w-2 animate-pulse rounded-full bg-rose-400" />
              REC · {formatTime(playheadSec)}
            </span>
          ) : playing ? (
            <span>PLAY · {formatTime(playheadSec)}</span>
          ) : (
            <span>Готово к записи · {tracks.length}/{MAX_TRACKS}</span>
          )}
        </span>
        <span>шкала ~{formatTime(timelineSec)}</span>
      </div>

      {recordingId && (
        <div className="mt-2">
          <div className="mb-1 flex justify-between text-[11px] text-studio-muted">
            <span className="inline-flex items-center gap-1">
              <Mic className="h-3.5 w-3.5 text-rose-300" />
              Уровень входа
            </span>
            <span>{Math.round(inputLevel * 100)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-studio-bg ring-1 ring-studio-border">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-amber-300 to-rose-500 transition-[width] duration-75"
              style={{ width: `${Math.max(2, inputLevel * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Track lanes */}
      <div className="mt-4 space-y-3">
        {tracks.map((track, index) => {
          const monitored = monitorIds.includes(track.id);
          return (
            <div
              key={track.id}
              className={`rounded-2xl bg-studio-card p-3 ring-1 transition ${
                monitored ? "ring-studio-accent/45" : "ring-studio-border"
              }`}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <label className="flex min-w-0 items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={monitored}
                    onChange={() => toggleMonitor(track.id)}
                    disabled={busy}
                    title="Играть эту дорожку при записи / прослушке"
                  />
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-studio-bg text-[11px] text-studio-muted ring-1 ring-studio-border">
                    {index + 1}
                  </span>
                  <span className="truncate">{track.name}</span>
                  <span className="text-xs text-studio-muted">
                    {formatTime(track.durationSec)}
                  </span>
                  {monitored && (
                    <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-300">
                      в прослушке
                    </span>
                  )}
                </label>
                <button
                  type="button"
                  className="rounded-lg p-2 text-studio-muted hover:bg-studio-surface hover:text-red-300 disabled:opacity-40"
                  onClick={() => removeTrack(track.id)}
                  aria-label="Удалить дорожку"
                  disabled={busy}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <WaveformLane
                peaks={track.peaks}
                durationSec={track.durationSec}
                timelineSec={timelineSec}
                playheadSec={
                  monitored || recordingId || playing ? playheadSec : 0
                }
              />
            </div>
          );
        })}

        {recordingId && (
          <div className="rounded-2xl bg-rose-500/10 p-3 ring-1 ring-rose-400/40">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-rose-200">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-rose-500/20 text-[11px]">
                ●
              </span>
              Новая дорожка · пишется сейчас
              <span className="text-xs text-rose-200/70">
                {formatTime(playheadSec)}
              </span>
            </div>
            <WaveformLane
              peaks={Array.from({ length: 48 }, (_, i) =>
                Math.max(0.08, inputLevel * (0.55 + ((i * 17) % 7) * 0.06))
              )}
              durationSec={Math.max(playheadSec, 0.2)}
              timelineSec={timelineSec}
              playheadSec={playheadSec}
              tone="rec"
              live
            />
          </div>
        )}

        {tracks.length === 0 && !recordingId && (
          <div className="rounded-2xl border border-dashed border-studio-border px-4 py-10 text-center text-sm text-studio-muted">
            Запишите первую дорожку. Потом отметьте её галочкой и жмите «Запись
            с прослушкой» — услышите её и наложите следующую партию.
          </div>
        )}
      </div>

      {mixUrl && (
        <div className="mt-5 rounded-2xl bg-studio-card p-4 ring-1 ring-studio-border">
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
          {mixPeaks.length > 0 && (
            <WaveformLane
              peaks={mixPeaks}
              durationSec={timelineSec}
              timelineSec={timelineSec}
              playheadSec={0}
              tone="mix"
            />
          )}
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
