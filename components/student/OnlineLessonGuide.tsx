"use client";

import { useEffect, useState } from "react";
import { Download, Headphones, Video, Wifi } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { buttonSizes, buttonVariants } from "@/components/ui/Button";
import { isOnlineStudent, TELEMOST_URL } from "@/lib/lesson-format";
import { cn } from "@/lib/utils";

const HIDDEN_KEY = "uvs_telemost_guide_hidden";

/** Shown only to online students: what to install before the first lesson. */
export default function OnlineLessonGuide() {
  const { profile } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(HIDDEN_KEY) === "1");
    } catch {
      setCollapsed(false);
    }
  }, []);

  if (!isOnlineStudent(profile)) return null;

  const setHidden = (hidden: boolean) => {
    setCollapsed(hidden);
    try {
      if (hidden) window.localStorage.setItem(HIDDEN_KEY, "1");
      else window.localStorage.removeItem(HIDDEN_KEY);
    } catch {
      /* storage can be blocked: the choice then lasts until reload */
    }
  };

  if (collapsed) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-studio-card px-4 py-3 ring-1 ring-studio-border">
        <p className="flex items-center gap-2 text-sm text-studio-muted">
          <Video className="h-4 w-4 text-studio-accent-light" />
          Занятия проходят в Яндекс Телемосте
        </p>
        <div className="flex items-center gap-1">
          <a
            href={TELEMOST_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-studio-accent-light hover:underline"
          >
            Скачать
          </a>
          <button
            type="button"
            onClick={() => setHidden(false)}
            className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm text-studio-muted hover:text-studio-text"
          >
            Подробнее
          </button>
        </div>
      </div>
    );
  }

  return (
    <section
      aria-labelledby="online-guide-title"
      className="rounded-3xl bg-studio-card p-5 ring-1 ring-studio-border"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-studio-accent/15 text-studio-accent-light">
          <Video className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h3
            id="online-guide-title"
            className="font-display text-xl font-semibold"
          >
            Мы встретимся в Яндекс Телемосте
          </h3>
          <p className="mt-1.5 text-sm text-studio-muted">
            Чтобы урок начался без суеты, установите бесплатное приложение
            заранее — это займёт пару минут. Ссылку на занятие вы найдёте в
            карточке урока.
          </p>
        </div>
      </div>

      <ul className="mt-4 space-y-2 text-sm text-studio-muted">
        <li className="flex items-center gap-2">
          <Headphones className="h-4 w-4 shrink-0 text-studio-accent-light" />
          Наушники и включённый микрофон — так мы лучше слышим друг друга
        </li>
        <li className="flex items-center gap-2">
          <Wifi className="h-4 w-4 shrink-0 text-studio-accent-light" />
          Устойчивый интернет и тихая комната
        </li>
      </ul>

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <a
          href={TELEMOST_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "inline-flex min-h-11 w-full touch-manipulation items-center justify-center gap-2 font-semibold transition-all duration-300 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-studio-accent sm:w-auto",
            buttonVariants.primary,
            buttonSizes.lg
          )}
        >
          <Download className="h-5 w-5" />
          Скачать Телемост
        </a>
        <button
          type="button"
          onClick={() => setHidden(true)}
          className="inline-flex min-h-11 items-center text-sm text-studio-muted hover:text-studio-text"
        >
          Уже установлен
        </button>
      </div>
      <p className="mt-2 text-sm text-studio-muted">
        Нет возможности установить? Телемост открывается и в браузере.
      </p>
    </section>
  );
}
