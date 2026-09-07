"use client";

import { Calendar, Flame, MessageCircle, Mic, Target, Waves } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { CAT_LEVEL_LABELS } from "@/lib/cat-levels";
import { CAT_XP_THRESHOLDS } from "@/lib/cat-progress";
import {
  practiceMinutes,
  type CabinetProgress,
} from "@/lib/student-progress";
import CatLevelText from "@/components/ui/CatLevelText";
import type { CatLevel } from "@/types";

function clampPercent(current: number, target: number) {
  if (target <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round((current / target) * 100)));
}

function encouragingLine(progress: CabinetProgress) {
  const lessonDone = progress.lessons_week >= progress.targets.lessons;
  const practiceDone =
    practiceMinutes(progress.practice_sec_week) >= progress.targets.practice_min;
  const daysDone = progress.cabinet_days >= progress.targets.cabinet_days;
  const doneCount = [lessonDone, practiceDone, daysDone].filter(Boolean).length;
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

function GoalModule({
  icon: Icon,
  title,
  value,
  percent,
}: {
  icon: typeof Mic;
  title: string;
  value: string;
  percent: number;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-studio-accent/15 ring-1 ring-studio-accent/30">
          <Icon className="h-4 w-4 text-studio-accent-light" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[11px] text-studio-muted">{title}</p>
          <p className="font-display text-sm font-semibold">{value}</p>
        </div>
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-studio-bg">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="h-full rounded-full bg-gradient-to-r from-studio-accent to-studio-gold"
        />
      </div>
    </div>
  );
}

function formatLessonWhen(iso: string) {
  const date = new Date(iso);
  return date.toLocaleString("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function minutesLabel(total: number) {
  if (total <= 0) return "0 мин";
  return `${total} мин`;
}

export default function StudentHomeHub({
  progress,
}: {
  progress: CabinetProgress | null;
}) {
  const { profile } = useAuth();
  const level = (profile?.cat_level ?? "beginner") as CatLevel;
  const xp = Number(profile?.cat_xp) || 0;
  const threshold = CAT_XP_THRESHOLDS[level];
  const title = CAT_LEVEL_LABELS[level] ?? CAT_LEVEL_LABELS.beginner;
  const streak = progress?.streak ?? (Number(profile?.cat_streak_days) || 0);
  const lessonCurrent = progress?.lessons_week ?? 0;
  const lessonTarget = progress?.targets.lessons ?? 1;
  const practiceMin = practiceMinutes(progress?.practice_sec_week ?? 0);
  const practiceTarget = progress?.targets.practice_min ?? 20;
  const daysCurrent = progress?.cabinet_days ?? 0;
  const daysTarget = progress?.targets.cabinet_days ?? 5;
  const exerciseCurrent = progress?.exercises_week ?? 0;
  const exerciseTarget = progress?.targets.exercises ?? 3;
  const connectCurrent = Math.min(progress?.connect_week ?? 0, 1);
  const next = progress?.next_lesson ?? null;
  const stats = progress?.stats;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 rounded-full bg-studio-surface px-3 py-1.5 ring-1 ring-studio-border">
          <CatLevelText label={title} className="text-sm font-medium" />
          <span className="text-studio-muted">·</span>
          <span className="font-display text-sm font-semibold text-studio-gold">
            {threshold ? `${xp} / ${threshold} XP` : `${xp} XP`}
          </span>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-studio-accent/15 px-3 py-1.5 text-sm text-studio-accent-light ring-1 ring-studio-accent/30">
          <Flame className="h-3.5 w-3.5" />
          {streak > 0 ? `Серия ${streak} дн.` : "Серия с сегодня"}
        </span>
      </div>

      <section className="rounded-3xl bg-studio-card p-5 ring-1 ring-studio-border">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-semibold">На этой неделе</h3>
            <p className="text-xs text-studio-muted">
              Цели с понедельника, время студии — Екатеринбург
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <GoalModule
            icon={Mic}
            title="Занятия"
            value={`${Math.min(lessonCurrent, lessonTarget)} / ${lessonTarget}`}
            percent={clampPercent(lessonCurrent, lessonTarget)}
          />
          <GoalModule
            icon={Waves}
            title="Практика"
            value={`${Math.min(practiceMin, practiceTarget)} / ${practiceTarget} мин`}
            percent={clampPercent(practiceMin, practiceTarget)}
          />
          <GoalModule
            icon={Target}
            title="Кабинет"
            value={`${Math.min(daysCurrent, daysTarget)} / ${daysTarget} дн.`}
            percent={clampPercent(daysCurrent, daysTarget)}
          />
        </div>
        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <GoalModule
            icon={Calendar}
            title="Упражнения"
            value={`${Math.min(exerciseCurrent, exerciseTarget)} / ${exerciseTarget} фразы`}
            percent={clampPercent(exerciseCurrent, exerciseTarget)}
          />
          <GoalModule
            icon={MessageCircle}
            title="Связь"
            value={connectCurrent >= 1 ? "1 / 1" : "0 / 1"}
            percent={connectCurrent >= 1 ? 100 : 0}
          />
        </div>
        <p className="mt-4 text-sm text-studio-muted">
          {progress ? encouragingLine(progress) : "Цели появятся после захода в кабинет."}{" "}
          <span aria-hidden>💜</span>
        </p>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold">Дальше</h3>
          <Link
            href="/dashboard/student?tab=lessons"
            className="text-xs text-studio-accent-light underline-offset-2 hover:underline"
          >
            Все занятия
          </Link>
        </div>
        {next ? (
          <Link
            href="/dashboard/student?tab=lessons"
            className="flex items-center gap-3 rounded-2xl bg-studio-surface p-4 ring-1 ring-studio-border transition hover:ring-studio-accent/40"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-studio-accent/15">
              <Calendar className="h-5 w-5 text-studio-accent-light" />
            </span>
            <div className="min-w-0">
              <p className="font-medium">Занятие с преподавателем</p>
              <p className="text-sm text-studio-muted">
                {formatLessonWhen(next.datetime)}
              </p>
            </div>
          </Link>
        ) : (
          <div className="rounded-2xl bg-studio-surface p-4 ring-1 ring-studio-border">
            <p className="font-medium">Пока нет урока в расписании</p>
            <p className="mt-1 text-sm text-studio-muted">
              Преподаватель добавит занятие. Сегодня можно разогреться самим.
            </p>
            <Link
              href="/dashboard/student/exercises"
              className="mt-3 inline-flex text-sm font-medium text-studio-accent-light underline-offset-2 hover:underline"
            >
              Открыть упражнения
            </Link>
          </div>
        )}
      </section>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatChip
          label="Пение за неделю"
          value={minutesLabel(practiceMinutes(stats?.practice_sec_week ?? 0))}
        />
        <StatChip
          label="Уроков всего"
          value={String(stats?.lessons_total ?? 0)}
        />
        <StatChip
          label="Фраз закрыто"
          value={String(stats?.exercises_total ?? 0)}
        />
        <StatChip
          label="Анализатор"
          value={minutesLabel(practiceMinutes(stats?.analyzer_sec_week ?? 0))}
        />
      </section>
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-studio-surface px-3 py-3 ring-1 ring-studio-border">
      <p className="text-[11px] text-studio-muted">{label}</p>
      <p className="mt-1 font-display text-lg font-semibold">{value}</p>
    </div>
  );
}
