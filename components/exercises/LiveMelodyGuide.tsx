"use client";

import { useEffect, useRef, type RefObject } from "react";
import {
  computeRms,
  createYinDetector,
  detectPitchHzOctaveSafe,
  noteLabelFromMidi,
} from "@/lib/pitch";
import {
  connectAnalyserToDestination,
  readAnalyserTimeDomain,
  singingInputGainValue,
} from "@/lib/mic-audio";
import {
  HITBOX_TIMING_SLACK_SEC,
  blockAtTime,
  displayMidiForLive,
  quantizeNoteBlocks,
} from "@/lib/note-blocks";
import type { PhrasePitchFeatures } from "@/types";

export type MelodyGuidePhase = "idle" | "listening" | "armed" | "live";

const FFT_SIZE = 4096;
const HINT = "Пойте в серые блоки. Зелёный — попадание в ноту, жёлтый — вы в ритме.";
const STATUS_CLASS =
  "flex h-7 min-w-0 max-w-full shrink items-center justify-center truncate rounded-full bg-white/5 px-2 text-center text-[11px] font-medium leading-none ring-1 ring-white/10 ";
const PIXELS_PER_SEC = 100;
const PLAYHEAD_FRAC = 0.2;
const VAD_RMS = 0.02;
const SMOOTH = 0.2;

type LivePoint = { t: number; midi: number; snapped: boolean };

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

function fitCanvas(canvas: HTMLCanvasElement, host: HTMLElement) {
  const width = Math.max(1, Math.floor(host.clientWidth));
  const height = Math.max(1, Math.floor(host.clientHeight));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  return { width, height };
}

