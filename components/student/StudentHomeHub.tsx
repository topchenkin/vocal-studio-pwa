"use client";

import Link from "next/link";
import { CalendarDays, ChevronRight, Flame, MessageCircle } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { CAT_LEVEL_IMAGES, CAT_LEVEL_LABELS } from "@/lib/cat-levels";
import {
  catNextLabel,
  catProgressPercent,
  catProgressPhrase,
} from "@/lib/cat-progress";
import { practiceMinutes, type CabinetProgress } from "@/lib/student-progress";
import { formatStudioDate } from "@/lib/studio-tz";
import CatLevelText from "@/components/ui/CatLevelText";
import type { CatLevel } from "@/types";
import type { RetentionBoard } from "@/lib/student-retention";

function clampPercent(current: number, target: number) {
  if (target <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round((current / target) * 100)));
}

function encouragingLine(progress: CabinetProgress) {
  const lessonDone = progress.lessons_week >= progress.targets.lessons;
  const practiceDone =
    practiceMinutes(progress.practice_sec_week) >= progress.targets.practice_min;
  const exercisesDone = progress.exercises_week >= progress.targets.exercises;
  const doneCount = [lessonDone, practiceDone, exercisesDone].filter(Boolean).length;
  if (doneCount === 3) {
    return "Неделя собрана. Котик доволен — можно просто держать форму.";
  }
  if (progress.streak >= 3) {
    return "Серия живая. Ещё один заход сегодня — и привычка крепче.";
  }
  if (practiceDone) {
    return "Голос уже поработал. Завтра можно короче — главное не пропадать.";
  }
  if (progress.checked_in_today) {
    return "Вы уже здесь. Короткой практики достаточно, чтобы день засчитался.";
  }
  return "Маленький шаг сегодня уже считается. Котик это заметит.";
}

function Ring({
  value,
  target,
  label,
  text,
}: {
  value: number;
  target: number;
  label: string;
  text: string;
}) {
  const percent = clampPercent(value, target);
  const done = percent >= 100;
  const radius = 26;
  const length = 2 * Math.PI * radius;
  return (
    <div
      className="flex flex-col items-center gap-2"
      role="img"
      aria-label={`${label}: ${text}`}
    >
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          strokeWidth="6"
          className="stroke-studio-border"
        />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={length}
          strokeDashoffset={length * (1 - percent / 100)}
          className={done ? "stroke-studio-gold" : "stroke-studio-accent"}
        />
        <text
          x="32"
          y="32"
          textAnchor="middle"
          dominantBaseline="central"
          transform="rotate(90 32 32)"
          className="fill-studio-text text-[15px] font-semibold"
        >
          {text}
        </text>
      </svg>
      <span className="text-xs text-studio-muted">{label}</span>
    </div>
  );
}

