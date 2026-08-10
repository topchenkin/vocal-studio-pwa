"use client";

/**
 * Real-time vocal pitch analyzer.
 *
 * Owns the full audio lifecycle (mic → AudioContext → AnalyserNode) and runs
 * a single requestAnimationFrame loop that:
 *   - draws the oscilloscope waveform (imperative canvas, no React re-render
 *     cost, so it never stutters regardless of state update frequency),
 *   - detects the fundamental frequency with `pitchfinder`'s YIN algorithm,
 *   - derives loudness (dBFS) and the cents deviation from the nearest
 *     equal-tempered note (A4 = 440Hz),
 *   - feeds the live tuner state and (while a test is running) the sample
 *     buffer used to build the professional-test report.
 *
 * A single rAF loop drives everything — no `setInterval`/timeslice timers —
 * so detection and drawing never fall out of sync or visibly stutter.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  analyzeFrequency,
  computeRms,
  createYinDetector,
  dbFromRms,
  type PitchDetectorFn,
  type PitchFrame,
} from "@/lib/pitch";

export type { PitchFrame } from "@/lib/pitch";

/** AnalyserNode FFT size. 4096 keeps YIN accurate down to ~40Hz (well below
 *  any human voice) at a negligible CPU cost (well under 1ms/frame). */
const FFT_SIZE = 4096;

/** Skip pitch detection entirely below this loudness — saves CPU and avoids
 * YIN returning garbage on pure noise/silence. */
const DETECT_SKIP_DB = -55;

/** Below this average dB the take/live signal is considered "too quiet" to
 * trust — surfaced as `tooQuiet` so the UI can ask the user to sing louder
 * instead of showing a bogus score. */
const NOISE_FLOOR_DB = -50;

/** A take needs at least this fraction of voiced frames to be scoreable. */
const MIN_VOICED_RATIO = 0.15;

/** Consecutive unvoiced frames before the live tuner resets to "silence" —
 * pure UI debounce so a single dropped frame doesn't flicker the display. */
const SILENT_HOLD_FRAMES = 4;

/** Rolling window (frames) used to decide the live "too quiet" indicator. */
const ROLLING_DB_WINDOW = 90;

export type LiveTunerState = {
  frequencyHz: number | null;
  note: string | null;
  cents: number | null;
  db: number;
  voiced: boolean;
  tooQuiet: boolean;
};

const IDLE_LIVE_STATE: LiveTunerState = {
  frequencyHz: null,
  note: null,
  cents: null,
  db: -100,
  voiced: false,
  tooQuiet: false,
};

export type VocalTestResult = {
  frames: PitchFrame[];
  durationMs: number;
  avgDb: number;
  voicedRatio: number;
  tooQuiet: boolean;
};

export type UseVocalAnalyzerApi = {
  listening: boolean;
  testing: boolean;
  testProgress: number;
  error: string | null;
  live: LiveTunerState;
  startListening: () => Promise<void>;
  stopListening: () => void;
  startTest: (durationMs: number) => Promise<VocalTestResult>;
  /** Callback ref — attach to the `<canvas>` used for the oscilloscope. */
  attachWaveformCanvas: (canvas: HTMLCanvasElement | null) => void;
};