export default function LiveMelodyGuide({
  features,
  stream,
  phase,
  playheadSec = 0,
  phraseDurationSec = 0,
  backingAudioRef,
  phraseStartSec = 0,
}: {
  features: PhrasePitchFeatures | null;
  stream: MediaStream | null;
  phase: MelodyGuidePhase;
  playheadSec?: number;
  phraseDurationSec?: number;
  backingAudioRef?: RefObject<HTMLAudioElement | null>;
  phraseStartSec?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef<LivePoint[]>([]);
  const liveHzRef = useRef<number | null>(null);
  const liveNoteRef = useRef("—");
  const pitchScoreRef = useRef(0);
  const snappedRef = useRef(false);
  const smoothMidiRef = useRef<number | null>(null);
  const rmsRef = useRef(0);
  const playheadRef = useRef(playheadSec);
  const phaseRef = useRef(phase);
  const phraseStartRef = useRef(phraseStartSec);
  const targetEl = useRef<HTMLSpanElement>(null);
  const yoursEl = useRef<HTMLSpanElement>(null);
  const statusEl = useRef<HTMLSpanElement>(null);

  playheadRef.current = playheadSec;
  phaseRef.current = phase;
  phraseStartRef.current = phraseStartSec;

  useEffect(() => {
    const host = canvasContainerRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const observer = new ResizeObserver(() => {
      fitCanvas(canvas, host);
    });
    observer.observe(host);
    fitCanvas(canvas, host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (phase === "live" || phase === "armed") {
      liveRef.current = [];
      liveHzRef.current = null;
      smoothMidiRef.current = null;
    }
  }, [phase]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvasContainerRef.current;
    if (!canvas || !host) return;
    const blocks = quantizeNoteBlocks(features);
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
    let lastSyncLog = 0;

    const readPhraseTime = () => {
      const audio = backingAudioRef?.current;
      const start = phraseStartRef.current;
      if (audio && !audio.paused && Number.isFinite(audio.currentTime)) {
        return Math.max(0, Math.min(duration, audio.currentTime - start));
      }
      return Math.max(0, Math.min(duration, playheadRef.current));
    };

    const paint = (now: number) => {
      const drawing = canvas.getContext("2d");
      if (!drawing) return;
      const { width, height } = fitCanvas(canvas, host);
      const padL = 36;
      const padT = 12;
      const padB = 16;
      const innerH = height - padT - padB;
      const tNow = readPhraseTime();
      const nowX = width * PLAYHEAD_FRAC;
      const xAt = (time: number) => nowX + (time - tNow) * PIXELS_PER_SEC;
      const yAt = (midi: number) => yFromMidi(midi, range, padT, padT + innerH);
      const pulse = 0.45 + 0.55 * Math.sin(now / 420);
      const active = blockAtTime(blocks, tNow, HITBOX_TIMING_SLACK_SEC);

      drawing.clearRect(0, 0, width, height);
      drawing.fillStyle = "#111827";
      drawing.fillRect(0, 0, width, height);

      drawing.save();
      drawing.beginPath();
      drawing.rect(0, padT, width, innerH);
      drawing.clip();

      for (const block of blocks) {
        const x = xAt(block.startTime);
        const w = Math.max(4, xAt(block.endTime) - x);
        if (x + w < -8 || x > width + 8) continue;
        const yTop = yAt(block.midi + 1);
        const yBot = yAt(block.midi - 1);
        const h = Math.max(12, yBot - yTop);
        const lit = active?.startTime === block.startTime && snappedRef.current;
        const inWindow = active?.startTime === block.startTime;
        drawing.shadowColor = lit ? "#4ade80" : "transparent";
        drawing.shadowBlur = lit ? 22 : 0;
        drawing.fillStyle = lit
          ? "rgba(74,222,128,0.45)"
          : inWindow
            ? "rgba(250,204,21,0.22)"
            : "rgba(148,163,184,0.2)";
        drawing.strokeStyle = lit
          ? "rgba(74,222,128,1)"
          : inWindow
            ? "rgba(250,204,21,0.85)"
            : "rgba(203,213,225,0.35)";
        drawing.lineWidth = lit ? 2.4 : 1.4;
        drawing.beginPath();
        if (typeof drawing.roundRect === "function") {
          drawing.roundRect(x, yTop, w, h, 6);
        } else {
          drawing.rect(x, yTop, w, h);
        }
        drawing.fill();
        drawing.stroke();
        drawing.shadowBlur = 0;
        drawing.fillStyle = "rgba(226,232,240,0.85)";
        drawing.font = "10px ui-sans-serif, system-ui";
        drawing.textAlign = "left";
        drawing.textBaseline = "middle";
        drawing.fillText(block.note, x + 6, yTop + h / 2);
      }

      const live = liveRef.current;
      if (live.length > 1) {
        drawing.lineJoin = "round";
        drawing.lineCap = "round";
        drawing.lineWidth = 3.4;
        drawing.beginPath();
        let started = false;
        for (let i = 0; i < live.length; i += 1) {
          const point = live[i];
          if (!point) continue;
          const x = xAt(point.t);
          const y = yAt(point.midi);
          if (!started) {
            drawing.moveTo(x, y);
            started = true;
            continue;
          }
          const prev = live[i - 1];
          if (!prev) {
            drawing.moveTo(x, y);
            continue;
          }
          const cx = (xAt(prev.t) + x) / 2;
          const cy = (yAt(prev.midi) + y) / 2;
          drawing.quadraticCurveTo(xAt(prev.t), yAt(prev.midi), cx, cy);
        }
        drawing.strokeStyle = snappedRef.current ? "#4ade80" : "#fbbf24";
        drawing.stroke();
      }

      drawing.strokeStyle = `rgba(251,191,36,${0.55 + pulse * 0.35})`;
      drawing.lineWidth = 2;
      drawing.beginPath();
      drawing.moveTo(nowX, padT);
      drawing.lineTo(nowX, padT + innerH);
      drawing.stroke();

      const smooth = smoothMidiRef.current;
      if (smooth != null && (phaseRef.current === "live" || phaseRef.current === "armed")) {
        const orbX = phaseRef.current === "armed" ? width * 0.12 : nowX;
        const color = snappedRef.current ? "#4ade80" : pitchScoreRef.current > 0 ? "#facc15" : "#fb7185";
        drawing.shadowColor = color;
        drawing.shadowBlur = 18;
        drawing.fillStyle = color;
        drawing.beginPath();
        drawing.arc(orbX, yAt(smooth), 7 + pulse * 3, 0, Math.PI * 2);
        drawing.fill();
        drawing.shadowBlur = 0;
      }
      drawing.restore();

      drawing.font = "11px ui-sans-serif, system-ui";
      drawing.textAlign = "right";
      drawing.textBaseline = "middle";
      drawing.fillStyle = "rgba(228,228,231,0.55)";
      const midiStart = Math.floor(range.min);
      const midiEnd = Math.ceil(range.max);
      for (let midi = midiStart; midi <= midiEnd; midi += 1) {
        if (midi % 12 !== 0 && midi % 12 !== 7) continue;
        drawing.fillText(noteLabelFromMidi(midi), Math.max(4, padL - 6), yAt(midi));
      }
    };

    const tick = (now: number) => {
      const tNow = readPhraseTime();
      let hz: number | null = null;
      if (analyser && detector && buffer && stream) {
        readAnalyserTimeDomain(analyser, buffer);
        const rms = computeRms(buffer);
        rmsRef.current = rms;
        if (rms > VAD_RMS) {
          hz = detector(buffer);
          if (!hz) {
            const fallback = detectPitchHzOctaveSafe(buffer, ctx?.sampleRate ?? 44100);
            hz = fallback > 0 ? fallback : null;
          }
        }
        liveHzRef.current = hz;
        const shown = hz ? displayMidiForLive(hz, tNow, blocks) : null;
        liveNoteRef.current = shown ? noteLabelFromMidi(shown.midi) : "—";
        pitchScoreRef.current = shown?.pitchScore ?? 0;
        snappedRef.current = Boolean(shown?.snapped);
        if (shown) {
          const current = smoothMidiRef.current;
          smoothMidiRef.current =
            current == null ? shown.midi : current + (shown.midi - current) * SMOOTH;
          if (phaseRef.current === "live") {
            liveRef.current.push({
              t: Math.max(0, tNow),
              midi: smoothMidiRef.current,
              snapped: shown.snapped,
            });
            if (liveRef.current.length > 2400) liveRef.current.splice(0, liveRef.current.length - 2400);
          }
        }

        const activeBlock = blockAtTime(blocks, tNow, HITBOX_TIMING_SLACK_SEC);
        if (phaseRef.current === "live" && now - lastSyncLog > 250) {
          lastSyncLog = now;
          const audio = backingAudioRef?.current;
          console.log("[SYNC DEBUG]", {
            audioTime: tNow,
            currentTime: audio?.currentTime ?? null,
            userHz: hz,
            rms,
            activeBlock: activeBlock
              ? { note: activeBlock.note, start: activeBlock.startTime, end: activeBlock.endTime }
              : null,
            pitchScore: pitchScoreRef.current,
          });
        }
      }
      paint(now);
      if (now - lastHud > 80) {
        lastHud = now;
        const current = blockAtTime(blocks, tNow, HITBOX_TIMING_SLACK_SEC);
        if (targetEl.current) targetEl.current.textContent = current?.note ?? "—";
        if (yoursEl.current) yoursEl.current.textContent = liveNoteRef.current;
        if (statusEl.current) {
          const live = phaseRef.current === "live" || phaseRef.current === "armed";
          statusEl.current.textContent = !live
            ? phaseRef.current === "listening"
              ? "Слушайте"
              : "Караоке"
            : rmsRef.current <= VAD_RMS
              ? "Спойте"
              : snappedRef.current
                ? "В ноте"
                : "В ритме";
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
        analyser.smoothingTimeConstant = 0.18;
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
  }, [backingAudioRef, features, phraseDurationSec, stream]);

  return (
    <div className="relative mt-3 flex h-full w-full max-w-[100vw] flex-col overflow-hidden">
      <div className="relative grid h-12 w-full min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1 px-2">
        <div className="min-w-0">
          <p className="truncate text-[10px] uppercase leading-none tracking-[0.18em] text-violet-200/70">
            Эталон
          </p>
          <span
            ref={targetEl}
            className="mt-1 block h-6 truncate font-display text-base font-semibold leading-6 text-violet-100 sm:text-lg"
          >
            —
          </span>
        </div>
        <span ref={statusEl} className={`${STATUS_CLASS} text-white`}>
          Караоке
        </span>
        <div className="min-w-0 text-right">
          <p className="truncate text-[10px] uppercase leading-none tracking-[0.18em] text-emerald-300/80">
            Ваш голос
          </p>
          <span
            ref={yoursEl}
            className="mt-1 block h-6 truncate font-display text-base font-semibold leading-6 text-emerald-200 sm:text-lg"
          >
            —
          </span>
        </div>
      </div>
      <div
        ref={canvasContainerRef}
        className="relative w-full shrink-0 overflow-hidden rounded-lg bg-gray-900"
        style={{ height: 250 }}
      >
        <canvas
          ref={canvasRef}
          className="block"
          style={{ width: "100%", height: 250, objectFit: "contain" }}
          aria-label="Караоке-хитбоксы"
        />
      </div>
      <p className="h-8 truncate px-2 text-center text-[10px] leading-8 text-zinc-400">{HINT}</p>
    </div>
  );
}
