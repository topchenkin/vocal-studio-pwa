"use client";

import { useEffect, useRef } from "react";
import {
  computeRms,
  createYinDetector,
  dbFromRms,
  detectPitchHzOctaveSafe,
  midiFromFrequency,
  noteLabelFromMidi,
  snapToNearbyOctave,
} from "@/lib/pitch";
import {
  connectAnalyserToDestination,
  isAppleWebKit,
  readAnalyserTimeDomain,
  singingInputGainValue,
} from "@/lib/mic-audio";
import type { PhrasePitchFeatures } from "@/types";
import { EXERCISE_IN_TUNE_CENTS, EXERCISE_NEAR_CENTS } from "@/lib/vocal-exercise";

export type MelodyGuidePhase = "idle" | "listening" | "armed" | "live";

const FFT_SIZE = 4096;
const IN_TUNE = EXERCISE_IN_TUNE_CENTS / 100;
const NEAR = EXERCISE_NEAR_CENTS / 100;
const HINT = `Допуск ±${EXERCISE_IN_TUNE_CENTS}¢ · внутри зелёного коридора это попадание`;
const STATUS_CLASS =
  "flex h-7 w-[7.5rem] shrink-0 items-center justify-center truncate rounded-full bg-white/5 px-2 text-center text-[11px] font-medium leading-none ring-1 ring-white/10 ";

type Point = { t: number; midi: number };
type LivePoint = { t: number; midi: number | null; rms: number };

function voicedPoints(times: number[], pitches: Array<number | null | undefined>): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < times.length; i += 1) {
    const midi = pitches[i];
    if (typeof midi === "number" && Number.isFinite(midi)) {
      out.push({ t: Number(times[i]), midi });
    }
  }
  return out;
}

function midiAtTime(points: Point[], time: number, maxGap = 0.32): number | null {
  if (points.length === 0) return null;
  let lo = 0;
  let hi = points.length - 1;
  if (time <= points[0].t) {
    return points[0].t - time > maxGap ? null : points[0].midi;
  }
  if (time >= points[hi].t) {
    return time - points[hi].t > maxGap ? null : points[hi].midi;
  }
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t <= time) lo = mid;
    else hi = mid;
  }
  const a = points[lo];
  const b = points[hi];
  if (b.t - a.t > maxGap) return null;
  const u = (time - a.t) / Math.max(1e-6, b.t - a.t);
  return a.midi + (b.midi - a.midi) * u;
}

