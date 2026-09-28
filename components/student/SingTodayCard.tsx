"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Button from "@/components/ui/Button";
import { logPracticeSeconds } from "@/lib/practice-log";
import {
  closeVocalStep,
  isExerciseRef,
  type RetentionBoard,
} from "@/lib/student-retention";

type Phase = "idle" | "running" | "finale";

const QUESTS = [
  { key: "cabinet" as const, label: "Зайти в кабинет" },
  { key: "phrase" as const, label: "Спеть фразу дня" },
  { key: "minute" as const, label: "Минута голоса" },
];

export default function SingTodayCard({
  board,
  onClosed,
}: {
  board: RetentionBoard | null;
  onClosed: () => Promise<void> | void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [marking, setMarking] = useState<"ok" | "again" | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [reduce, setReduce] = useState(false);
  const started = useRef(0);

  useEffect(() => {
    setReduce(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    if (phase !== "running") return;
    const id = window.setInterval(() => {
      setSeconds(Math.round((Date.now() - started.current) / 1000));
    }, 250);
    return () => window.clearInterval(id);
  }, [phase]);

  if (!board) return null;

  const review = board.reviews[0] ?? null;
  const step =
    !board.phrase.done
      ? {
          kind: "phrase" as const,
          ref: board.phrase.id,
          title: board.phrase.title,
          line: board.comeback
            ? `Короткий возврат. ${board.phrase.line}`
            : board.phrase.line,
          action: "Петь",
        }
      : review
        ? {
            kind: isExerciseRef(review.id) ? ("exercise" as const) : ("phrase" as const),
            ref: review.id,
            title: review.title,
            line: `Повтор: ${review.title}. Одна попытка, без оценки.`,
            action: "Повторить",
          }
        : {
            kind: "phrase" as const,
            ref: board.phrase.id,
            title: board.phrase.title,
            line: board.phrase.line,
            action: "Ещё круг",
          };

  const start = () => {
    setError("");
    setNote("");
    started.current = Date.now();
    setSeconds(0);
    setPhase("running");
  };

  const finish = () => {
    if (seconds < 5) return;
    setPhase("finale");
  };

  const close = async (mark: "ok" | "again") => {
    setMarking(mark);
    setError("");
    const logged = await closeVocalStep({
      kind: step.kind,
      ref: step.ref,
      title: step.title,
      mark,
      seconds,
    });
    if (seconds >= 1) {
      await logPracticeSeconds("exercise", Math.min(seconds, 60));
    }
    setMarking(null);
    if (!logged) {
      setError("Не удалось сохранить шаг. Нажмите ещё раз.");
      return;
    }
    setNote(mark === "ok" ? "Шаг закрыт. Котик это заметил." : "Вернём эту фразу чуть позже.");
    await onClosed();
  };

  return (
    <section className="rounded-3xl bg-studio-card p-5 ring-1 ring-studio-border">
      <p className="text-[11px] uppercase tracking-[0.18em] text-studio-muted">
        Сегодня
      </p>
      <h2 className="mt-1 font-display text-2xl font-semibold">{step.title}</h2>
      <p className="mt-2 text-sm text-studio-muted">{step.line}</p>

      {board.duo && (
        <p className="mt-3 text-sm text-studio-text">
          {board.duo.together
            ? `Дуэт вместе${board.duo.streak > 0 ? ` · ${board.duo.streak} дн.` : ""}`
            : board.duo.partnerDone
              ? "Партнёр уже закрыл день. Осталась ваша фраза."
              : "Закройте день оба — серия дуэта продолжится."}
        </p>
      )}

      <ul className="mt-4 space-y-2">
        {QUESTS.map((quest) => {
          const done = board.quests[quest.key];
          return (
            <li key={quest.key} className="flex items-center gap-2 text-sm">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ring-1 ${
                  done
                    ? "bg-emerald-500/20 text-emerald-300 ring-emerald-400/40"
                    : "text-studio-muted ring-studio-border"
                }`}
              >
                {done ? "✓" : ""}
              </span>
              <span className={done ? "text-studio-text" : "text-studio-muted"}>
                {quest.label}
              </span>
            </li>
          );
        })}
      </ul>

      {phase === "idle" && (
        <Button className="mt-5 w-full sm:w-auto" onClick={start}>
          {step.action}
        </Button>
      )}

      {phase === "running" && (
        <div className="mt-5">
          <p className="font-display text-3xl font-semibold tabular-nums">{seconds} сек</p>
          <p className="mt-1 text-xs text-studio-muted">
            {board.comeback
              ? "Короткой фразы достаточно."
              : "Хватит одной фразы. Можно дольше."}
          </p>
          <Button className="mt-4 w-full sm:w-auto" disabled={seconds < 5} onClick={finish}>
            Готово
          </Button>
        </div>
      )}

      {phase === "finale" && (
        <div className="mt-5">
          <AnimatePresence>
            {!reduce && (
              <motion.img
                src="/stickers/sticker-cat-sing.png"
                alt=""
                initial={{ y: 16, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.35 }}
                className="mx-auto h-24 w-24 bg-transparent object-contain"
              />
            )}
          </AnimatePresence>
          <p className="mt-2 text-center text-sm">
            {note || `${seconds} сек. Как эта фраза?`}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              className="w-full sm:w-auto"
              disabled={Boolean(marking)}
              onClick={() => void close("ok")}
            >
              {marking === "ok" ? "Сохраняем…" : "Получилось"}
            </Button>
            <Button
              variant="secondary"
              className="w-full sm:w-auto"
              disabled={Boolean(marking)}
              onClick={() => void close("again")}
            >
              {marking === "again" ? "Сохраняем…" : "Ещё раз"}
            </Button>
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
    </section>
  );
}
