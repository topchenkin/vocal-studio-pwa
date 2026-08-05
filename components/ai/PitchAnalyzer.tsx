"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Cat,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Lock,
  Mic,
  Send,
  Shuffle,
  Square,
  Target,
  Waves,
} from "lucide-react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { getChatSessionToken } from "@/lib/chat-media";
import {
  describeNote,
  detectPitchHz,
  frequencyFromMidi,
  hzToleranceForMidi,
  midiFromNoteLabel,
  pickPracticeNote,
  PRACTICE_NOTES,
  stabilizeLivePitch,
  STUDENT_IN_TUNE_CENTS,
} from "@/lib/pitch";
import {
  buildVocalReport,
  formatReportChatMessage,
  mentorFeedback,
  samplePitchFrame,
  targetNoteAtTime,
  TEST_IN_TUNE_CENTS,
  type VocalReport,
  type VocalSample,
  type VocalTestMode,
} from "@/lib/vocal-metrics";

type TuneZone = "flat" | "in-tune" | "sharp" | "silent";

const TEST_MS = 10_000;
const SAMPLE_MS = 100;
const IN_TUNE_CENTS = STUDENT_IN_TUNE_CENTS;
const SCALE_STEPS = ["C4", "E4", "G4"] as const;

export default function PitchAnalyzer({ locked = false }: { locked?: boolean }) {
  const { user, profile } = useAuth();
  const [listening, setListening] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("—");
  const [hz, setHz] = useState(0);
  const [cents, setCents] = useState(0);
  const [zone, setZone] = useState<TuneZone>("silent");
  const [testMode, setTestMode] = useState<VocalTestMode>("note");
  const [targetNote, setTargetNote] = useState("G4");
  const [liveTargetNote, setLiveTargetNote] = useState("G4");
  const [testProgress, setTestProgress] = useState(0);
  const [report, setReport] = useState<VocalReport | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [sendingReport, setSendingReport] = useState(false);
  const [sendNote, setSendNote] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const sampleTimerRef = useRef<number | null>(null);
  const testTimerRef = useRef<number | null>(null);
  const progressTimerRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const samplesRef = useRef<VocalSample[]>([]);
  const testStartRef = useRef(0);
  const testModeRef = useRef(testMode);
  const targetNoteRef = useRef(targetNote);
  const smoothedHzRef = useRef<number | null>(null);
  const heldMidiRef = useRef<number | null>(null);
  const missFramesRef = useRef(0);

  useEffect(() => {
    testModeRef.current = testMode;
  }, [testMode]);
  useEffect(() => {
    targetNoteRef.current = targetNote;
  }, [targetNote]);

  const stopMic = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (sampleTimerRef.current) window.clearInterval(sampleTimerRef.current);
    if (testTimerRef.current) window.clearTimeout(testTimerRef.current);
    if (progressTimerRef.current) window.clearInterval(progressTimerRef.current);
    sampleTimerRef.current = null;
    testTimerRef.current = null;
    progressTimerRef.current = null;
    if (recorderRef.current?.state === "recording") {
      try {
        recorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    analyserRef.current = null;
    setListening(false);
    setTesting(false);
    setZone("silent");
    setNote("—");
    setHz(0);
    setTestProgress(0);
    smoothedHzRef.current = null;
    heldMidiRef.current = null;
    missFramesRef.current = 0;
  }, []);

  useEffect(() => () => stopMic(), [stopMic]);

  const drawWave = (timeData: Uint8Array) => {
    const canvas = canvasRef.current;
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
    for (let i = 0; i < timeData.length; i += 1) {
      const x = (i / (timeData.length - 1)) * width;
      const y = ((timeData[i] ?? 128) / 255) * height;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  };

  const tick = useCallback(() => {
    const analyser = analyserRef.current;
    const ctx = audioContextRef.current;
    if (!analyser || !ctx) return;

    const timeData = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(timeData);
    drawWave(timeData);

    const floatBuf = new Float32Array(analyser.fftSize);
    if (typeof analyser.getFloatTimeDomainData === "function") {
      analyser.getFloatTimeDomainData(floatBuf);
    } else {
      for (let i = 0; i < timeData.length; i += 1) {
        floatBuf[i] = ((timeData[i] ?? 128) - 128) / 128;
      }
    }

    const frequency = detectPitchHz(floatBuf, ctx.sampleRate);
    const stable =
      frequency > 0
        ? stabilizeLivePitch(
            frequency,
            smoothedHzRef.current,
            heldMidiRef.current
          )
        : null;

    if (stable) {
      missFramesRef.current = 0;
      smoothedHzRef.current = stable.smoothedHz;
      heldMidiRef.current = stable.heldMidi;
      const pitch = stable.pitch;
      setNote(pitch.note);
      setHz(Math.round(pitch.frequency * 10) / 10);
      setCents(pitch.cents);
      if (pitch.cents < -IN_TUNE_CENTS) setZone("flat");
      else if (pitch.cents > IN_TUNE_CENTS) setZone("sharp");
      else setZone("in-tune");
    } else {
      missFramesRef.current += 1;
      // Drop lock after a few quiet frames — avoid sticky wrong notes.
      if (missFramesRef.current >= 4) {
        smoothedHzRef.current = null;
        heldMidiRef.current = null;
        setNote("—");
        setHz(0);
        setCents(0);
        setZone("silent");
      }
    }

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const ensureMic = async () => {
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
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const audioContext = new AudioCtx();
    if (audioContext.state === "suspended") await audioContext.resume();

    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.75;
    source.connect(analyser);

    streamRef.current = stream;
    audioContextRef.current = audioContext;
    analyserRef.current = analyser;
    setListening(true);
    rafRef.current = requestAnimationFrame(tick);
  };

  const startMic = async () => {
    setError("");
    try {
      await ensureMic();
    } catch {
      setError(
        "Не удалось получить доступ к микрофону. Разрешите его в настройках браузера / PWA."
      );
      stopMic();
    }
  };

  const finishTest = useCallback(() => {
    if (sampleTimerRef.current) window.clearInterval(sampleTimerRef.current);
    if (progressTimerRef.current) window.clearInterval(progressTimerRef.current);
    sampleTimerRef.current = null;
    progressTimerRef.current = null;
    if (recorderRef.current?.state === "recording") {
      try {
        recorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    recorderRef.current = null;
    setTesting(false);
    setTestProgress(100);

    const label =
      testModeRef.current === "scale"
        ? "C4–E4–G4"
        : targetNoteRef.current;
    const built = buildVocalReport(
      samplesRef.current,
      testModeRef.current,
      label,
      TEST_MS / 1000
    );
    setReport(built);
    setReportOpen(true);
    setSendNote("");
  }, []);

  const startProfessionalTest = async () => {
    setError("");
    setSendNote("");
    setReport(null);
    samplesRef.current = [];
    setTestProgress(0);

    try {
      await ensureMic();
      const stream = streamRef.current;
      const analyser = analyserRef.current;
      const ctx = audioContextRef.current;
      if (!stream || !analyser || !ctx) {
        throw new Error("Audio pipeline not ready");
      }

      const mime = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorderRef.current = recorder;
      recorder.start();

      testStartRef.current = performance.now();
      setLiveTargetNote(
        testModeRef.current === "note" ? targetNoteRef.current : "C4"
      );
      setTesting(true);

      sampleTimerRef.current = window.setInterval(() => {
        const tMs = performance.now() - testStartRef.current;
        const target = targetNoteAtTime(
          testModeRef.current,
          tMs,
          TEST_MS,
          targetNoteRef.current
        );
        setLiveTargetNote(target);
        const timeData = new Float32Array(analyser.fftSize);
        // getFloatTimeDomainData is widely supported; fallback to byte convert
        if (analyser.getFloatTimeDomainData) {
          analyser.getFloatTimeDomainData(timeData);
        } else {
          const bytes = new Uint8Array(analyser.fftSize);
          analyser.getByteTimeDomainData(bytes);
          for (let i = 0; i < bytes.length; i += 1) {
            timeData[i] = ((bytes[i] ?? 128) - 128) / 128;
          }
        }
        samplesRef.current.push(
          samplePitchFrame(
            timeData,
            ctx.sampleRate,
            tMs,
            target,
            samplesRef.current.at(-1)?.frequencyHz ?? null
          )
        );
      }, SAMPLE_MS);

      progressTimerRef.current = window.setInterval(() => {
        const elapsed = performance.now() - testStartRef.current;
        setTestProgress(Math.min(100, (elapsed / TEST_MS) * 100));
      }, 100);

      testTimerRef.current = window.setTimeout(finishTest, TEST_MS);
    } catch {
      setError(
        "Не удалось запустить тест. Проверьте разрешение микрофона."
      );
      setTesting(false);
    }
  };

  useEffect(() => {
    if (!reportOpen || !report || !chartRef.current) return;
    const canvas = chartRef.current;
    const g = canvas.getContext("2d");
    if (!g) return;
    const { width, height } = canvas;
    g.clearRect(0, 0, width, height);

    // grid
    g.strokeStyle = "rgba(255,255,255,0.08)";
    g.lineWidth = 1;
    for (const yCents of [-50, -25, 0, 25, 50]) {
      const y = height / 2 - (yCents / 60) * (height / 2);
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(width, y);
      g.stroke();
    }

    // in-tune band (pro-test window)
    const yTop = height / 2 - (TEST_IN_TUNE_CENTS / 60) * (height / 2);
    const yBot = height / 2 + (TEST_IN_TUNE_CENTS / 60) * (height / 2);
    g.fillStyle = "rgba(52, 211, 153, 0.12)";
    g.fillRect(0, yTop, width, yBot - yTop);

    const voiced = report.samples.filter((s) => s.centsFolded !== null);
    if (voiced.length === 0) return;

    g.strokeStyle = "#c084fc";
    g.lineWidth = 2;
    g.beginPath();
    voiced.forEach((sample, index) => {
      const x = (index / Math.max(1, voiced.length - 1)) * width;
      const centsVal = Math.max(-60, Math.min(60, sample.centsFolded ?? 0));
      const y = height / 2 - (centsVal / 60) * (height / 2);
      if (index === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    });
    g.stroke();
  }, [report, reportOpen]);

  const sendReportToTeacher = async () => {
    if (!report || !user || sendingReport) return;
    setSendingReport(true);
    setSendNote("");
    try {
      const token = await getChatSessionToken();
      if (!token) {
        setSendNote("Сессия истекла. Войдите снова.");
        return;
      }
      const message = `${formatReportChatMessage(report)}\n\n${mentorFeedback(
        report.overallScore,
        profile?.cat_level
      )}`.slice(0, 2000);
      const response = await fetch("/api/chat/vocal-report", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message,
          overallScore: report.overallScore,
        }),
      });
      const raw = await response.text();
      let payload: { error?: string } = {};
      try {
        payload = JSON.parse(raw) as { error?: string };
      } catch {
        setSendNote(
          `Сервер вернул ошибку (${response.status}). Попробуйте ещё раз.`
        );
        return;
      }
      if (!response.ok) {
        setSendNote(payload.error ?? `Не удалось отправить отчёт (${response.status})`);
        return;
      }
      setSendNote("Отчёт отправлен преподавателю в чат.");
    } catch {
      setSendNote("Не удалось отправить отчёт. Проверьте интернет и войдите снова.");
    } finally {
      setSendingReport(false);
    }
  };

  const needlePercent = useMemo(() => {
    if (zone === "silent") return 50;
    return 50 + Math.max(-50, Math.min(50, cents));
  }, [cents, zone]);

  const liveTargetHz = frequencyFromMidi(midiFromNoteLabel(targetNote));
  const liveHzTolerance = Math.round(
    hzToleranceForMidi(midiFromNoteLabel(targetNote), IN_TUNE_CENTS)
  );
  const mentor = report
    ? mentorFeedback(report.overallScore, profile?.cat_level)
    : "";

  const cycleTargetNote = (dir: -1 | 1) => {
    const list = PRACTICE_NOTES as readonly string[];
    const idx = list.indexOf(targetNote);
    const base = idx >= 0 ? idx : 0;
    const next = list[(base + dir + list.length) % list.length] ?? "G4";
    setTargetNote(next);
  };

  if (locked) {
    return (
      <section className="relative overflow-hidden rounded-3xl bg-studio-surface p-5 ring-1 ring-studio-border sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-studio-bg/40 backdrop-blur-[2px]" />
        <div className="relative z-10 flex flex-col items-center py-10 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15 ring-1 ring-amber-400/30">
            <Lock className="h-7 w-7 text-amber-300" />
          </div>
          <h2 className="mt-4 font-display text-2xl font-semibold">
            ИИ-тюнер нот
          </h2>
          <p className="mt-2 max-w-sm text-sm text-studio-muted">
            Инструмент доступен по тарифу, заданному администратором.
          </p>
          <Link href="/dashboard/student" className="mt-6 w-full max-w-xs">
            <Button fullWidth size="lg">
              К тарифам
            </Button>
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-3xl bg-studio-surface p-4 ring-1 ring-studio-border sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-studio-accent/10">
          <Mic className="h-5 w-5 text-studio-accent" />
        </div>
        <div>
          <h2 className="font-display text-2xl font-semibold">ИИ-тюнер нот</h2>
          <p className="mt-1 text-sm text-studio-muted">
            Живой тюнер для учеников: допуск ~±{IN_TUNE_CENTS}¢
            (около ±10–15 Гц в среднем регистре), нота не прыгает от каждого
            микроколебания.
          </p>
        </div>
      </div>

      <div className="relative mt-5 overflow-hidden rounded-2xl bg-studio-bg p-3 ring-1 ring-studio-border">
        <canvas
          ref={canvasRef}
          width={640}
          height={140}
          className="h-28 w-full sm:h-32"
          aria-label="Визуализация аудио-волны"
        />
        {!listening && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <Waves className="h-10 w-10 text-studio-border" />
          </div>
        )}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_1.2fr]">
        <div className="rounded-2xl bg-studio-card p-4 text-center ring-1 ring-studio-border">
          <p className="text-xs uppercase tracking-wide text-studio-muted">
            Текущая нота
          </p>
          <p className="mt-1 font-display text-5xl font-semibold">{note}</p>
          <p className="mt-1 text-sm text-studio-muted">
            {hz > 0 ? `${hz} Hz · ${describeNote(note)}` : "Спойте в микрофон"}
          </p>
          <p
            className={`mt-3 text-sm font-semibold ${
              zone === "in-tune"
                ? "text-emerald-400"
                : zone === "sharp"
                  ? "text-amber-300"
                  : zone === "flat"
                    ? "text-sky-300"
                    : "text-studio-muted"
            }`}
          >
            {zone === "in-tune" && "В ноту"}
            {zone === "sharp" && `Выше (Sharp) · +${cents} ¢`}
            {zone === "flat" && `Ниже (Flat) · ${cents} ¢`}
            {zone === "silent" && "Тишина"}
          </p>
        </div>

        <div className="rounded-2xl bg-studio-card p-4 ring-1 ring-studio-border">
          <div className="mb-2 flex justify-between text-[11px] font-medium text-studio-muted">
            <span>Flat</span>
            <span className="text-emerald-400">In Tune</span>
            <span>Sharp</span>
          </div>
          <div className="relative h-3 rounded-full bg-gradient-to-r from-sky-500/40 via-emerald-500/50 to-amber-400/40">
            <div
              className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow ring-2 ring-studio-accent transition-all duration-100"
              style={{ left: `${needlePercent}%` }}
            />
          </div>
          <p className="mt-3 text-center text-xs text-studio-muted">
            Зелёная зона для учеников: ±{IN_TUNE_CENTS}¢ ≈ ±{liveHzTolerance} Гц
            на {targetNote}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        {!listening ? (
          <Button fullWidth size="lg" onClick={() => void startMic()}>
            <Mic className="h-5 w-5" />
            Включить микрофон
          </Button>
        ) : (
          <Button
            fullWidth
            size="lg"
            variant="danger"
            onClick={stopMic}
            disabled={testing}
          >
            <Square className="h-4 w-4 fill-current" />
            Остановить
          </Button>
        )}
      </div>

      <div className="mt-6 rounded-2xl bg-studio-bg/70 p-4 ring-1 ring-studio-border">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
            <ClipboardList className="h-5 w-5 text-amber-300" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-medium">Профессиональный вокальный тест</h3>
            <p className="mt-1 text-sm text-studio-muted">
              10 секунд: целевая нота или гамма. Допуск теста ±{TEST_IN_TUNE_CENTS}¢
              (чуть строже живого тюнера) — чистый проход реально даёт 90+.
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={testing}
            onClick={() => setTestMode("note")}
            className={`rounded-xl px-3 py-3 text-sm font-medium ring-1 transition ${
              testMode === "note"
                ? "bg-studio-accent/15 text-studio-text ring-studio-accent/40"
                : "bg-studio-card text-studio-muted ring-studio-border"
            }`}
          >
            Одна нота
          </button>
          <button
            type="button"
            disabled={testing}
            onClick={() => setTestMode("scale")}
            className={`rounded-xl px-3 py-3 text-sm font-medium ring-1 transition ${
              testMode === "scale"
                ? "bg-studio-accent/15 text-studio-text ring-studio-accent/40"
                : "bg-studio-card text-studio-muted ring-studio-border"
            }`}
          >
            Гамма
          </button>
        </div>

        {testMode === "note" ? (
          <div className="mt-4 rounded-xl bg-studio-card p-4 ring-1 ring-studio-border">
            <p className="text-center text-xs uppercase tracking-wide text-studio-muted">
              Целевая нота
            </p>
            <div className="mt-2 flex items-center justify-center gap-3">
              <button
                type="button"
                disabled={testing}
                onClick={() => cycleTargetNote(-1)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-studio-bg ring-1 ring-studio-border transition hover:ring-studio-accent/50 disabled:opacity-40"
                aria-label="Предыдущая нота"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <div className="min-w-[7rem] text-center">
                <p className="font-display text-4xl font-semibold">{targetNote}</p>
                <p className="mt-1 text-xs text-studio-muted">
                  {describeNote(targetNote)} · ~{Math.round(liveTargetHz)} Hz
                </p>
              </div>
              <button
                type="button"
                disabled={testing}
                onClick={() => cycleTargetNote(1)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-studio-bg ring-1 ring-studio-border transition hover:ring-studio-accent/50 disabled:opacity-40"
                aria-label="Следующая нота"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {PRACTICE_NOTES.map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={testing}
                  onClick={() => setTargetNote(n)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium ring-1 transition disabled:opacity-40 ${
                    targetNote === n
                      ? "bg-studio-accent/20 text-studio-accent-light ring-studio-accent/40"
                      : "bg-studio-bg text-studio-muted ring-studio-border hover:text-studio-text"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={testing}
              onClick={() => setTargetNote(pickPracticeNote(targetNote))}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-2 text-sm text-studio-muted ring-1 ring-studio-border transition hover:text-studio-text disabled:opacity-40"
            >
              <Shuffle className="h-4 w-4" />
              Случайная нота
            </button>
          </div>
        ) : (
          <div className="mt-4 rounded-xl bg-studio-card p-4 ring-1 ring-studio-border">
            <p className="text-center text-xs uppercase tracking-wide text-studio-muted">
              Гамма · по ~3 секунды на ступень
            </p>
            <div className="mt-3 flex items-center justify-center gap-2 sm:gap-3">
              {SCALE_STEPS.map((step, index) => {
                const active =
                  testing && liveTargetNote === step
                    ? true
                    : !testing && index === 0;
                return (
                  <div key={step} className="flex items-center gap-2 sm:gap-3">
                    {index > 0 && (
                      <span className="text-studio-muted" aria-hidden>
                        →
                      </span>
                    )}
                    <div
                      className={`min-w-[3.5rem] rounded-xl px-3 py-2 text-center ring-1 transition ${
                        active
                          ? "bg-studio-accent/20 ring-studio-accent/50"
                          : "bg-studio-bg ring-studio-border"
                      }`}
                    >
                      <p className="font-display text-2xl font-semibold">{step}</p>
                      <p className="text-[10px] text-studio-muted">
                        {describeNote(step)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-center text-xs text-studio-muted">
              Спойте по очереди: до → ми → соль
            </p>
          </div>
        )}

        {testing && (
          <div className="mt-4 space-y-3">
            <div className="rounded-xl bg-amber-500/10 px-4 py-3 text-center ring-1 ring-amber-400/30">
              <p className="text-xs uppercase tracking-wide text-amber-200/80">
                Сейчас спойте
              </p>
              <p className="mt-1 font-display text-3xl font-semibold text-amber-100">
                {liveTargetNote}
              </p>
              <p className="mt-0.5 text-xs text-studio-muted">
                {describeNote(liveTargetNote)}
              </p>
            </div>
            <div>
              <div className="mb-1 flex justify-between text-xs text-studio-muted">
                <span>Идёт запись…</span>
                <span>{Math.round(testProgress)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-studio-card">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-studio-accent to-amber-400 transition-all"
                  style={{ width: `${testProgress}%` }}
                />
              </div>
            </div>
          </div>
        )}

        <Button
          className="mt-4"
          fullWidth
          variant="secondary"
          disabled={testing}
          onClick={() => void startProfessionalTest()}
        >
          <Target className="h-4 w-4" />
          {testing
            ? "Запись 10 секунд…"
            : testMode === "note"
              ? `Начать тест · нота ${targetNote}`
              : "Начать тест · гамма C–E–G"}
        </Button>
      </div>

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

      <Modal
        open={reportOpen && Boolean(report)}
        onClose={() => setReportOpen(false)}
        title="Отчёт вокалиста"
        size="lg"
      >
        {report && (
          <div className="space-y-5">
            <div className="rounded-2xl bg-gradient-to-br from-studio-accent/20 via-studio-surface to-amber-500/10 p-5 text-center ring-1 ring-studio-border">
              <p className="text-xs uppercase tracking-wide text-studio-muted">
                Overall Score
              </p>
              <p className="mt-1 font-display text-5xl font-semibold">
                {report.overallScore}
                <span className="text-2xl text-studio-muted"> / 100</span>
              </p>
              <p className="mt-2 text-sm text-studio-muted">
                {report.mode === "scale"
                  ? "Гамма C4–E4–G4"
                  : `Нота ${report.targetLabel}`}{" "}
                · {report.durationSec}с · {report.samples.length} замеров
              </p>
            </div>

            <MetricBar label="Точность нот" value={report.pitchAccuracy} />
            <MetricBar label="Стабильность тона" value={report.toneStability} />
            <MetricBar label="Удержание дыхания" value={report.breathControl} />

            <div className="rounded-2xl bg-studio-bg/70 p-4 ring-1 ring-studio-border">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <Cat className="h-4 w-4 text-amber-300" />
                Отзыв Котика-наставника
              </div>
              <p className="text-sm leading-relaxed text-studio-muted">
                {mentor}
              </p>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-studio-muted">
                График девиации центов
              </p>
              <div className="overflow-hidden rounded-xl bg-studio-bg ring-1 ring-studio-border">
                <canvas
                  ref={chartRef}
                  width={560}
                  height={160}
                  className="h-36 w-full"
                />
              </div>
              <p className="mt-1 text-[11px] text-studio-muted">
                Зелёная полоса — зона теста ±{TEST_IN_TUNE_CENTS}¢ (~±8–11 Гц)
              </p>
            </div>

            <Button
              fullWidth
              size="lg"
              disabled={sendingReport}
              onClick={() => void sendReportToTeacher()}
            >
              <Send className="h-4 w-4" />
              {sendingReport
                ? "Отправляем…"
                : "Отправить отчет в чат преподавателю"}
            </Button>
            {sendNote && (
              <p
                className={`text-center text-sm ${
                  sendNote.includes("отправлен")
                    ? "text-emerald-400"
                    : "text-red-400"
                }`}
              >
                {sendNote}
              </p>
            )}
          </div>
        )}
      </Modal>
    </section>
  );
}

function MetricBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-semibold text-studio-accent-light">{value}%</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-studio-bg">
        <div
          className="h-full rounded-full bg-gradient-to-r from-studio-accent to-violet-400 transition-all"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}