function midiRange(points: Point[]): { min: number; max: number } {
  const values = points.map((point) => point.midi);
  if (values.length === 0) return { min: 50, max: 74 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max(4, (max - min) * 0.28);
  return { min: min - pad, max: max + pad };
}

function yFromMidi(midi: number, range: { min: number; max: number }, top: number, bottom: number) {
  const span = Math.max(0.8, range.max - range.min);
  return bottom - ((midi - range.min) / span) * (bottom - top);
}

function fitCanvas(canvas: HTMLCanvasElement) {
  const dpr = Math.min(2.5, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return { width, height, dpr };
}

function peakOf(buffer: Float32Array) {
  let peak = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    const value = Math.abs(buffer[i] ?? 0);
    if (value > peak) peak = value;
  }
  return peak;
}

export default function LiveMelodyGuide({
  features,
  stream,
  phase,
  playheadSec = 0,
  phraseDurationSec = 0,
  clockSynced = false,
}: {
  features: PhrasePitchFeatures | null;
  stream: MediaStream | null;
  phase: MelodyGuidePhase;
  playheadSec?: number;
  phraseDurationSec?: number;
  clockSynced?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<LivePoint[]>([]);
  const liveMidiRef = useRef<number | null>(null);
  const liveNoteRef = useRef<string>("—");
  const centsRef = useRef<number | null>(null);
  const rmsRef = useRef(0);
  const waveRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const startedAtRef = useRef(0);
  const playheadRef = useRef(playheadSec);
  const phaseRef = useRef(phase);
  const clockRef = useRef(clockSynced);
  const targetEl = useRef<HTMLSpanElement>(null);
  const yoursEl = useRef<HTMLSpanElement>(null);
  const statusEl = useRef<HTMLSpanElement>(null);

  playheadRef.current = playheadSec;
  phaseRef.current = phase;
  clockRef.current = clockSynced;

  useEffect(() => {
    if (phase === "live" || phase === "armed") {
      liveRef.current = [];
      liveMidiRef.current = null;
      startedAtRef.current = performance.now();
    }
  }, [phase]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const times = features?.times ?? [];
    const pitches = features?.pitch_midi ?? [];
    const reference = voicedPoints(times, pitches);
    const duration = Math.max(
      0.9,
      phraseDurationSec || Number(features?.duration) || (times.length ? Number(times[times.length - 1]) : 4)
    );
    const range = midiRange(reference);

    let raf = 0;
    let ctx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let mute: GainNode | null = null;
    let detector: ReturnType<typeof createYinDetector> | null = null;
    let buffer: Float32Array<ArrayBuffer> | null = null;
    let lastHud = 0;
    const sparks: Array<{ x: number; y: number; vx: number; vy: number; life: number; hue: number }> = [];

    const paint = (now: number) => {
      const drawing = canvas.getContext("2d");
      if (!drawing) return;
      const { width, height, dpr } = fitCanvas(canvas);
      const padL = 42 * dpr;
      const padR = 16 * dpr;
      const padT = 18 * dpr;
      const padB = 28 * dpr;
      const innerW = width - padL - padR;
      const innerH = height - padT - padB;
      const tNow = Math.min(duration, Math.max(0, playheadRef.current));
      const xAt = (time: number) => padL + (time / duration) * innerW;
      const yAt = (midi: number) => yFromMidi(midi, range, padT, padT + innerH);

      drawing.clearRect(0, 0, width, height);
      const bg = drawing.createLinearGradient(0, 0, width, height);
      bg.addColorStop(0, "#07060f");
      bg.addColorStop(0.55, "#0c0a16");
      bg.addColorStop(1, "#120b1c");
      drawing.fillStyle = bg;
      drawing.fillRect(0, 0, width, height);

      const pulse = 0.45 + 0.55 * Math.sin(now / 420);
      const aurora = drawing.createRadialGradient(
        padL + innerW * (0.25 + 0.08 * Math.sin(now / 1400)),
        padT + innerH * 0.35,
        12 * dpr,
        padL + innerW * 0.5,
        padT + innerH * 0.5,
        innerW * 0.85
      );
      aurora.addColorStop(0, `rgba(124, 58, 237, ${0.16 + pulse * 0.08})`);
      aurora.addColorStop(0.45, `rgba(56, 189, 248, ${0.05 + pulse * 0.04})`);
      aurora.addColorStop(1, "rgba(0,0,0,0)");
      drawing.fillStyle = aurora;
      drawing.fillRect(0, 0, width, height);

      drawing.save();
      drawing.beginPath();
      drawing.rect(padL, padT, innerW, innerH);
      drawing.clip();

      drawing.lineWidth = 1;
      const midiStart = Math.floor(range.min);
      const midiEnd = Math.ceil(range.max);
      for (let midi = midiStart; midi <= midiEnd; midi += 1) {
        const y = yAt(midi);
        const natural = midi % 12 === 0;
        drawing.strokeStyle = natural ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)";
        drawing.beginPath();
        drawing.moveTo(padL, y);
        drawing.lineTo(padL + innerW, y);
        drawing.stroke();
      }

      const scan = ((now / 18) % innerW);
      const scanGrad = drawing.createLinearGradient(padL + scan - 40 * dpr, 0, padL + scan + 40 * dpr, 0);
      scanGrad.addColorStop(0, "rgba(192,132,252,0)");
      scanGrad.addColorStop(0.5, "rgba(192,132,252,0.07)");
      scanGrad.addColorStop(1, "rgba(192,132,252,0)");
      drawing.fillStyle = scanGrad;
      drawing.fillRect(padL, padT, innerW, innerH);

      if (reference.length > 1) {
        const step = duration / Math.max(160, innerW);
        const fillCorridor = (half: number, fill: string | CanvasGradient) => {
          drawing.fillStyle = fill;
          let top: Array<{ x: number; y: number }> = [];
          let bot: Array<{ x: number; y: number }> = [];
          const flushBand = () => {
            if (top.length < 2) {
              top = [];
              bot = [];
              return;
            }
            drawing.beginPath();
            drawing.moveTo(top[0].x, top[0].y);
            for (let i = 1; i < top.length; i += 1) drawing.lineTo(top[i].x, top[i].y);
            for (let i = bot.length - 1; i >= 0; i -= 1) drawing.lineTo(bot[i].x, bot[i].y);
            drawing.closePath();
            drawing.fill();
            top = [];
            bot = [];
          };
          for (let time = 0; time <= duration; time += step) {
            const midi = midiAtTime(reference, time);
            if (midi == null) {
              flushBand();
              continue;
            }
            top.push({ x: xAt(time), y: yAt(midi + half) });
            bot.push({ x: xAt(time), y: yAt(midi - half) });
          }
          flushBand();
        };
        fillCorridor(NEAR, "rgba(167,139,250,0.16)");
        fillCorridor(IN_TUNE, "rgba(52,211,153,0.22)");

        drawing.save();
        drawing.shadowColor = "rgba(196,181,253,0.85)";
        drawing.shadowBlur = 18 * dpr;
        drawing.strokeStyle = "#e9d5ff";
        drawing.lineWidth = 2.6 * dpr;
        drawing.lineJoin = "round";
        drawing.lineCap = "round";
        drawing.beginPath();
        let stroking = false;
        for (let time = 0; time <= duration; time += step) {
          const midi = midiAtTime(reference, time);
          if (midi == null) {
            stroking = false;
            continue;
          }
          const x = xAt(time);
          const y = yAt(midi);
          if (!stroking) {
            drawing.moveTo(x, y);
            stroking = true;
          } else {
            drawing.lineTo(x, y);
          }
        }
        drawing.stroke();
        drawing.restore();

        if (phaseRef.current === "listening" || phaseRef.current === "live") {
          drawing.fillStyle = "rgba(7,6,15,0.35)";
          drawing.fillRect(xAt(tNow), padT, padL + innerW - xAt(tNow), innerH);
        }
      }

      const live = liveRef.current;
      if (live.length > 1) {
        drawing.save();
        drawing.lineJoin = "round";
        drawing.lineCap = "round";
        drawing.lineWidth = 3.4 * dpr;
        let prev: LivePoint | null = null;
        for (const point of live) {
          if (point.midi == null || prev?.midi == null) {
            prev = point;
            continue;
          }
          const target = midiAtTime(reference, point.t);
          const err = target == null ? 99 : Math.abs(point.midi - target);
          drawing.strokeStyle =
            err <= IN_TUNE ? "#34d399" : err <= NEAR ? "#fbbf24" : "#fb7185";
          drawing.shadowColor = drawing.strokeStyle;
          drawing.shadowBlur = 14 * dpr;
          drawing.beginPath();
          drawing.moveTo(xAt(prev.t), yAt(prev.midi));
          drawing.lineTo(xAt(point.t), yAt(point.midi));
          drawing.stroke();
          prev = point;
        }
        drawing.restore();
      }

      const headX = xAt(tNow);
      const beam = drawing.createLinearGradient(headX, padT, headX, padT + innerH);
      beam.addColorStop(0, "rgba(251,191,36,0)");
      beam.addColorStop(0.5, "rgba(251,191,36,0.95)");
      beam.addColorStop(1, "rgba(52,211,153,0)");
      drawing.strokeStyle = beam;
      drawing.lineWidth = 2 * dpr;
      drawing.beginPath();
      drawing.moveTo(headX, padT);
      drawing.lineTo(headX, padT + innerH);
      drawing.stroke();
      drawing.fillStyle = `rgba(251,191,36,${0.12 + pulse * 0.08})`;
      drawing.fillRect(headX - 10 * dpr, padT, 20 * dpr, innerH);

      const liveMidi = liveMidiRef.current;
      if (liveMidi != null && (phaseRef.current === "live" || phaseRef.current === "armed")) {
        const orbX = phaseRef.current === "armed" ? padL + innerW * 0.12 : headX;
        const orbY = yAt(liveMidi);
        const target = midiAtTime(reference, tNow);
        const err = target == null ? 0 : Math.abs(liveMidi - target);
        const color = err <= IN_TUNE ? "#34d399" : err <= NEAR ? "#fbbf24" : "#fb7185";
        drawing.save();
        drawing.shadowColor = color;
        drawing.shadowBlur = 24 * dpr;
        drawing.fillStyle = color;
        drawing.beginPath();
        drawing.arc(orbX, orbY, (7 + pulse * 3) * dpr, 0, Math.PI * 2);
        drawing.fill();
        drawing.lineWidth = 2 * dpr;
        drawing.strokeStyle = "rgba(255,255,255,0.85)";
        drawing.beginPath();
        drawing.arc(orbX, orbY, (14 + pulse * 6) * dpr, 0, Math.PI * 2);
        drawing.stroke();
        drawing.restore();
        if (phaseRef.current === "live" && err <= IN_TUNE && Math.random() < 0.35) {
          sparks.push({
            x: orbX,
            y: orbY,
            vx: (Math.random() - 0.5) * 1.4 * dpr,
            vy: (-0.6 - Math.random()) * dpr,
            life: 1,
            hue: 150,
          });
        }
      }

      for (let i = sparks.length - 1; i >= 0; i -= 1) {
        const spark = sparks[i];
        spark.x += spark.vx;
        spark.y += spark.vy;
        spark.life -= 0.02;
        if (spark.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        drawing.globalAlpha = spark.life;
        drawing.fillStyle = `hsl(${spark.hue} 90% 65%)`;
        drawing.beginPath();
        drawing.arc(spark.x, spark.y, 2.2 * dpr, 0, Math.PI * 2);
        drawing.fill();
        drawing.globalAlpha = 1;
      }

      const wave = waveRef.current;
      if (wave && wave.length > 8) {
        const wy = padT + innerH + 6 * dpr;
        const wh = padB - 10 * dpr;
        const energy = Math.min(1, rmsRef.current * 14);
        drawing.strokeStyle = `rgba(52,211,153,${0.25 + energy * 0.55})`;
        drawing.lineWidth = 1.4 * dpr;
        drawing.beginPath();
        const stride = Math.max(1, Math.floor(wave.length / 180));
        let p = 0;
        for (let i = 0; i < wave.length; i += stride) {
          const x = padL + (p / 180) * innerW;
          const y = wy + wh / 2 - (wave[i] ?? 0) * wh * (0.7 + energy);
          if (p === 0) drawing.moveTo(x, y);
          else drawing.lineTo(x, y);
          p += 1;
        }
        drawing.stroke();
      }

      drawing.restore();

      drawing.font = `${11 * dpr}px ui-sans-serif, system-ui, sans-serif`;
      drawing.textAlign = "right";
      drawing.textBaseline = "middle";
      for (let midi = midiStart; midi <= midiEnd; midi += 1) {
        if (midi % 12 !== 0 && midi % 12 !== 7) continue;
        drawing.fillStyle = "rgba(228,228,231,0.55)";
        drawing.fillText(noteLabelFromMidi(midi), padL - 6 * dpr, yAt(midi));
      }
    };

    const pushLive = (midi: number | null, rms: number) => {
      if (phaseRef.current !== "live") return;
      const elapsed = (performance.now() - startedAtRef.current) / 1000;
      const time = clockRef.current ? playheadRef.current : elapsed;
      liveRef.current.push({ t: Math.max(0, time), midi, rms });
      if (liveRef.current.length > 2400) {
        liveRef.current.splice(0, liveRef.current.length - 2400);
      }
    };

    const tick = (now: number) => {
      if (analyser && detector && buffer && stream) {
        readAnalyserTimeDomain(analyser, buffer);
        waveRef.current = buffer;
        const rms = computeRms(buffer);
        const db = dbFromRms(rms);
        const peak = peakOf(buffer);
        rmsRef.current = rms;
        const skipDb = isAppleWebKit() ? -64 : -58;
        const hasVoice = db > skipDb || peak > 0.018;
        let hz = hasVoice ? detector(buffer) : null;
        if (!hz && peak > 0.02) {
          const fallback = detectPitchHzOctaveSafe(buffer, ctx?.sampleRate ?? 44100);
          hz = fallback > 0 ? fallback : null;
        }
        const target = midiAtTime(reference, playheadRef.current);
        if (hz && target != null) {
          hz = snapToNearbyOctave(hz, 440 * Math.pow(2, (target - 69) / 12));
        }
        const midi = hz ? midiFromFrequency(hz) : null;
        const smoothed =
          midi != null && liveMidiRef.current != null
            ? liveMidiRef.current * 0.55 + midi * 0.45
            : midi;
        liveMidiRef.current = smoothed;
        liveNoteRef.current = smoothed != null ? noteLabelFromMidi(smoothed) : "—";
        centsRef.current =
          smoothed != null && target != null ? Math.round((smoothed - target) * 100) : null;
        pushLive(smoothed, rms);
      }
      paint(now);
      if (now - lastHud > 80) {
        lastHud = now;
        const targetMidi = midiAtTime(reference, playheadRef.current);
        if (targetEl.current) {
          targetEl.current.textContent = targetMidi != null ? noteLabelFromMidi(targetMidi) : "—";
        }
        if (yoursEl.current) {
          yoursEl.current.textContent = liveNoteRef.current;
        }
        if (statusEl.current) {
          const cents = centsRef.current;
          const live = phaseRef.current === "live" || phaseRef.current === "armed";
          const inZone = cents != null && Math.abs(cents) <= EXERCISE_IN_TUNE_CENTS;
          statusEl.current.textContent = !live
            ? phaseRef.current === "listening"
              ? "Слушайте"
              : "Эталон"
            : liveMidiRef.current == null
              ? "Спойте"
              : cents == null
                ? "Спойте"
                : inZone
                  ? "В зоне"
                  : cents > 0
                    ? "Выше"
                    : "Ниже";
          statusEl.current.className =
            STATUS_CLASS + (inZone ? "text-emerald-300" : "text-white");
        }
      }
      raf = window.requestAnimationFrame(tick);
    };

    const start = async () => {
      if (stream) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctx = new AudioCtx();
        if (ctx.state === "suspended") await ctx.resume();
        source = ctx.createMediaStreamSource(stream);
        analyser = ctx.createAnalyser();
        analyser.fftSize = FFT_SIZE;
        analyser.smoothingTimeConstant = 0.12;
        const inputGain = ctx.createGain();
        inputGain.gain.value = singingInputGainValue();
        source.connect(inputGain);
        inputGain.connect(analyser);
        mute = connectAnalyserToDestination(ctx, analyser);
        detector = createYinDetector(ctx.sampleRate);
        buffer = new Float32Array(analyser.fftSize);
      }
      raf = window.requestAnimationFrame(tick);
    };

    void start();
    return () => {
      window.cancelAnimationFrame(raf);
      try {
        source?.disconnect();
        analyser?.disconnect();
        mute?.disconnect();
      } catch {
        /* already closed */
      }
      void ctx?.close().catch(() => undefined);
    };
  }, [features, phraseDurationSec, stream]);

  return (
    <div className="relative mt-3 overflow-hidden rounded-2xl bg-[#07060f] ring-1 ring-violet-400/30">
      <div className="pointer-events-none absolute -left-10 top-0 h-32 w-32 rounded-full bg-violet-600/25 blur-3xl" />
      <div className="pointer-events-none absolute -right-8 bottom-0 h-28 w-28 rounded-full bg-emerald-400/15 blur-3xl" />
      <div className="relative grid h-14 grid-cols-[minmax(4.75rem,1fr)_auto_minmax(4.75rem,1fr)] items-center gap-2 px-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase leading-none tracking-[0.18em] text-violet-200/70">Эталон</p>
          <span
            ref={targetEl}
            className="mt-1 block h-6 truncate font-display text-lg font-semibold leading-6 text-violet-100"
          >
            —
          </span>
        </div>
        <span
          ref={statusEl}
          className={`${STATUS_CLASS} text-white`}
        >
          Эталон
        </span>
        <div className="min-w-0 text-right">
          <p className="text-[10px] uppercase leading-none tracking-[0.18em] text-emerald-300/80">Ваш голос</p>
          <span
            ref={yoursEl}
            className="mt-1 block h-6 truncate font-display text-lg font-semibold leading-6 text-emerald-200"
          >
            —
          </span>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        className="relative h-52 w-full sm:h-60"
        aria-label="Живой контур мелодии"
      />
      <p className="h-8 truncate px-3 text-center text-[10px] leading-8 text-zinc-400">
        {HINT}
      </p>
    </div>
  );
}