function drawWaveform(canvas: HTMLCanvasElement | null, timeData: Float32Array) {
  if (!canvas) return;
  const g = canvas.getContext("2d");
  if (!g) return;
  const { width, height } = canvas;
  g.clearRect(0, 0, width, height);
  const gradient = g.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, "#7c3aed");
  gradient.addColorStop(0.5, "#c084fc");
  gradient.addColorStop(1, "#fbbf24");
  g.strokeStyle = gradient;
  g.lineWidth = 2.5;
  g.beginPath();

  // Draw a capped number of points regardless of buffer size — keeps
  // rendering cost constant and smooth even with a large FFT buffer.
  const maxPoints = 512;
  const n = timeData.length;
  const stride = Math.max(1, Math.floor(n / maxPoints));
  const pointCount = Math.floor(n / stride);
  for (let p = 0; p < pointCount; p += 1) {
    const i = p * stride;
    const x = (p / Math.max(1, pointCount - 1)) * width;
    const y = height / 2 - (timeData[i] ?? 0) * (height / 2) * 0.9;
    if (p === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
}

export function useVocalAnalyzer(): UseVocalAnalyzerApi {
  const [listening, setListening] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testProgress, setTestProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<LiveTunerState>(IDLE_LIVE_STATE);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const detectorRef = useRef<PitchDetectorFn | null>(null);
  const bufferRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const rafRef = useRef<number | null>(null);
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);

  const silentFramesRef = useRef(0);
  const rollingDbRef = useRef<number[]>([]);

  const testingRef = useRef(false);
  const testStartRef = useRef(0);
  const testDurationRef = useRef(0);
  const testFramesRef = useRef<PitchFrame[]>([]);
  const testResolveRef = useRef<((result: VocalTestResult) => void) | null>(null);
  const testRejectRef = useRef<((err: Error) => void) | null>(null);

  const attachWaveformCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    canvasElRef.current = canvas;
  }, []);

  const cleanup = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      void audioContextRef.current.close();
    }
    audioContextRef.current = null;
    analyserRef.current = null;
    detectorRef.current = null;
    bufferRef.current = null;
    silentFramesRef.current = 0;
    rollingDbRef.current = [];

    if (testingRef.current) {
      testRejectRef.current?.(new Error("Audio session stopped"));
    }
    testingRef.current = false;
    testFramesRef.current = [];
    testResolveRef.current = null;
    testRejectRef.current = null;

    setListening(false);
    setTesting(false);
    setTestProgress(0);
    setLive(IDLE_LIVE_STATE);
  }, []);

  // Guarantee mic + AudioContext are released on unmount — no lingering
  // mic indicator after leaving the tool.
  useEffect(() => () => cleanup(), [cleanup]);

  const tick = useCallback(() => {
    const analyser = analyserRef.current;
    const detector = detectorRef.current;
    if (!analyser || !detector) return;

    const buf = bufferRef.current ?? new Float32Array(analyser.fftSize);
    bufferRef.current = buf;
    analyser.getFloatTimeDomainData(buf);
    drawWaveform(canvasElRef.current, buf);

    const rms = computeRms(buf);
    const db = dbFromRms(rms);
    const hz = db > DETECT_SKIP_DB ? detector(buf) : null;
    const pitch = hz !== null ? analyzeFrequency(hz) : null;

    const rollingWindow = rollingDbRef.current;
    rollingWindow.push(db);
    if (rollingWindow.length > ROLLING_DB_WINDOW) rollingWindow.shift();
    const rollingAvgDb =
      rollingWindow.reduce((a, b) => a + b, 0) / rollingWindow.length;
    const tooQuiet = rollingWindow.length >= 30 && rollingAvgDb < NOISE_FLOOR_DB;

    if (pitch) {
      silentFramesRef.current = 0;
      setLive({
        frequencyHz: pitch.frequency,
        note: pitch.note,
        cents: pitch.cents,
        db,
        voiced: true,
        tooQuiet,
      });
    } else {
      silentFramesRef.current += 1;
      if (silentFramesRef.current >= SILENT_HOLD_FRAMES) {
        setLive({ ...IDLE_LIVE_STATE, db, tooQuiet });
      } else {
        setLive((prev) => ({ ...prev, db, voiced: false, tooQuiet }));
      }
    }

    if (testingRef.current) {
      const tMs = performance.now() - testStartRef.current;
      testFramesRef.current.push({
        tMs,
        frequencyHz: pitch ? pitch.frequency : null,
        db,
        cents: pitch ? pitch.cents : null,
        note: pitch ? pitch.note : null,
        midi: pitch ? pitch.midi : null,
        voiced: Boolean(pitch),
      });

      const duration = testDurationRef.current;
      if (tMs >= duration) {
        testingRef.current = false;
        setTesting(false);
        setTestProgress(100);

        const frames = testFramesRef.current;
        const voicedCount = frames.filter((f) => f.voiced).length;
        const avgDb =
          frames.length > 0
            ? frames.reduce((sum, f) => sum + f.db, 0) / frames.length
            : -100;
        const voicedRatio = frames.length > 0 ? voicedCount / frames.length : 0;
        const resultTooQuiet = avgDb < NOISE_FLOOR_DB || voicedRatio < MIN_VOICED_RATIO;

        testFramesRef.current = [];
        const resolve = testResolveRef.current;
        testResolveRef.current = null;
        testRejectRef.current = null;
        resolve?.({ frames, durationMs: duration, avgDb, voicedRatio, tooQuiet: resultTooQuiet });
      } else {
        setTestProgress(Math.min(100, (tMs / duration) * 100));
      }
    }

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  /** Acquires the mic + AudioContext if not already active. Throws on failure. */
  const ensureAudio = useCallback(async () => {
    if (streamRef.current && audioContextRef.current && analyserRef.current) {
      return;
    }
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("Микрофон недоступен в этом браузере.");
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioContext = new AudioCtx();
    if (audioContext.state === "suspended") await audioContext.resume();

    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    source.connect(analyser);

    streamRef.current = stream;
    audioContextRef.current = audioContext;
    analyserRef.current = analyser;
    detectorRef.current = createYinDetector(audioContext.sampleRate);
    bufferRef.current = new Float32Array(analyser.fftSize);
    silentFramesRef.current = 0;
    rollingDbRef.current = [];

    setListening(true);
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const startListening = useCallback(async () => {
    setError(null);
    try {
      await ensureAudio();
    } catch {
      setError("Не удалось получить доступ к микрофону. Разрешите его в настройках браузера / PWA.");
      cleanup();
    }
  }, [ensureAudio, cleanup]);

  const stopListening = useCallback(() => {
    cleanup();
  }, [cleanup]);

  const startTest = useCallback(
    (durationMs: number) => {
      return new Promise<VocalTestResult>((resolve, reject) => {
        setError(null);
        void (async () => {
          try {
            await ensureAudio();
            if (!analyserRef.current || !audioContextRef.current) {
              throw new Error("Audio pipeline not ready");
            }
            testFramesRef.current = [];
            testResolveRef.current = resolve;
            testRejectRef.current = reject;
            testStartRef.current = performance.now();
            testDurationRef.current = durationMs;
            testingRef.current = true;
            setTesting(true);
            setTestProgress(0);
          } catch (err) {
            setError("Не удалось запустить тест. Проверьте разрешение микрофона.");
            reject(err instanceof Error ? err : new Error("Failed to start test"));
          }
        })();
      });
    },
    [ensureAudio]
  );

  return {
    listening,
    testing,
    testProgress,
    error,
    live,
    startListening,
    stopListening,
    startTest,
    attachWaveformCanvas,
  };
}
