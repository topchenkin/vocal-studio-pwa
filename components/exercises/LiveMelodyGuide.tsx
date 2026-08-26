"use client";

import { useEffect, useRef } from "react";
import {
  computeRms,
  createYinDetector,
  dbFromRms,
  detectPitchHzOctaveSafe,
  noteLabelFromMidi,
} from "@/lib/pitch";
import {
  connectAnalyserToDestination,
  isAppleWebKit,
  readAnalyserTimeDomain,
  singingInputGainValue,
} from "@/lib/mic-audio";
import {
  HITBOX_GREEN_CENTS,
  displayMidiForLive,
  quantizeNoteBlocks,
  shiftNoteBlocks,
} from "@/lib/note-blocks";
import type { PhrasePitchFeatures } from "@/types";

export type MelodyGuidePhase = "idle" | "listening" | "armed" | "live";

const FFT_SIZE = 4096;
const HINT = "Серые блоки — ноты. Зелёный шар в блоке = попадание. Красный — фальшь.";
const STATUS_CLASS =
  "flex h-7 w-[7.5rem] shrink-0 items-center justify-center truncate rounded-full bg-white/5 px-2 text-center text-[11px] font-medium leading-none ring-1 ring-white/10 ";

type LivePoint = { t: number; hz: number | null };

