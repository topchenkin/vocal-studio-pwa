"use client";

import { useState } from "react";
import {
  Calendar,
  Flame,
  MessageCircle,
  Mic,
  Target,
  WalletCards,
  Waves,
} from "lucide-react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { CAT_LEVEL_LABELS } from "@/lib/cat-levels";
import {
  catNextLabel,
  catProgressPercent,
  catProgressPhrase,
} from "@/lib/cat-progress";
import {
  practiceMinutes,
  type CabinetProgress,
} from "@/lib/student-progress";
import CatLevelText from "@/components/ui/CatLevelText";
import BottomSheet from "@/components/ui/BottomSheet";
import { VOCAL_CAT_STICKERS } from "@/lib/chat-stickers";
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

type TileId = "lessons" | "practice" | "cabinet" | "exercises" | "connect";

const TILE_CAT: Record<TileId, (typeof VOCAL_CAT_STICKERS)[number]["src"]> = {
  lessons: "/stickers/sticker-cat-star.png",
  practice: "/stickers/sticker-cat-sing.png",
  cabinet: "/stickers/sticker-cat-wave.png",
  exercises: "/stickers/sticker-cat-headphones.png",
  connect: "/stickers/sticker-cat-heart.png",
};

export default function StudentHomeHub({
  progress,
}: {
  progress: CabinetProgress | null;
}) {
  const { profile } = useAuth();
  const [openTile, setOpenTile] = useState<TileId | null>(null);
  const level = (profile?.cat_level ?? "beginner") as CatLevel;
  const xp = Number(profile?.cat_xp) || 0;
  const examReady = Boolean(profile?.cat_exam_ready);
  const percent = examReady ? 100 : catProgressPercent(level, xp);
  const title = CAT_LEVEL_LABELS[level] ?? CAT_LEVEL_LABELS.beginner;
  const nextLabel = catNextLabel(level);
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
  const payType = profile?.lesson_pay_type === "abonement" ? "Абонемент" : "Разовая";
  const debt = Number(profile?.debt_amount) || 0;
  const balance = Number(profile?.lessons_balance) || 0;

  const tiles: Array<{
    id: TileId;
    icon: typeof Mic;
    title: string;
    value: string;
    percent: number;
    detail: string;
  }> = [
    {
      id: "lessons",
      icon: Mic,
      title: "Занятия",
      value: `${Math.min(lessonCurrent, lessonTarget)} / ${lessonTarget}`,
      percent: clampPercent(lessonCurrent, lessonTarget),
      detail: "Живые уроки на этой неделе. Одно занятие уже держит форму.",
    },
    {
      id: "practice",
      icon: Waves,
      title: "Практика",
      value: `${Math.min(practiceMin, practiceTarget)} / ${practiceTarget} мин`,
      percent: clampPercent(practiceMin, practiceTarget),
      detail: "Минуты пения в упражнениях, анализаторе и студии.",
    },
    {
      id: "cabinet",
      icon: Target,
      title: "Кабинет",
      value: `${Math.min(daysCurrent, daysTarget)} / ${daysTarget} дн.`,
      percent: clampPercent(daysCurrent, daysTarget),
      detail: "Просто заходить. Котик любит регулярность больше, чем героизм.",
    },
    {
      id: "exercises",
      icon: Calendar,
      title: "Упражнения",
      value: `${Math.min(exerciseCurrent, exerciseTarget)} / ${exerciseTarget}`,
      percent: clampPercent(exerciseCurrent, exerciseTarget),
      detail: "Три дня практики или одно письмо преподавателю с записью.",
    },
    {
      id: "connect",
      icon: MessageCircle,
      title: "Связь",
      value: connectCurrent >= 1 ? "есть" : "ещё нет",
      percent: connectCurrent >= 1 ? 100 : 0,
      detail: "Сообщение, практика в чат или проф. тест — любой живой контакт.",
    },
  ];

  const opened = tiles.find((tile) => tile.id === openTile) ?? null;

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-studio-card via-studio-surface to-emerald-500/10 p-5 ring-1 ring-studio-border">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.18em] text-studio-muted">
              Уровень котика
            </p>
            <CatLevelText
              as="h2"
              label={title}
              className="mt-1 font-display text-2xl font-semibold"
            />
            {level !== "star" && (
              <p className="mt-1 text-xs text-studio-muted">
                Дальше: <CatLevelText label={nextLabel} />
              </p>
            )}
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-studio-accent/15 px-3 py-1.5 text-sm text-studio-accent-light ring-1 ring-studio-accent/30">
            <Flame className="h-3.5 w-3.5" />
            {streak > 0 ? `Серия ${streak} дн.` : "Серия с сегодня"}
          </span>
        </div>
        <div className="mt-5">
          <div className="h-2.5 overflow-hidden rounded-full bg-emerald-950/60 ring-1 ring-emerald-500/20">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${percent}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-lime-300 shadow-[0_0_16px_rgba(52,211,153,0.45)]"
            />
          </div>
          <p className="mt-2 text-xs text-studio-muted">
            {catProgressPhrase(level, percent, examReady)}
          </p>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-3xl bg-studio-card p-4 ring-1 ring-studio-border">
          <p className="text-[11px] uppercase tracking-[0.16em] text-studio-muted">
            Остаток уроков
          </p>
          <p className="mt-2 font-display text-3xl font-semibold">{balance}</p>
          <p className="mt-1 text-xs text-studio-muted">
            {payType === "Абонемент" ? "по абонементу" : "разовые занятия"}
          </p>
        </div>
        <div
          className={`rounded-3xl p-4 ring-1 ${
            debt > 0
              ? "bg-red-500/10 ring-red-500/30"
              : "bg-studio-card ring-studio-border"
          }`}
        >
          <p className="text-[11px] uppercase tracking-[0.16em] text-studio-muted">
            Оплата
          </p>
          <p className="mt-2 font-display text-lg font-semibold">{payType}</p>
          {debt > 0 ? (
            <p className="mt-1 flex items-center gap-1 text-xs text-red-300">
              <WalletCards className="h-3.5 w-3.5" />
              Долг {debt.toLocaleString("ru-RU")} ₽
            </p>
          ) : (
            <p className="mt-1 text-xs text-emerald-300/80">Задолженности нет</p>
          )}
        </div>
      </section>

      <section>
        <div className="mb-3">
          <h3 className="font-display text-lg font-semibold">На этой неделе</h3>
          <p className="text-xs text-studio-muted">
            Нажмите плитку — котик покажет, как идёт цель
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {tiles.map((tile) => {
            const Icon = tile.icon;
            return (
              <button
                key={tile.id}
                type="button"
                onClick={() => setOpenTile(tile.id)}
                className="rounded-3xl bg-studio-card p-4 text-left ring-1 ring-studio-border transition hover:ring-studio-accent/40"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-studio-accent/15 ring-1 ring-studio-accent/30">
                  <Icon className="h-4 w-4 text-studio-accent-light" />
                </span>
                <p className="mt-3 text-[11px] text-studio-muted">{tile.title}</p>
                <p className="font-display text-lg font-semibold">{tile.value}</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-studio-bg">
                  <span
                    className="block h-full rounded-full bg-gradient-to-r from-emerald-500 to-lime-300"
                    style={{ width: `${tile.percent}%` }}
                  />
                </div>
              </button>
            );
          })}
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
          label="Дней практики"
          value={String(stats?.exercises_total ?? 0)}
        />
        <StatChip
          label="Анализатор"
          value={minutesLabel(practiceMinutes(stats?.analyzer_sec_week ?? 0))}
        />
      </section>

      <BottomSheet open={Boolean(opened)} onClose={() => setOpenTile(null)}>
        {opened && (
          <div className="pb-4 pt-6 text-center">
            <AnimatePresence>
              <motion.img
                key={opened.id}
                src={TILE_CAT[opened.id]}
                alt=""
                initial={{ y: 24, scale: 0.86, rotate: -6, opacity: 0 }}
                animate={{
                  y: [0, -10, 0],
                  scale: 1,
                  rotate: [-4, 4, -4],
                  opacity: 1,
                }}
                transition={{
                  y: { duration: 1.6, repeat: Infinity, ease: "easeInOut" },
                  rotate: { duration: 2.2, repeat: Infinity, ease: "easeInOut" },
                  opacity: { duration: 0.25 },
                }}
                className="mx-auto h-36 w-36 object-contain sm:h-44 sm:w-44"
              />
            </AnimatePresence>
            <h3 className="mt-2 font-display text-2xl font-semibold">
              {opened.title}
            </h3>
            <p className="mt-1 text-sm text-studio-muted">{opened.detail}</p>
            <div className="mx-auto mt-5 h-2.5 max-w-xs overflow-hidden rounded-full bg-emerald-950/60 ring-1 ring-emerald-500/20">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${opened.percent}%` }}
                transition={{ duration: 0.7, ease: "easeOut" }}
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-lime-300"
              />
            </div>
            <p className="mt-3 font-display text-lg font-semibold">{opened.value}</p>
          </div>
        )}
      </BottomSheet>
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
