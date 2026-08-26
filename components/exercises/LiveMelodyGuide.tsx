"use client";

import { useEffect, useRef } from "react";
import {
  computeRms,
  createYinDetector,
  dbFromRms,
  midiFromFrequency,
} from "@/lib/pitch";
import { connectAnalyserToDestination, readAnalyserTimeDomain, singingInputGainValue } from "@/lib/mic-audio";
import type { PhrasePitchFeatures } from "@/types";

const FFT_SIZE = 4096;
const SKIP_DB = -58;

function midiRange(values: Array<number | null | undefined>): { min: number; max: number } {
  const voiced = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (voiced.length === 0) return { min: 48, max: 72 };
  const min = Math.min(...voiced);
  const max = Math.max(...voiced);
  const pad = Math.max(3, (max - min) * 0.2);
  return { min: min - pad, max: max + pad };
}

function drawContour(
  ctx: CanvasRenderingContext2D,
  points: Array<{ t: number; midi: number | null }>,
  duration: number,
  range: { min: number; max: number },
  width: number,
  height: number,
  color: string,
  widthPx: number
) {
  const span = Math.max(0.2, range.max - range.min);
  ctx.strokeStyle = color;
  ctx.lineWidth = widthPx;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  let drawing = false;
  for (const point of points) {
    if (point.midi == null || !Number.isFinite(point.midi)) {
      drawing = false;
      continue;
    }
    const x = (point.t / duration) * width;
    const y = height - ((point.midi - range.min) / span) * height;
    if (!drawing) {
      ctx.moveTo(x, y);
      drawing = true;
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
}

export default function LiveMelodyGuide({
  features,
  stream,
  active,
  playheadSec = 0,
}: {
  features: PhrasePitchFeatures | null;
  stream: MediaStream | null;
  active: boolean;
  playheadSec?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<Array<{ t: number; midi: number | null }>>([]);
  const startedAtRef = useRef(0);
  const playheadRef = useRef(playheadSec);
  playheadRef.current = playheadSec;

  useEffect(() => {
    liveRef.current = [];
    startedAtRef.current = performance.now();
  }, [features, active, stream]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const times = features?.times ?? [];
    const pitches = features?.pitch_midi ?? [];
    const duration = Math.max(
      0.8,
      Number(features?.duration) || (times.length ? Number(times[times.length - 1]) : 4)
    );
    const reference = times.map((time, index) => ({
      t: Number(time),
      midi: typeof pitches[index] === "number" ? Number(pitches[index]) : null,
    }));
    const range = midiRange([
      ...pitches,
      ...liveRef.current.map((point) => point.midi),
    ]);

    let raf = 0;
    let ctx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let mute: GainNode | null = null;
    let detector: ReturnType<typeof createYinDetector> | null = null;
    let buffer: Float32Array<ArrayBuffer> | null = null;

    const paint = () => {
      const drawing = canvas.getContext("2d");
      if (!drawing) return;
      const { width, height } = canvas;
      drawing.clearRect(0, 0, width, height);
      drawing.fillStyle = "#12101a";
      drawing.fillRect(0, 0, width, height);
      drawContour(drawing, reference, duration, range, width, height, "#c4b5fd", 2.4);
      drawContour(drawing, liveRef.current, duration, range, width, height, "#34d399", 2.6);
      const head = Math.min(duration, Math.max(0, playheadRef.current));
      const x = (head / duration) * width;
      drawing.strokeStyle = "rgba(251, 191, 36, 0.85)";
      drawing.lineWidth = 1.5;
      drawing.beginPath();
      drawing.moveTo(x, 0);
      drawing.lineTo(x, height);
      drawing.stroke();
    };

    const tick = () => {
      if (analyser && detector && buffer && active && stream) {
        readAnalyserTimeDomain(analyser, buffer);
        const db = dbFromRms(computeRms(buffer));
        const elapsed = (performance.now() - startedAtRef.current) / 1000;
        if (db > SKIP_DB) {
          const hz = detector(buffer);
          liveRef.current.push({
            t: elapsed,
            midi: hz ? midiFromFrequency(hz) : null,
          });
        } else {
          liveRef.current.push({ t: elapsed, midi: null });
        }
        if (liveRef.current.length > 800) {
          liveRef.current.splice(0, liveRef.current.length - 800);
        }
      }
      paint();
      raf = window.requestAnimationFrame(tick);
    };

    const start = async () => {
      if (!active || !stream) {
        paint();
        raf = window.requestAnimationFrame(tick);
        return;
      }
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AudioCtx();
      if (ctx.state === "suspended") await ctx.resume();
      source = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      const inputGain = ctx.createGain();
      inputGain.gain.value = singingInputGainValue();
      source.connect(inputGain);
      inputGain.connect(analyser);
      mute = connectAnalyserToDestination(ctx, analyser);
      detector = createYinDetector(ctx.sampleRate);
      buffer = new Float32Array(analyser.fftSize);
      startedAtRef.current = performance.now();
      liveRef.current = [];
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
  }, [active, features, stream]);

  return (
    <div className="mt-3 overflow-hidden rounded-xl bg-studio-bg ring-1 ring-studio-border">
      <div className="flex items-center justify-between px-3 pt-2 text-[10px] uppercase tracking-wide text-studio-muted">
        <span>Эталон</span>
        <span className="text-emerald-300">Ваш голос</span>
      </div>
      <canvas ref={canvasRef} width={720} height={140} className="h-28 w-full" />
    </div>
  );
}