function midiRange(midis: number[]): { min: number; max: number } {
  if (midis.length === 0) return { min: 50, max: 74 };
  const min = Math.min(...midis);
  const max = Math.max(...midis);
  const pad = Math.max(3.5, (max - min) * 0.35);
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
  transpose = 0,
}: {
  features: PhrasePitchFeatures | null;
  stream: MediaStream | null;
  phase: MelodyGuidePhase;
  playheadSec?: number;
  phraseDurationSec?: number;
  clockSynced?: boolean;
  transpose?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<LivePoint[]>([]);
  const liveHzRef = useRef<number | null>(null);
  const liveNoteRef = useRef("—");
  const centsRef = useRef<number | null>(null);
  const snappedRef = useRef(false);
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
      liveHzRef.current = null;
      startedAtRef.current = performance.now();
    }
  }, [phase]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const blocks = shiftNoteBlocks(quantizeNoteBlocks(features), transpose);
    const duration = Math.max(
      0.9,
      phraseDurationSec || Number(features?.duration) || (blocks[blocks.length - 1]?.endTime ?? 4)
    );
    const range = midiRange(blocks.map((block) => block.midi));

    let raf = 0;
    let ctx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let mute: GainNode | null = null;
    let detector: ReturnType<typeof createYinDetector> | null = null;
    let buffer: Float32Array<ArrayBuffer> | null = null;
    let lastHud = 0;

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
      const pulse = 0.45 + 0.55 * Math.sin(now / 420);

      drawing.clearRect(0, 0, width, height);
      const bg = drawing.createLinearGradient(0, 0, width, height);
      bg.addColorStop(0, "#07060f");
      bg.addColorStop(1, "#120b1c");
      drawing.fillStyle = bg;
      drawing.fillRect(0, 0, width, height);

      drawing.save();
      drawing.beginPath();
      drawing.rect(padL, padT, innerW, innerH);
      drawing.clip();

      for (const block of blocks) {
        const x = xAt(block.startTime);
        const w = Math.max(4 * dpr, xAt(block.endTime) - x);
        const yTop = yAt(block.midi + HITBOX_GREEN_CENTS / 100);
        const yBot = yAt(block.midi - HITBOX_GREEN_CENTS / 100);
        const h = Math.max(10 * dpr, yBot - yTop);
        const active = tNow >= block.startTime - 0.05 && tNow <= block.endTime + 0.05;
        drawing.fillStyle = active ? "rgba(52,211,153,0.22)" : "rgba(148,163,184,0.18)";
        drawing.strokeStyle = active ? "rgba(52,211,153,0.85)" : "rgba(203,213,225,0.35)";
        drawing.lineWidth = 1.4 * dpr;
        drawing.beginPath();
        if (typeof drawing.roundRect === "function") {
          drawing.roundRect(x, yTop, w, h, 6 * dpr);
        } else {
          drawing.rect(x, yTop, w, h);
        }
        drawing.fill();
        drawing.stroke();
        drawing.fillStyle = "rgba(226,232,240,0.7)";
        drawing.font = `${10 * dpr}px ui-sans-serif, system-ui`;
        drawing.textAlign = "left";
        drawing.textBaseline = "middle";
        drawing.fillText(block.note, x + 6 * dpr, yTop + h / 2);
      }

      const live = liveRef.current;
      if (live.length > 1) {
        drawing.lineJoin = "round";
        drawing.lineCap = "round";
        drawing.lineWidth = 3.2 * dpr;
        let prev: { x: number; y: number; color: string } | null = null;
        for (const point of live) {
          if (point.hz == null) {
            prev = null;
            continue;
          }
          const shown = displayMidiForLive(point.hz, point.t, blocks);
          if (!shown) {
            prev = null;
            continue;
          }
          const color = shown.snapped ? "#4ade80" : "#fb7185";
          const next = { x: xAt(point.t), y: yAt(shown.midi), color };
          if (prev && prev.color === color) {
            drawing.strokeStyle = color;
            drawing.shadowColor = color;
            drawing.shadowBlur = shown.snapped ? 16 * dpr : 8 * dpr;
            drawing.beginPath();
            drawing.moveTo(prev.x, prev.y);
            drawing.lineTo(next.x, next.y);
            drawing.stroke();
          }
          prev = next;
        }
        drawing.shadowBlur = 0;
      }

      const headX = xAt(tNow);
      drawing.strokeStyle = `rgba(251,191,36,${0.55 + pulse * 0.35})`;
      drawing.lineWidth = 2 * dpr;
      drawing.beginPath();
      drawing.moveTo(headX, padT);
      drawing.lineTo(headX, padT + innerH);
      drawing.stroke();

      const liveHz = liveHzRef.current;
      if (liveHz && (phaseRef.current === "live" || phaseRef.current === "armed")) {
        const shown = displayMidiForLive(liveHz, tNow, blocks);
        if (shown) {
          const orbX = phaseRef.current === "armed" ? padL + innerW * 0.12 : headX;
          const orbY = yAt(shown.midi);
          const color = shown.snapped ? "#4ade80" : shown.block ? "#fb7185" : "#e5e7eb";
          drawing.shadowColor = color;
          drawing.shadowBlur = 22 * dpr;
          drawing.fillStyle = color;
          drawing.beginPath();
          drawing.arc(orbX, orbY, (7 + pulse * 3) * dpr, 0, Math.PI * 2);
          drawing.fill();
          drawing.shadowBlur = 0;
        }
      }

      const wave = waveRef.current;
      if (wave && wave.length > 8) {
        const energy = Math.min(1, rmsRef.current * 14);
        drawing.strokeStyle = `rgba(52,211,153,${0.2 + energy * 0.5})`;
        drawing.lineWidth = 1.3 * dpr;
        drawing.beginPath();
        const stride = Math.max(1, Math.floor(wave.length / 180));
        let p = 0;
        for (let i = 0; i < wave.length; i += stride) {
          const x = padL + (p / 180) * innerW;
          const y = padT + innerH + 8 * dpr - (wave[i] ?? 0) * 10 * dpr;
          if (p === 0) drawing.moveTo(x, y);
          else drawing.lineTo(x, y);
          p += 1;
        }
        drawing.stroke();
      }
      drawing.restore();

      drawing.font = `${11 * dpr}px ui-sans-serif, system-ui`;
      drawing.textAlign = "right";
      drawing.textBaseline = "middle";
      drawing.fillStyle = "rgba(228,228,231,0.55)";
      const midiStart = Math.floor(range.min);
      const midiEnd = Math.ceil(range.max);
      for (let midi = midiStart; midi <= midiEnd; midi += 1) {
        if (midi % 12 !== 0 && midi % 12 !== 7) continue;
        drawing.fillText(noteLabelFromMidi(midi), padL - 6 * dpr, yAt(midi));
      }
    };

    const pushLive = (hz: number | null) => {
      if (phaseRef.current !== "live") return;
      const elapsed = (performance.now() - startedAtRef.current) / 1000;
      const time = clockRef.current ? playheadRef.current : elapsed;
      liveRef.current.push({ t: Math.max(0, time), hz });
      if (liveRef.current.length > 2400) liveRef.current.splice(0, liveRef.current.length - 2400);
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
        liveHzRef.current = hz;
        const shown = hz ? displayMidiForLive(hz, playheadRef.current, blocks) : null;
        liveNoteRef.current = shown ? noteLabelFromMidi(shown.midi) : "—";
        centsRef.current = shown?.cents ?? null;
        snappedRef.current = Boolean(shown?.snapped);
        pushLive(hz);
      }
      paint(now);
      if (now - lastHud > 80) {
        lastHud = now;
        const current = blocks.find(
          (block) => playheadRef.current >= block.startTime && playheadRef.current <= block.endTime
        );
        if (targetEl.current) targetEl.current.textContent = current?.note ?? "—";
        if (yoursEl.current) yoursEl.current.textContent = liveNoteRef.current;
        if (statusEl.current) {
          const live = phaseRef.current === "live" || phaseRef.current === "armed";
          statusEl.current.textContent = !live
            ? phaseRef.current === "listening"
              ? "Слушайте"
              : "Эталон"
            : liveHzRef.current == null
              ? "Спойте"
              : snappedRef.current
                ? "В зоне"
                : centsRef.current == null
                  ? "Спойте"
                  : "Фальшь";
          statusEl.current.className =
            STATUS_CLASS + (snappedRef.current ? "text-emerald-300" : "text-white");
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
  }, [features, phraseDurationSec, stream, transpose]);

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
        <span ref={statusEl} className={`${STATUS_CLASS} text-white`}>
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
        aria-label="Хитбоксы нот и живой голос"
      />
      <p className="h-8 truncate px-3 text-center text-[10px] leading-8 text-zinc-400">{HINT}</p>
    </div>
  );
}
