"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import Button from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import { practiceMinutes, type CabinetProgress } from "@/lib/student-progress";

type Milestone = { id: string; title: string; text: string };

const LESSONS = [1, 5, 10, 25, 50, 100];
const STREAK = [7, 14, 30, 60, 100];
const PRACTICE_MIN = [60, 300, 600, 1800];

function plural(n: number, forms: [string, string, string]) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

function storageKey(userId: string) {
  return `uvs_milestones_seen_v1:${userId}`;
}

function achievedMilestones(progress: CabinetProgress): Milestone[] {
  const list: Milestone[] = [];
  const lessons = progress.stats.lessons_total;
  for (const n of LESSONS) {
    if (lessons < n) continue;
    list.push(
      n === 1
        ? {
            id: "lessons-1",
            title: "Первое занятие позади!",
            text: "Самое трудное — начать. Дальше голос только растёт.",
          }
        : {
            id: `lessons-${n}`,
            title: `${n} ${plural(n, ["занятие", "занятия", "занятий"])} вместе`,
            text: "Это уже не эксперимент, а привычка. Котик гордится вами.",
          }
    );
  }
  for (const n of STREAK) {
    if (progress.streak < n) continue;
    list.push({
      id: `streak-${n}`,
      title: `${n} ${plural(n, ["день", "дня", "дней"])} подряд`,
      text: "Регулярность делает с голосом больше, чем редкие подвиги.",
    });
  }
  const minutes = practiceMinutes(progress.stats.practice_sec_total);
  for (const n of PRACTICE_MIN) {
    if (minutes < n) continue;
    const hours = n / 60;
    list.push({
      id: `practice-${n}`,
      title:
        n >= 60
          ? `${hours} ${plural(hours, ["час", "часа", "часов"])} пения`
          : `${n} мин пения`,
      text: "Столько вы уже спели в кабинете. Голос это чувствует.",
    });
  }
  return list;
}

/** One celebratory card for the newest unseen milestone. */
export default function MilestoneCard({
  progress,
}: {
  progress: CabinetProgress | null;
}) {
  const { user } = useAuth();
  const reduce = useReducedMotion();
  const [seen, setSeen] = useState<string[] | null>(null);

  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    try {
      const raw = window.localStorage.getItem(storageKey(userId));
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      setSeen(
        Array.isArray(parsed)
          ? parsed.filter((item): item is string => typeof item === "string")
          : []
      );
    } catch {
      setSeen([]);
    }
  }, [userId]);

  const achieved = useMemo(
    () => (progress ? achievedMilestones(progress) : []),
    [progress]
  );

  if (!userId || !seen || achieved.length === 0) return null;
  const fresh = achieved.filter((item) => !seen.includes(item.id));
  const current = fresh[fresh.length - 1];
  if (!current) return null;

  const dismiss = () => {
    const next = Array.from(new Set([...seen, ...achieved.map((item) => item.id)]));
    setSeen(next);
    try {
      window.localStorage.setItem(storageKey(userId), JSON.stringify(next));
    } catch {
      /* storage can be blocked: the card then returns on next visit */
    }
  };

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      aria-label="Достижение"
      className="rounded-3xl bg-gradient-to-br from-studio-gold/20 via-studio-card to-studio-accent/15 p-5 ring-1 ring-studio-gold/40"
    >
      <div className="flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/stickers/sticker-cat-star.png"
          alt=""
          className="h-20 w-20 shrink-0 bg-transparent object-contain"
        />
        <div className="min-w-0">
          <p className="text-sm font-medium text-studio-gold">Новое достижение</p>
          <h3 className="mt-1 font-display text-2xl font-semibold">
            {current.title}
          </h3>
          <p className="mt-1 text-sm text-studio-muted">{current.text}</p>
        </div>
      </div>
      <Button className="mt-4 w-full sm:w-auto" onClick={dismiss}>
        Спасибо, котик!
      </Button>
    </motion.section>
  );
}
