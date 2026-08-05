"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Circle,
  Download,
  GripVertical,
  Headphones,
  Layers,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Square,
  Trash2,
} from "lucide-react";
import Button from "@/components/ui/Button";
import { decodeBlobToAudioBuffer, mixAudioBuffersWithOffsets } from "@/lib/wav-client";

const MAX_TRACKS = 10;
const PEAK_BUCKETS = 128;
const MIN_TIMELINE_SEC = 6;

type Track = {
  id: string;
  name: string;
  blob: Blob;
  url: string;
  durationSec: number;
  peaks: number[];
  buffer: AudioBuffer;
  /** Clip start on the shared timeline (seconds) */
  offsetSec: number;
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
  const ms = Math.floor((s % 1) * 100);
  return `${m}:${String(r).padStart(2, "0")}.${String(ms).padStart(2, "0")}`;
}

function pickRecorderMime(): string {
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
    return "audio/webm;codecs=opus";
  }
  if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/mp4")) return "audio/mp4";
  return "";
}

function ClipLane({
  track,
  timelineSec,
  playheadSec,
  active,
  disabled,
  onOffsetChange,
}: {
  track: Track;
  timelineSec: number;
  playheadSec: number;
  active: boolean;
  disabled: boolean;
  onOffsetChange: (offsetSec: number) => void;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startOffset: number } | null>(null);

  const span = Math.max(timelineSec, 0.001);
  const leftPct = (Math.max(0, track.offsetSec) / span) * 100;
  const widthPct = Math.min(
    100 - leftPct,
    (Math.max(track.durationSec, 0.08) / span) * 100
  );
  const playheadPct = Math.min(100, (playheadSec / span) * 100);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      startX: event.clientX,
      startOffset: track.offsetSec,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || !railRef.current) return;
    const width = railRef.current.clientWidth || 1;
    const dx = event.clientX - dragRef.current.startX;
    const next = dragRef.current.startOffset + (dx / width) * span;
    const maxOffset = Math.max(0, span - track.durationSec * 0.05);
    onOffsetChange(Math.min(maxOffset, Math.max(0, next)));
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  return (
    <div
      ref={railRef}
      className="relative h-16 overflow-hidden rounded-xl bg-studio-bg ring-1 ring-studio-border"
    >
      <div
        role="slider"
        aria-label={`Позиция ${track.name}`}
        aria-valuemin={0}
        aria-valuemax={Math.round(span * 1000)}
        aria-valuenow={Math.round(track.offsetSec * 1000)}
        tabIndex={disabled ? -1 : 0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={`absolute inset-y-1 flex cursor-grab touch-none items-stretch overflow-hidden rounded-lg active:cursor-grabbing ${
          active
            ? "ring-2 ring-studio-accent/70"
            : "ring-1 ring-studio-border/80"
        } ${disabled ? "cursor-not-allowed opacity-70" : ""}`}
        style={{ left: `${leftPct}%`, width: `${Math.max(widthPct, 4)}%` }}
      >
        <div className="flex w-5 shrink-0 items-center justify-center bg-studio-accent/25">
          <GripVertical className="h-4 w-4 text-studio-accent-light" />
        </div>
        <div className="flex min-w-0 flex-1 items-end gap-px bg-studio-card/90 px-1 py-1.5">
          {track.peaks.map((peak, index) => {
            const t =
              track.offsetSec +
              (index / Math.max(1, track.peaks.length - 1)) * track.durationSec;
            const played = active && t <= playheadSec;
            return (
              <span
                key={index}
                className={`w-full rounded-sm ${
                  played
                    ? "bg-gradient-to-t from-studio-accent to-studio-gold"
                    : "bg-studio-accent/35"
                }`}
                style={{ height: `${Math.max(8, peak * 100)}%` }}
              />
            );
          })}
        </div>
      </div>
      {playheadSec > 0 && (
        <div
          className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-white/90 shadow-[0_0_8px_rgba(255,255,255,0.7)]"
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
  const [mixing, setMixing] = useState(false);
  const [mixUrl, setMixUrl] = useState("");
  const [mixPeaks, setMixPeaks] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const playStartedAtRef = useRef(0);
  const playDurationRef = useRef(0);
  const playRafRef = useRef<number | null>(null);
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
    const end = Math.max(
      MIN_TIMELINE_SEC,
      playheadSec,
      ...tracks.map((t) => t.offsetSec + t.durationSec)
    );
    return end + 1;
  }, [playheadSec, tracks]);

  const stopPlayback = () => {
    if (playRafRef.current) cancelAnimationFrame(playRafRef.current);
    playRafRef.current = null;
    sourcesRef.current.forEach((source) => {
      try {
        source.stop();
      } catch {
        /* ignore */
      }
    });
    sourcesRef.current = [];
    setPlaying(false);
    setPlayheadSec(0);
  };

  const releaseMic = () => {
    if (recorderRef.current?.state === "recording") {
      try {
        recorderRef.current.stop();
      } catch {
        /* ignore */
      }
    }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setRecordingId(null);
  };

  useEffect(
    () => () => {
      releaseMic();
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
      audioCtxRef.current = new AudioContext({ latencyHint: "playback" });
    }
    if (audioCtxRef.current.state === "suspended") {
      await audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  };

  const ensureMic = async () => {
    if (
      streamRef.current &&
      streamRef.current.getAudioTracks().some((t) => t.readyState === "live")
    ) {
      return streamRef.current;
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
    });
    streamRef.current = stream;
    return stream;
  };

  const startPlayhead = (ctx: AudioContext, durationSec: number, t0: number) => {
    playDurationRef.current = Math.max(durationSec, 0.1);
    playStartedAtRef.current = t0;
    setPlaying(true);
    const tick = () => {
      const elapsed = ctx.currentTime - playStartedAtRef.current;
      setPlayheadSec(Math.max(0, elapsed));
      if (!recordingIdRef.current && elapsed >= playDurationRef.current) {
        stopPlayback();
        return;
      }
      playRafRef.current = requestAnimationFrame(tick);
    };
    playRafRef.current = requestAnimationFrame(tick);
  };

  const playLanes = (ctx: AudioContext, list: Track[], when: number) => {
    if (list.length === 0) return 0.1;
    const duration = Math.max(
      ...list.map((t) => t.offsetSec + t.buffer.duration),
      0.1
    );
    sourcesRef.current = list.map((track) => {
      const source = ctx.createBufferSource();
      source.buffer = track.buffer;
      source.connect(ctx.destination);
      source.start(when + Math.max(0, track.offsetSec));
      return source;
    });
    return duration;
  };

  const setTrackOffset = (id: string, offsetSec: number) => {
    setTracks((current) =>
      current.map((track) =>
        track.id === id
          ? { ...track, offsetSec: Math.max(0, offsetSec) }
          : track
      )
    );
  };

  const nudgeSelected = (deltaSec: number) => {
    if (!selectedId || recordingId || playing) return;
    const track = tracks.find((t) => t.id === selectedId);
    if (!track) return;
    setTrackOffset(selectedId, track.offsetSec + deltaSec);
  };

  const listenOnly = async () => {
    if (recordingId || monitorTracks.length === 0) return;
    stopPlayback();
    setError("");
    try {
      const ctx = await ensureAudioCtx();
      const t0 = ctx.currentTime;
      const duration = playLanes(ctx, monitorTracks, t0);
      startPlayhead(ctx, duration, t0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось воспроизвести");
      stopPlayback();
    }
  };

  const startOverdub = async () => {
    if (tracks.length >= MAX_TRACKS || recordingId) return;
    setError("");
    stopPlayback();
    try {
      const ctx = await ensureAudioCtx();
      const stream = await ensureMic();
      chunksRef.current = [];
      const id = crypto.randomUUID();
      const mime = pickRecorderMime();
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
          stopPlayback();
          setRecordingId(null);
          recorderRef.current = null;

          const blob = new Blob(chunksRef.current, {
            type: recorder.mimeType || "audio/webm",
          });
          try {
            const buffer = await decodeBlobToAudioBuffer(blob);
            const url = URL.createObjectURL(blob);
            const peaks = buildPeaks(buffer);
            setTracks((current) => {
              const next: Track[] = [
                ...current,
                {
                  id,
                  name: `Дорожка ${current.length + 1}`,
                  blob,
                  url,
                  durationSec: buffer.duration,
                  peaks,
                  buffer,
                  offsetSec: 0,
                },
              ];
              setMonitorIds((ids) => [...ids, id]);
              setSelectedId(id);
              return next;
            });
          } catch (err) {
            setError(
              err instanceof Error
                ? err.message
                : "Не удалось обработать запись"
            );
          }
          setPlayheadSec(0);
        })();
      };

      const t0 = ctx.currentTime;
      const monitorDuration = playLanes(ctx, monitorTracks, t0);
      recorder.start(100);
      setRecordingId(id);
      startPlayhead(ctx, Math.max(monitorDuration, 3600), t0);
    } catch {
      setError("Не удалось получить доступ к микрофону");
      releaseMic();
      stopPlayback();
    }
  };

  const stopAll = () => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
      return;
    }
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
    setSelectedId((current) => (current === id ? null : current));
  };

  const resetAll = () => {
    stopAll();
    if (recorderRef.current?.state !== "recording") {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setTracks((current) => {
      current.forEach((t) => URL.revokeObjectURL(t.url));
      return [];
    });
    setMonitorIds([]);
    setSelectedId(null);
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
      const mixed = await mixAudioBuffersWithOffsets(
        tracks.map((track) => ({
          buffer: track.buffer,
          offsetSec: track.offsetSec,
        }))
      );
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
            Мини-редактор как в Reaper: запишите партии, затем{" "}
            <span className="text-studio-text">перетащите клипы</span> по
            шкале или сдвиньте кнопками — пока не лягут идеально. Потом
            сведите в один файл.
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-2xl bg-studio-bg/70 px-3 py-2.5 text-xs text-studio-muted ring-1 ring-studio-border">
        <Headphones className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
        <p>
          Наушники обязательны. Галочка = дорожка звучит при записи/прослушке.
          После дубля выберите клип и подвигайте его, слушая микс — так всегда
          попадаете в синхрон.
        </p>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {!recordingId ? (
          <Button
            fullWidth
            size="lg"
            disabled={tracks.length >= MAX_TRACKS}
            onPointerDown={() => {
              void ensureAudioCtx();
              void ensureMic().catch(() => undefined);
            }}
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
            ? "Стоп"
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

      {/* Nudge bar */}
      {selectedId && !recordingId && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl bg-studio-card px-3 py-2 ring-1 ring-studio-border">
          <span className="text-xs text-studio-muted">Сдвиг клипа:</span>
          {[
            { label: "−100 мс", d: -0.1 },
            { label: "−10 мс", d: -0.01 },
            { label: "+10 мс", d: 0.01 },
            { label: "+100 мс", d: 0.1 },
          ].map((btn) => (
            <button
              key={btn.label}
              type="button"
              disabled={busy}
              onClick={() => nudgeSelected(btn.d)}
              className="rounded-lg bg-studio-bg px-2.5 py-1.5 text-xs font-medium text-studio-text ring-1 ring-studio-border transition hover:ring-studio-accent/50 disabled:opacity-40"
            >
              {btn.label}
            </button>
          ))}
          <span className="ml-auto text-xs tabular-nums text-studio-muted">
            {formatTime(
              tracks.find((t) => t.id === selectedId)?.offsetSec ?? 0
            )}
          </span>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between text-xs text-studio-muted">
        <span className="font-medium text-studio-text">
          {recordingId ? (
            <span className="inline-flex items-center gap-1.5 text-rose-300">
              <span className="h-2 w-2 animate-pulse rounded-full bg-rose-400" />
              REC · {formatTime(playheadSec)}
            </span>
          ) : playing ? (
            <span>PLAY · {formatTime(playheadSec)}</span>
          ) : (
            <span>
              Таймлайн · {tracks.length}/{MAX_TRACKS}
            </span>
          )}
        </span>
        <span>~{formatTime(timelineSec)}</span>
      </div>

      <div className="mt-3 space-y-3">
        {tracks.map((track, index) => {
          const monitored = monitorIds.includes(track.id);
          const selected = selectedId === track.id;
          return (
            <div
              key={track.id}
              className={`rounded-2xl bg-studio-card p-3 ring-1 transition ${
                selected
                  ? "ring-studio-accent/55"
                  : monitored
                    ? "ring-studio-border"
                    : "ring-studio-border/70"
              }`}
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <label className="flex min-w-0 items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={monitored}
                    disabled={busy}
                    onChange={() =>
                      setMonitorIds((current) =>
                        current.includes(track.id)
                          ? current.filter((id) => id !== track.id)
                          : [...current, track.id]
                      )
                    }
                    title="В прослушке"
                  />
                  <button
                    type="button"
                    className="flex min-w-0 items-center gap-2 text-left"
                    onClick={() => setSelectedId(track.id)}
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-studio-bg text-[11px] text-studio-muted ring-1 ring-studio-border">
                      {index + 1}
                    </span>
                    <span className="truncate">{track.name}</span>
                    <span className="text-xs text-studio-muted">
                      {formatTime(track.durationSec)} · старт{" "}
                      {formatTime(track.offsetSec)}
                    </span>
                  </button>
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
              <div
                onPointerDown={() => setSelectedId(track.id)}
                className="contents"
              >
                <ClipLane
                  track={track}
                  timelineSec={timelineSec}
                  playheadSec={
                    monitored || recordingId || playing ? playheadSec : 0
                  }
                  active={selected || monitored}
                  disabled={busy}
                  onOffsetChange={(offset) => setTrackOffset(track.id, offset)}
                />
              </div>
            </div>
          );
        })}

        {tracks.length === 0 && !recordingId && (
          <div className="rounded-2xl border border-dashed border-studio-border px-4 py-10 text-center text-sm text-studio-muted">
            1) Запишите первую дорожку → 2) отметьте её → 3) «Запись с
            прослушкой» → 4) перетащите новый клип, пока не совпадёт с первой.
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
            <div className="flex h-12 items-end gap-px rounded-xl bg-studio-bg px-2 py-1.5 ring-1 ring-studio-border">
              {mixPeaks.map((peak, index) => (
                <span
                  key={index}
                  className="w-full rounded-sm bg-gradient-to-t from-emerald-500 to-studio-accent"
                  style={{ height: `${Math.max(8, peak * 100)}%` }}
                />
              ))}
            </div>
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
