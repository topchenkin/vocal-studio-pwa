"use client";

import { Download, Headphones, Wifi } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { buttonSizes, buttonVariants } from "@/components/ui/Button";
import { isOnlineStudent, TELEMOST_URL } from "@/lib/lesson-format";
import { cn } from "@/lib/utils";

/** Shown only to online students: what to install before the first lesson. */
export default function OnlineLessonGuide() {
  const { profile } = useAuth();
  if (!isOnlineStudent(profile)) return null;

  return (
    <section
      aria-labelledby="online-guide-title"
      className="overflow-hidden rounded-3xl bg-gradient-to-br from-studio-accent/15 via-studio-card to-studio-surface p-5 ring-1 ring-studio-accent/25"
    >
      <div className="flex items-start gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/stickers/sticker-cat-headphones.png"
          alt=""
          className="h-16 w-16 shrink-0 bg-transparent object-contain sm:h-20 sm:w-20"
        />
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.18em] text-studio-muted">
            Онлайн-занятия
          </p>
          <h3
            id="online-guide-title"
            className="mt-1 font-display text-xl font-semibold"
          >
            Мы встретимся в Яндекс Телемосте
          </h3>
          <p className="mt-2 text-sm text-studio-muted">
            Чтобы урок начался без суеты, установите бесплатное приложение
            заранее — это займёт пару минут. Регистрироваться в нём не
            обязательно: ссылку на занятие вы найдёте в карточке урока в
            расписании.
          </p>
        </div>
      </div>

      <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <li className="flex items-center gap-2 rounded-xl bg-studio-bg/40 px-3 py-2.5 ring-1 ring-studio-border">
          <Headphones className="h-4 w-4 shrink-0 text-studio-accent-light" />
          Наушники и включённый микрофон — так мы лучше слышим друг друга
        </li>
        <li className="flex items-center gap-2 rounded-xl bg-studio-bg/40 px-3 py-2.5 ring-1 ring-studio-border">
          <Wifi className="h-4 w-4 shrink-0 text-studio-accent-light" />
          Устойчивый интернет и тихая комната
        </li>
      </ul>

      <a
        href={TELEMOST_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "mt-5 inline-flex min-h-11 w-full touch-manipulation items-center justify-center gap-2 font-semibold transition-all duration-300 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-studio-accent sm:w-auto",
          buttonVariants.primary,
          buttonSizes.lg
        )}
      >
        <Download className="h-5 w-5" />
        Скачать Телемост
      </a>
      <p className="mt-3 text-xs text-studio-muted">
        Нет возможности установить? Телемост открывается и в браузере.
      </p>
    </section>
  );
}
