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
  Scissors,
  SkipBack,
  Sparkles,
  Square,
  Trash2,
} from "lucide-react";
import Button from "@/components/ui/Button";
import {
  decodeBlobToAudioBuffer,
  mixAudioBuffersWithOffsets,
} from "@/lib/wav-client";

const MAX_TRACKS = 10;
const PEAK_BUCKETS = 128;
const MIN_TIMELINE_SEC = 6;
const MIN_CLIP_SEC = 0.05;

type Track = {
  id: string;
  name: string;
  blob: Blob;
  url: string;
  /** Full source duration */
  sourceDurationSec: number;
  peaks: number[];
  buffer: AudioBuffer;
  /** Clip start on the shared timeline */
  offsetSec: number;
  /** Inclusive trim window inside the source buffer */
  trimStartSec: number;
  trimEndSec: number;
};

type Props = { locked?: boolean };

function clipDuration(track: Pick<Track, "trimStartSec" | "trimEndSec">) {
  return Math.max(MIN_CLIP_SEC, track.trimEndSec - track.trimStartSec);
}

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

/** Peaks for the visible (trimmed) region only */
function buildTrimmedPeaks(track: Track, buckets = PEAK_BUCKETS): number[] {
  const { buffer, trimStartSec, trimEndSec } = track;
  const sr = buffer.sampleRate;
  const start = Math.max(0, Math.floor(trimStartSec * sr));
  const end = Math.min(buffer.length, Math.ceil(trimEndSec * sr));
  const channel = buffer.getChannelData(0);
  const len = Math.max(1, end - start);
  const block = Math.max(1, Math.floor(len / buckets));
  const peaks: number[] = [];
  for (let i = 0; i < buckets; i += 1) {
    let peak = 0;
    const a = start + i * block;
    const b = Math.min(end, a + block);
    for (let j = a; j < b; j += 1) {
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

async function decodeWithCtx(
  ctx: AudioContext,
  blob: Blob
): Promise<AudioBuffer> {
  const bytes = await blob.arrayBuffer();
  return ctx.decodeAudioData(bytes.slice(0));
}

type DragMode = "move" | "trim-start" | "trim-end";

function ClipLane({
  track,
  timelineSec,
  playheadSec,
  active,
  disabled,
  onChange,
}: {
  track: Track;
  timelineSec: number;
  playheadSec: number;
  active: boolean;
  disabled: boolean;
  onChange: (patch: Partial<Track>) => void;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    mode: DragMode;
    startX: number;
    offsetSec: number;
    trimStartSec: number;
    trimEndSec: number;
  } | null>(null);

  const span = Math.max(timelineSec, 0.001);
  const dur = clipDuration(track);
  const leftPct = (Math.max(0, track.offsetSec) / span) * 100;
  const widthPct = Math.min(100 - leftPct, (Math.max(dur, 0.08) / span) * 100);
  const playheadPct = Math.min(100, (playheadSec / span) * 100);
  const peaks = useMemo(() => buildTrimmedPeaks(track), [track]);

  const onPointerDown = (
    event: ReactPointerEvent<Element>,
    mode: DragMode
  ) => {
    if (disabled) return;
    event.stopPropagation();
    if (event.currentTarget instanceof Element) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    dragRef.current = {
      mode,
      startX: event.clientX,
      offsetSec: track.offsetSec,
      trimStartSec: track.trimStartSec,
      trimEndSec: track.trimEndSec,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<Element>) => {
    const drag = dragRef.current;
    if (!drag || !railRef.current) return;
    const width = railRef.current.clientWidth || 1;
    const dSec = ((event.clientX - drag.startX) / width) * span;

    if (drag.mode === "move") {
      onChange({ offsetSec: Math.max(0, drag.offsetSec + dSec) });
      return;
    }

    if (drag.mode === "trim-start") {
      // Keep right edge of clip fixed on timeline (Reaper-like)
      let nextTrim = drag.trimStartSec + dSec;
      nextTrim = Math.max(0, Math.min(drag.trimEndSec - MIN_CLIP_SEC, nextTrim));
      const applied = nextTrim - drag.trimStartSec;
      onChange({
        trimStartSec: nextTrim,
        offsetSec: Math.max(0, drag.offsetSec + applied),
      });
      return;
    }

    // trim-end
    let nextEnd = drag.trimEndSec + dSec;
    nextEnd = Math.max(
      drag.trimStartSec + MIN_CLIP_SEC,
      Math.min(track.sourceDurationSec, nextEnd)
    );
    onChange({ trimEndSec: nextEnd });
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
        className={`absolute inset-y-1 flex touch-none items-stretch overflow-hidden rounded-lg ${
          active
            ? "ring-2 ring-studio-accent/70"
            : "ring-1 ring-studio-border/80"
        } ${disabled ? "opacity-70" : ""}`}
        style={{ left: `${leftPct}%`, width: `${Math.max(widthPct, 5)}%` }}
      >
        <button
          type="button"
          aria-label="Обрезать начало"
          disabled={disabled}
          onPointerDown={(e) => onPointerDown(e, "trim-start")}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="w-3 shrink-0 cursor-ew-resize bg-studio-gold/40 hover:bg-studio-gold/70 disabled:cursor-not-allowed"
        />
        <div
          role="slider"
          aria-label={`Позиция ${track.name}`}
          tabIndex={disabled ? -1 : 0}
          onPointerDown={(e) => onPointerDown(e, "move")}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className={`flex min-w-0 flex-1 cursor-grab items-stretch active:cursor-grabbing ${
            disabled ? "cursor-not-allowed" : ""
          }`}
        >
          <div className="flex w-5 shrink-0 items-center justify-center bg-studio-accent/25">
            <GripVertical className="h-4 w-4 text-studio-accent-light" />
          </div>
          <div className="flex min-w-0 flex-1 items-end gap-px bg-studio-card/90 px-1 py-1.5">
            {peaks.map((peak, index) => {
              const t =
                track.offsetSec +
                (index / Math.max(1, peaks.length - 1)) * dur;
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
        <button
          type="button"
          aria-label="Обрезать конец"
          disabled={disabled}
          onPointerDown={(e) => onPointerDown(e, "trim-end")}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="w-3 shrink-0 cursor-ew-resize bg-studio-gold/40 hover:bg-studio-gold/70 disabled:cursor-not-allowed"
        />
      </div>
      <div
        className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-white/90 shadow-[0_0_8px_rgba(255,255,255,0.7)]"
        style={{ left: `${playheadPct}%` }}
      />
    </div>
  );
}

/** Click/drag ruler to set playback cue on the shared timeline. */
function TimelineScrubber({
  timelineSec,
  playheadSec,
  disabled,
  onSeekStart,
  onSeek,
  onSeekEnd,
}: {
  timelineSec: number;
  playheadSec: number;
  disabled: boolean;
  onSeekStart: () => void;
  onSeek: (sec: number) => void;
  onSeekEnd: () => void;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const span = Math.max(timelineSec, 0.001);
  const playheadPct = Math.min(100, (playheadSec / span) * 100);

  const marks = useMemo(() => {
    const step = span > 60 ? 10 : span > 20 ? 5 : span > 8 ? 2 : 1;
    const out: number[] = [];
    for (let t = 0; t <= span + 0.001; t += step) out.push(t);
    return out;
  }, [span]);

  const secFromClientX = (clientX: number) => {
    const el = railRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return ratio * span;
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px] text-studio-muted">
        <span>Старт с · клик / перетаскивание</span>
        <span className="tabular-nums font-medium text-studio-text">
          {formatTime(playheadSec)}
        </span>
      </div>
      <div
        ref={railRef}
        role="slider"
        aria-label="Позиция воспроизведения"
        aria-valuemin={0}
        aria-valuemax={Math.round(span)}
        aria-valuenow={Math.round(playheadSec)}
        tabIndex={disabled ? -1 : 0}
        onPointerDown={(event) => {
          if (disabled) return;
          draggingRef.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          onSeekStart();
          onSeek(secFromClientX(event.clientX));
        }}
        onPointerMove={(event) => {
          if (!draggingRef.current || disabled) return;
          onSeek(secFromClientX(event.clientX));
        }}
        onPointerUp={() => {
          if (!draggingRef.current) return;
          draggingRef.current = false;
          onSeekEnd();
        }}
        onPointerCancel={() => {
          draggingRef.current = false;
          onSeekEnd();
        }}
        onKeyDown={(event) => {
          if (disabled) return;
          const step = event.shiftKey ? 1 : 0.1;
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            onSeekStart();
            onSeek(Math.max(0, playheadSec - step));
            onSeekEnd();
          } else if (event.key === "ArrowRight") {
            event.preventDefault();
            onSeekStart();
            onSeek(Math.min(span, playheadSec + step));
            onSeekEnd();
          } else if (event.key === "Home") {
            event.preventDefault();
            onSeekStart();
            onSeek(0);
            onSeekEnd();
          }
        }}
        className={`relative h-11 touch-none select-none overflow-hidden rounded-xl bg-studio-bg ring-1 ring-studio-border ${
          disabled
            ? "cursor-not-allowed opacity-60"
            : "cursor-ew-resize hover:ring-studio-accent/40"
        }`}
      >
        <div className="absolute inset-x-2 bottom-1.5 top-5">
          <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-studio-border" />
          {marks.map((t) => (
            <div
              key={t}
              className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
              style={{ left: `${(t / span) * 100}%` }}
            >
              <span className="h-2 w-px bg-studio-muted/50" />
              <span className="mt-0.5 text-[9px] tabular-nums text-studio-muted">
                {Math.floor(t / 60)}:{String(Math.floor(t % 60)).padStart(2, "0")}
              </span>
            </div>
          ))}
        </div>
        <div
          className="pointer-events-none absolute inset-y-1 z-10 w-0.5 bg-rose-300 shadow-[0_0_10px_rgba(251,113,133,0.75)]"
          style={{ left: `${playheadPct}%` }}
        >
          <span className="absolute -top-0.5 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-sm bg-rose-300" />
        </div>
      </div>
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
  const playFromSecRef = useRef(0);
  const playDurationRef = useRef(0);
  const playRafRef = useRef<number | null>(null);
  const recordingIdRef = useRef<string | null>(null);
  const playheadSecRef = useRef(0);
  const takeIdRef = useRef(0);
  const tracksRef = useRef<Track[]>([]);
  const stoppingRecRef = useRef(false);
  const resumeAfterSeekRef = useRef(false);

  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);
  useEffect(() => {
    recordingIdRef.current = recordingId;
  }, [recordingId]);
  useEffect(() => {
    playheadSecRef.current = playheadSec;
  }, [playheadSec]);

  const monitorTracks = useMemo(
    () => tracks.filter((track) => monitorIds.includes(track.id)),
    [monitorIds, tracks]
  );

  const timelineSec = useMemo(() => {
    const end = Math.max(
      MIN_TIMELINE_SEC,
      playheadSec,
      ...tracks.map((t) => t.offsetSec + clipDuration(t))
    );
    return end + 1;
  }, [playheadSec, tracks]);

  const selected = tracks.find((t) => t.id === selectedId) ?? null;

  const stopPlayback = (opts?: { keepPlayhead?: boolean }) => {
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
    if (!opts?.keepPlayhead) {
      setPlayheadSec(0);
    }
  };

  const releaseMicFully = () => {
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setRecordingId(null);
  };

  useEffect(
    () => () => {
      try {
        if (recorderRef.current?.state === "recording") {
          recorderRef.current.stop();
        }
      } catch {
        /* ignore */
      }
      releaseMicFully();
      stopPlayback();
      void audioCtxRef.current?.close();
      tracksRef.current.forEach((t) => URL.revokeObjectURL(t.url));
      if (mixUrl) URL.revokeObjectURL(mixUrl);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const ensureAudioCtx = async () => {
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioContext({ latencyHint: "interactive" });
    }
    if (audioCtxRef.current.state === "suspended") {
      await audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  };

  const ensureMic = async () => {
    const existing = streamRef.current;
    if (existing?.getAudioTracks().some((t) => t.readyState === "live")) {
      return existing;
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

  const startPlayhead = (
    ctx: AudioContext,
    endSec: number,
    t0: number,
    fromSec: number
  ) => {
    playFromSecRef.current = Math.max(0, fromSec);
    playDurationRef.current = Math.max(endSec, fromSec + 0.1);
    playStartedAtRef.current = t0;
    setPlayheadSec(playFromSecRef.current);
    setPlaying(true);
    const tick = () => {
      const elapsed = ctx.currentTime - playStartedAtRef.current;
      const pos = playFromSecRef.current + elapsed;
      setPlayheadSec(Math.max(0, pos));
      if (!recordingIdRef.current && pos >= playDurationRef.current) {
        stopPlayback({ keepPlayhead: true });
        return;
      }
      playRafRef.current = requestAnimationFrame(tick);
    };
    playRafRef.current = requestAnimationFrame(tick);
  };

  /**
   * Schedule monitored clips from a timeline cue (`fromSec`).
   * Clips that end before the cue are skipped; mid-clip starts use buffer offset.
   */
  const playLanes = (
    ctx: AudioContext,
    list: Track[],
    when: number,
    fromSec = 0
  ) => {
    const cue = Math.max(0, fromSec);
    if (list.length === 0) return cue + 0.1;
    const duration = Math.max(
      ...list.map((t) => t.offsetSec + clipDuration(t)),
      cue + 0.1,
      0.1
    );
    const sources: AudioBufferSourceNode[] = [];
    for (const track of list) {
      const clipStart = Math.max(0, track.offsetSec);
      const playDur = clipDuration(track);
      const clipEnd = clipStart + playDur;
      if (cue >= clipEnd - 0.0005) continue;

      const source = ctx.createBufferSource();
      source.buffer = track.buffer;
      source.connect(ctx.destination);

      if (cue <= clipStart) {
        source.start(
          when + (clipStart - cue),
          track.trimStartSec,
          playDur
        );
      } else {
        const into = cue - clipStart;
        source.start(when, track.trimStartSec + into, playDur - into);
      }
      sources.push(source);
    }
    sourcesRef.current = sources;
    return duration;
  };

  const patchTrack = (id: string, patch: Partial<Track>) => {
    setTracks((current) =>
      current.map((track) => (track.id === id ? { ...track, ...patch } : track))
    );
  };

  const nudgeSelected = (deltaSec: number) => {
    if (!selected || recordingId || playing) return;
    patchTrack(selected.id, {
      offsetSec: Math.max(0, selected.offsetSec + deltaSec),
    });
  };

  /** Trim selected clip at current playhead (start or end). */
  const trimSelectedAtPlayhead = (edge: "start" | "end") => {
    if (!selected || recordingId) return;
    const clipStart = selected.offsetSec;
    const clipEnd = selected.offsetSec + clipDuration(selected);
    if (playheadSec <= clipStart + 0.01 || playheadSec >= clipEnd - 0.01) {
      return;
    }
    const local = playheadSec - clipStart;
    if (edge === "start") {
      patchTrack(selected.id, {
        trimStartSec: selected.trimStartSec + local,
        offsetSec: playheadSec,
      });
      return;
    }
    patchTrack(selected.id, {
      trimEndSec: selected.trimStartSec + local,
    });
  };

  const listenOnly = async () => {
    if (recordingId || monitorTracks.length === 0) return;
    const fromSec = playheadSecRef.current;
    stopPlayback({ keepPlayhead: true });
    setError("");
    try {
      const ctx = await ensureAudioCtx();
      const t0 = ctx.currentTime + 0.02;
      const duration = playLanes(ctx, monitorTracks, t0, fromSec);
      startPlayhead(ctx, duration, t0, fromSec);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось воспроизвести");
      stopPlayback({ keepPlayhead: true });
    }
  };

  const seekTo = (sec: number) => {
    const next = Math.max(0, Math.min(sec, timelineSec));
    playheadSecRef.current = next;
    setPlayheadSec(next);
  };

  const onSeekStart = () => {
    if (recordingId) return;
    resumeAfterSeekRef.current = playing && !recordingId;
    if (playing) {
      stopPlayback({ keepPlayhead: true });
    }
  };

  const onSeekEnd = () => {
    if (!resumeAfterSeekRef.current) return;
    resumeAfterSeekRef.current = false;
    void listenOnly();
  };

  const startOverdub = async () => {
    if (tracks.length >= MAX_TRACKS || recordingId || stoppingRecRef.current) {
      return;
    }
    setError("");
    const cueSec = playheadSecRef.current;
    stopPlayback({ keepPlayhead: true });

    const take = ++takeIdRef.current;

    try {
      const ctx = await ensureAudioCtx();
      const stream = await ensureMic();
      // Per-take chunk list (closure) — never share with the next recording
      const chunks: Blob[] = [];
      chunksRef.current = chunks;
      const id = crypto.randomUUID();
      const mime = pickRecorderMime();
      const recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        // Ignore late events from an older take
        if (take !== takeIdRef.current) return;
        if (event.data.size > 0) chunks.push(event.data);
      };

      recorder.onerror = () => {
        if (take !== takeIdRef.current) return;
        setError("Сбой записи микрофона. Попробуйте ещё раз.");
        setRecordingId(null);
        recorderRef.current = null;
        stopPlayback();
      };

      recorder.onstop = () => {
        void (async () => {
          if (take !== takeIdRef.current) return;
          stoppingRecRef.current = false;
          // Stop monitor after capture fully finalized — avoids glitches mid-stop
          stopPlayback();
          setRecordingId(null);
          recorderRef.current = null;

          if (chunks.length === 0) {
            setError("Пустая запись — микрофон не отдал данные. Попробуйте снова.");
            return;
          }

          const blob = new Blob(chunks, {
            type: recorder.mimeType || mime || "audio/webm",
          });
          if (blob.size < 256) {
            setError("Запись слишком короткая или повреждена.");
            return;
          }

          try {
            // Decode on the SAME AudioContext — avoids device reset / audio jumps
            // that happen when opening a throwaway AudioContext per take.
            const buffer = await decodeWithCtx(ctx, blob);
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
                  sourceDurationSec: buffer.duration,
                  peaks,
                  buffer,
                  // Align punch-in take to the cue where recording began
                  offsetSec: cueSec,
                  trimStartSec: 0,
                  trimEndSec: buffer.duration,
                },
              ];
              setMonitorIds((ids) => [...ids, id]);
              setSelectedId(id);
              return next;
            });
          } catch (err) {
            // Fallback decode path
            try {
              const buffer = await decodeBlobToAudioBuffer(blob);
              const url = URL.createObjectURL(blob);
              setTracks((current) => [
                ...current,
                {
                  id,
                  name: `Дорожка ${current.length + 1}`,
                  blob,
                  url,
                  sourceDurationSec: buffer.duration,
                  peaks: buildPeaks(buffer),
                  buffer,
                  offsetSec: cueSec,
                  trimStartSec: 0,
                  trimEndSec: buffer.duration,
                },
              ]);
              setMonitorIds((ids) => [...ids, id]);
              setSelectedId(id);
            } catch {
              setError(
                err instanceof Error
                  ? err.message
                  : "Не удалось обработать запись"
              );
            }
          }
          setPlayheadSec(cueSec);
        })();
      };

      // Start monitor slightly ahead so first buffer is scheduled cleanly
      const t0 = ctx.currentTime + 0.03;
      const monitorDuration = playLanes(ctx, monitorTracks, t0, cueSec);
      // No timeslice: one continuous stream — timeslices caused dropouts / gaps
      recorder.start();
      setRecordingId(id);
      startPlayhead(ctx, Math.max(monitorDuration, cueSec + 3600), t0, cueSec);
    } catch {
      setError("Не удалось получить доступ к микрофону");
      releaseMicFully();
      stopPlayback();
    }
  };

  const stopAll = () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state === "recording") {
      if (stoppingRecRef.current) return;
      stoppingRecRef.current = true;
      try {
        // Flush final bytes before stop — prevents truncated takes
        if (typeof recorder.requestData === "function") {
          recorder.requestData();
        }
      } catch {
        /* some browsers throw if no data yet */
      }
      try {
        recorder.stop();
      } catch {
        stoppingRecRef.current = false;
        setRecordingId(null);
      }
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
    takeIdRef.current += 1;
    if (recorderRef.current?.state === "recording") {
      try {
        recorderRef.current.stop();
      } catch {
        /* ignore */
      }
    }
    stopPlayback();
    releaseMicFully();
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
    stoppingRecRef.current = false;
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
          trimStartSec: track.trimStartSec,
          trimEndSec: track.trimEndSec,
        }))
      );
      const ctx = await ensureAudioCtx();
      const mixBuffer = await decodeWithCtx(ctx, mixed);
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
          Сведите голос с минусовкой как в студии: несколько дорожек, запись
          поверх трека и готовый микс в одно нажатие. Откройте доступ — и
          первый дубль можно записать уже сегодня.
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
            Ваш голос + минусовка = готовый трек. Записывайте дубли поверх
            музыки, собирайте подпевки и скачивайте сведение — как мини-студия
            в телефоне.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-2 rounded-2xl bg-studio-bg/70 px-3 py-3 text-sm text-studio-muted ring-1 ring-studio-border">
        <p className="flex items-start gap-2 text-studio-text">
          <Headphones className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
          <span className="font-medium">Как пользоваться</span>
        </p>
        <ol className="list-decimal space-y-1.5 pl-5 text-xs leading-relaxed sm:text-sm">
          <li>Наденьте наушники — иначе микрофон поймает эхо колонок.</li>
          <li>
            Нажмите «Записать первую дорожку» или загрузите минусовку, если
            она уже есть.
          </li>
          <li>
            Линейка сверху — таймлайн. Поставьте курсор туда, откуда хотите
            слушать или писать (punch-in).
          </li>
          <li>
            «Слушать» воспроизводит с курсора. «Запись с прослушкой» пишет
            новый слой, пока в наушниках играют остальные дорожки.
          </li>
          <li>
            Клип на дорожке: потяните середину — сдвиг по времени, края —
            обрезка начала и конца.
          </li>
          <li>
            Добавьте до 10 дорожек: основной вокал, подпевки, гармонии.
          </li>
          <li>
            «Свести» соберёт всё в один файл. Скачайте результат кнопкой
            ниже.
          </li>
        </ol>
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
            playing && !recordingId
              ? stopPlayback({ keepPlayhead: true })
              : void listenOnly()
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

      {selected && !recordingId && (
        <div className="mt-4 space-y-2 rounded-2xl bg-studio-card px-3 py-3 ring-1 ring-studio-border">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-studio-muted">Сдвиг:</span>
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
              старт {formatTime(selected.offsetSec)} · длина{" "}
              {formatTime(clipDuration(selected))}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs text-studio-muted">
              <Scissors className="h-3.5 w-3.5" />
              Обрезка по playhead:
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => trimSelectedAtPlayhead("start")}
              className="rounded-lg bg-studio-bg px-2.5 py-1.5 text-xs font-medium text-studio-text ring-1 ring-studio-border transition hover:ring-amber-400/50 disabled:opacity-40"
              title="Поставьте playhead на клип (Слушать) и обрежьте начало до этой точки"
            >
              Обрезать начало
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => trimSelectedAtPlayhead("end")}
              className="rounded-lg bg-studio-bg px-2.5 py-1.5 text-xs font-medium text-studio-text ring-1 ring-studio-border transition hover:ring-amber-400/50 disabled:opacity-40"
              title="Поставьте playhead на клип (Слушать) и обрежьте конец до этой точки"
            >
              Обрезать конец
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                patchTrack(selected.id, {
                  trimStartSec: 0,
                  trimEndSec: selected.sourceDurationSec,
                })
              }
              className="rounded-lg bg-studio-bg px-2.5 py-1.5 text-xs font-medium text-studio-muted ring-1 ring-studio-border transition hover:text-studio-text disabled:opacity-40"
            >
              Сбросить обрезку
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-2 text-xs text-studio-muted">
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
              Курс · {formatTime(playheadSec)} · {tracks.length}/{MAX_TRACKS}
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={Boolean(recordingId) || playheadSec <= 0}
            onClick={() => {
              onSeekStart();
              seekTo(0);
              onSeekEnd();
            }}
            className="inline-flex items-center gap-1 rounded-lg bg-studio-card px-2 py-1 text-[11px] font-medium text-studio-text ring-1 ring-studio-border transition hover:ring-studio-accent/45 disabled:opacity-40"
            title="В начало таймлайна"
          >
            <SkipBack className="h-3.5 w-3.5" />
            В начало
          </button>
          <span>~{formatTime(timelineSec)}</span>
        </div>
      </div>

      {tracks.length > 0 && (
        <div className="mt-3">
          <TimelineScrubber
            timelineSec={timelineSec}
            playheadSec={playheadSec}
            disabled={Boolean(recordingId)}
            onSeekStart={onSeekStart}
            onSeek={seekTo}
            onSeekEnd={onSeekEnd}
          />
        </div>
      )}

      <div className="mt-3 space-y-3">
        {tracks.map((track, index) => {
          const monitored = monitorIds.includes(track.id);
          const isSelected = selectedId === track.id;
          return (
            <div
              key={track.id}
              className={`rounded-2xl bg-studio-card p-3 ring-1 transition ${
                isSelected
                  ? "ring-studio-accent/55"
                  : "ring-studio-border"
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
                      {formatTime(clipDuration(track))} · @
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
              <div onPointerDown={() => setSelectedId(track.id)}>
                <ClipLane
                  track={track}
                  timelineSec={timelineSec}
                  playheadSec={playheadSec}
                  active={isSelected || monitored}
                  disabled={busy}
                  onChange={(patch) => patchTrack(track.id, patch)}
                />
              </div>
            </div>
          );
        })}

        {tracks.length === 0 && !recordingId && (
          <div className="rounded-2xl border border-dashed border-studio-border px-4 py-10 text-center text-sm text-studio-muted">
            Запишите дорожки → подвигайте и обрежьте клипы → «Свести всё».
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