export default function StudentHomeHub({
  progress,
  board,
}: {
  progress: CabinetProgress | null;
  board?: RetentionBoard | null;
}) {
  const { profile } = useAuth();
  const reduce = useReducedMotion();
  const level = (profile?.cat_level ?? "beginner") as CatLevel;
  const xp = Number(profile?.cat_xp) || 0;
  const examReady = Boolean(profile?.cat_exam_ready);
  const percent = examReady ? 100 : catProgressPercent(level, xp);
  const title = CAT_LEVEL_LABELS[level] ?? CAT_LEVEL_LABELS.beginner;
  const streak = progress?.streak ?? (Number(profile?.cat_streak_days) || 0);
  const practiceMin = practiceMinutes(progress?.practice_sec_week ?? 0);
  const targets = progress?.targets;
  const balance = Number(profile?.lessons_balance) || 0;
  const debt = Number(profile?.debt_amount) || 0;
  const next = progress?.next_lesson ?? null;

  const streakText = board?.comeback
    ? "Мягкий возврат"
    : streak > 0
      ? `Серия ${streak} дн.`
      : "Серия с сегодня";

  const lessonsLine = debt > 0
    ? `Долг ${debt.toLocaleString("ru-RU")} ₽`
    : profile?.lesson_pay_type === "abonement"
      ? `Осталось уроков: ${balance}`
      : "Разовая оплата";

  return (
    <div className="space-y-4">
      <Link
        href="/dashboard/student/progress"
        className="block rounded-3xl bg-studio-card p-4 ring-1 ring-studio-border transition hover:ring-studio-accent/40"
      >
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={CAT_LEVEL_IMAGES[level]}
            alt=""
            className="h-20 w-20 shrink-0 bg-transparent object-contain"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-studio-muted">Уровень котика</p>
              <ChevronRight className="h-4 w-4 shrink-0 text-studio-muted" />
            </div>
            <CatLevelText
              as="h2"
              label={title}
              className="font-display text-2xl font-semibold"
            />
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-studio-border/70">
              <motion.div
                initial={reduce ? false : { width: 0 }}
                animate={{ width: `${percent}%` }}
                transition={{ duration: 0.7, ease: "easeOut" }}
                className="h-full rounded-full bg-gradient-to-r from-studio-accent to-studio-gold"
              />
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
          <p className="text-studio-muted">
            {catProgressPhrase(level, percent, examReady)}
            {level !== "star" ? (
              <>
                {" "}
                Дальше: <CatLevelText label={catNextLabel(level)} />
              </>
            ) : null}
          </p>
          <span className="inline-flex items-center gap-1.5 font-medium text-studio-accent-light">
            <Flame className="h-4 w-4" />
            {streakText}
          </span>
        </div>
      </Link>

      <section
        aria-label="Неделя"
        className="rounded-3xl bg-studio-card p-4 ring-1 ring-studio-border"
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold">Неделя</h3>
          <Link
            href="/dashboard/student/progress"
            className="inline-flex min-h-10 items-center text-sm text-studio-accent-light hover:underline"
          >
            Подробнее
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Ring
            label="Занятие"
            value={progress?.lessons_week ?? 0}
            target={targets?.lessons ?? 1}
            text={`${Math.min(progress?.lessons_week ?? 0, targets?.lessons ?? 1)}/${targets?.lessons ?? 1}`}
          />
          <Ring
            label="Практика"
            value={practiceMin}
            target={targets?.practice_min ?? 20}
            text={`${Math.min(practiceMin, targets?.practice_min ?? 20)} мин`}
          />
          <Ring
            label="Упражнения"
            value={progress?.exercises_week ?? 0}
            target={targets?.exercises ?? 3}
            text={`${Math.min(progress?.exercises_week ?? 0, targets?.exercises ?? 3)}/${targets?.exercises ?? 3}`}
          />
        </div>
        <p className="mt-4 text-sm text-studio-muted">
          {progress
            ? encouragingLine(progress)
            : "Цели появятся после захода в кабинет."}
        </p>
        {board ? (
          <p className="mt-1 text-xs text-studio-muted">
            {board.freezeLeft
              ? "Один пропуск на этой неделе серию не оборвёт."
              : "Заморозка на этой неделе уже использована."}
          </p>
        ) : null}
      </section>

      <section className="grid grid-cols-2 gap-3">
        <Link
          href="/dashboard/student/schedule"
          className="flex min-h-[5.5rem] flex-col justify-between rounded-2xl bg-studio-card p-4 ring-1 ring-studio-border transition hover:ring-studio-accent/40"
        >
          <CalendarDays className="h-5 w-5 text-studio-accent-light" />
          <div>
            <p className="font-medium">Занятия</p>
            <p
              className={`text-sm ${debt > 0 ? "text-red-300" : "text-studio-muted"}`}
            >
              {next
                ? formatStudioDate(next.datetime, {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "Пока нет в расписании"}
            </p>
            <p
              className={`text-xs ${debt > 0 ? "text-red-300" : "text-studio-muted"}`}
            >
              {lessonsLine}
            </p>
          </div>
        </Link>
        <Link
          href="/dashboard/student/chat"
          className="flex min-h-[5.5rem] flex-col justify-between rounded-2xl bg-studio-card p-4 ring-1 ring-studio-border transition hover:ring-studio-accent/40"
        >
          <MessageCircle className="h-5 w-5 text-studio-accent-light" />
          <div>
            <p className="font-medium">Чат</p>
            <p className="text-sm text-studio-muted">Написать преподавателю</p>
          </div>
        </Link>
      </section>
    </div>
  );
}
