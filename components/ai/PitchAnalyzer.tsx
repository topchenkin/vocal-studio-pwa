"use client";

import { useMemo, useState } from "react";
import {
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
import VocalReportCard from "@/components/ai/VocalReportCard";
import { useAuth } from "@/context/AuthContext";
import {
  describeNote,
  frequencyFromMidi,
  midiFromNoteLabel,
  pickPracticeNote,
  PRACTICE_NOTES,
  STUDENT_IN_TUNE_CENTS,
} from "@/lib/pitch";
import {
  buildVocalReport,
  targetNoteAtTime,
  type VocalReport,
  type VocalTestMode,
} from "@/lib/vocal-metrics";
import { toVocalReportPayload } from "@/lib/vocal-report-payload";
import {
  saveVocalTestResult,
  sendVocalReportToChat,
} from "@/lib/vocal-test-results";
import { useVocalAnalyzer } from "@/hooks/useVocalAnalyzer";

type TuneZone = "flat" | "in-tune" | "sharp" | "silent";

const TEST_MS = 10_000;
const IN_TUNE_CENTS = STUDENT_IN_TUNE_CENTS;
const SCALE_STEPS = ["C4", "E4", "G4"] as const;

export default function PitchAnalyzer({ locked = false }: { locked?: boolean }) {
  const { user, profile, isAdmin } = useAuth();
  const analyzer = useVocalAnalyzer();

  const [testMode, setTestMode] = useState<VocalTestMode>("note");
  const [targetNote, setTargetNote] = useState("G4");
  const [report, setReport] = useState<VocalReport | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [sendingReport, setSendingReport] = useState(false);
  const [sentOk, setSentOk] = useState(false);
  const [sendNote, setSendNote] = useState("");

  const { listening, testing, testProgress, error, live } = analyzer;

  const zone: TuneZone = !live.voiced
    ? "silent"
    : (live.cents ?? 0) < -IN_TUNE_CENTS
      ? "flat"
      : (live.cents ?? 0) > IN_TUNE_CENTS
        ? "sharp"
        : "in-tune";
  const note = live.note ?? "—";
  const hz = live.frequencyHz ? Math.round(live.frequencyHz * 10) / 10 : 0;
  const cents = live.cents ?? 0;

  // Which note the singer should be hitting *right now* during a test —
  // derived purely from progress, no extra timers needed.
  const liveTargetNote = useMemo(() => {
    if (!testing) return testMode === "scale" ? "C4" : targetNote;
    const tMs = (testProgress / 100) * TEST_MS;
    return targetNoteAtTime(testMode, tMs, TEST_MS, targetNote);
  }, [testing, testProgress, testMode, targetNote]);

  const startProfessionalTest = async () => {
    setSendNote("");
    setSentOk(false);
    setReport(null);
    const modeAtStart = testMode;
    const targetAtStart = targetNote;
    try {
      const result = await analyzer.startTest(TEST_MS);
      const built = buildVocalReport(
        result.frames,
        result.tooQuiet,
        modeAtStart,
        targetAtStart,
        TEST_MS / 1000
      );
      setReport(built);
      setReportOpen(true);
      if (!built.tooQuiet && user && !isAdmin) {
        void saveResult(built);
      }
    } catch {
      // analyzer surfaces a user-facing error via `analyzer.error`
    }
  };

  const saveResult = async (built: VocalReport) => {
    if (!user || isAdmin || built.tooQuiet) return;
    try {
      await saveVocalTestResult(user.id, built);
      window.dispatchEvent(new Event("uvs-vocal-test-saved"));
    } catch (err) {
      setSendNote(
        err instanceof Error
          ? err.message
          : "Не удалось сохранить результат в кабинете"
      );
    }
  };

  const sendToTeacher = async (built: VocalReport) => {
    if (!user || isAdmin || built.tooQuiet || sendingReport) return;
    setSendingReport(true);
    if (!sendNote.includes("Таблиц")) setSendNote("");
    try {
      await sendVocalReportToChat({
        studentId: user.id,
        senderId: user.id,
        senderName: profile?.full_name || "Ученик",
        report: built,
      });
      setSentOk(true);
      setSendNote("Отчёт отправлен преподавателю.");
    } catch (err) {
      setSentOk(false);
      setSendNote(
        err instanceof Error ? err.message : "Не удалось отправить отчёт в чат"
      );
    } finally {
      setSendingReport(false);
    }
  };

  const needlePercent = useMemo(() => {
    if (zone === "silent") return 50;
    return 50 + Math.max(-50, Math.min(50, cents));
  }, [cents, zone]);

  const liveTargetHz = frequencyFromMidi(midiFromNoteLabel(targetNote));

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
            Нейроанализатор нот
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
          <h2 className="font-display text-2xl font-semibold">
            Нейроанализатор нот
          </h2>
        </div>
      </div>

      <div className="relative mt-5 overflow-hidden rounded-2xl bg-studio-bg p-3 ring-1 ring-studio-border">
        <canvas
          ref={analyzer.attachWaveformCanvas}
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
        {listening && (
          <div className="pointer-events-none absolute inset-x-0 bottom-2 text-center">
            <p className="font-display text-3xl font-semibold leading-none drop-shadow">
              {note}
            </p>
            <p className="mt-1 text-[11px] text-studio-muted">
              {hz > 0 ? `${hz} Hz` : "Спойте — нота появится здесь"}
            </p>
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
          {listening && live.tooQuiet && (
            <p className="mt-2 text-xs text-amber-300/80">
              Слишком тихо — пойте увереннее для точного распознавания
            </p>
          )}
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
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        {!listening ? (
          <Button fullWidth size="lg" onClick={() => void analyzer.startListening()}>
            <Mic className="h-5 w-5" />
            Включить микрофон
          </Button>
        ) : (
          <Button
            fullWidth
            size="lg"
            variant="danger"
            onClick={analyzer.stopListening}
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
              10 секунд — и вы увидите, насколько чисто держите ноту или гамму.
              Это не «просто попеть»: тест ставит оценку как на прослушивании
              и показывает, где голос уходит. Хотите удивить себя — нажмите
              старт.
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
        {report && report.tooQuiet && (
          <div className="space-y-4 text-center">
            <div className="rounded-2xl bg-amber-500/10 p-6 ring-1 ring-amber-400/30">
              <p className="font-display text-xl font-semibold text-amber-100">
                Звук не распознан
              </p>
              <p className="mt-2 text-sm text-studio-muted">
                Пойте громче и увереннее, поднесите микрофон ближе — сигнал
                оказался слишком тихим для честной оценки.
              </p>
            </div>
            <Button fullWidth size="lg" onClick={() => setReportOpen(false)}>
              Понятно, повторю тест
            </Button>
          </div>
        )}

        {report && !report.tooQuiet && (
          <div className="space-y-5">
            <VocalReportCard
              payload={toVocalReportPayload(report)}
              catLevel={profile?.cat_level}
            />
            {!isAdmin && (
              <>
                {sentOk ? (
                  <p className="text-center text-sm text-emerald-400">
                    {sendNote || "Отчёт отправлен преподавателю."}
                  </p>
                ) : (
                  <Button
                    fullWidth
                    size="lg"
                    disabled={sendingReport}
                    onClick={() => void sendToTeacher(report)}
                  >
                    <Send className="h-4 w-4" />
                    {sendingReport
                      ? "Отправляем…"
                      : sendNote.includes("чат") || sendNote.includes("Не удалось")
                        ? "Повторить отправку"
                        : "Отправить преподавателю"}
                  </Button>
                )}
                {!sentOk && sendNote && (
                  <p className="text-center text-sm text-red-400">{sendNote}</p>
                )}
              </>
            )}
          </div>
        )}
      </Modal>
    </section>
  );
}
