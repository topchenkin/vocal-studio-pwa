"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, MapPin, Video } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { buttonSizes, buttonVariants } from "@/components/ui/Button";
import { isOnlineStudent, safeOnlineLessonUrl } from "@/lib/lesson-format";
import { STUDIO_PLACE } from "@/lib/public-site";
import type { CabinetProgress } from "@/lib/student-progress";
import { formatStudioDate, studioDateKey } from "@/lib/studio-tz";
import { cn } from "@/lib/utils";

const SOON_MS = 48 * 60 * 60 * 1000;
const LIVE_GRACE_MS = 60 * 60 * 1000;

function countdown(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 60) return `через ${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `через ${hours} ч ${rest} мин` : `через ${hours} ч`;
}

/** Hero card with the nearest lesson. Renders only when the lesson is within 48 hours. */
export default function NextLessonCard({
  progress,
}: {
  progress: CabinetProgress | null;
}) {
  const { profile } = useAuth();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const lesson = progress?.next_lesson ?? null;
  if (!lesson) return null;

  const at = new Date(lesson.datetime).getTime();
  const diff = at - now;
  if (Number.isNaN(at) || diff > SOON_MS || diff < -LIVE_GRACE_MS) return null;

  const online = isOnlineStudent(profile);
  const url = safeOnlineLessonUrl(profile?.online_lesson_url);
  const time = formatStudioDate(lesson.datetime, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const dayKey = studioDateKey(lesson.datetime);
  const day =
    dayKey === studioDateKey(new Date(now))
      ? "Сегодня"
      : dayKey === studioDateKey(new Date(now + 24 * 60 * 60 * 1000))
        ? "Завтра"
        : formatStudioDate(lesson.datetime, {
            weekday: "long",
            day: "numeric",
            month: "long",
          });
  const when = diff <= 0 ? "Занятие идёт сейчас" : countdown(diff);

  return (
    <section
      aria-label="Ближайшее занятие"
      className="rounded-3xl bg-gradient-to-br from-studio-accent/20 via-studio-card to-studio-card p-5 ring-1 ring-studio-accent/30"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-studio-accent-light">
            Ближайшее занятие
          </p>
          <p className="mt-1 font-display text-3xl font-semibold">
            {day}, {time}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-studio-muted">
            <span>{when}</span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">
              {online ? (
                <Video className="h-3.5 w-3.5" />
              ) : (
                <MapPin className="h-3.5 w-3.5" />
              )}
              {online ? "Онлайн" : `Очно, ${STUDIO_PLACE.street}`}
            </span>
          </p>
        </div>
        <Link
          href="/dashboard/student/schedule"
          aria-label="Все занятия"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-studio-muted transition hover:bg-studio-surface hover:text-studio-text"
        >
          <ChevronRight className="h-5 w-5" />
        </Link>
      </div>

      {online ? (
        url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "mt-4 inline-flex min-h-11 w-full touch-manipulation items-center justify-center gap-2 font-semibold transition-all duration-300 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-studio-accent sm:w-auto",
              buttonVariants.primary,
              buttonSizes.lg
            )}
          >
            <Video className="h-5 w-5" />
            Войти в Телемост
          </a>
        ) : (
          <p className="mt-4 rounded-xl bg-studio-surface px-3 py-2.5 text-sm text-studio-muted">
            Ссылку на занятие преподаватель добавит заранее — загляните сюда
            перед уроком.
          </p>
        )
      ) : null}
    </section>
  );
}
