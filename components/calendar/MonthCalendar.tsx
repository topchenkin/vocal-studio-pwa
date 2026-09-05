"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  formatStudioDate,
  studioCivilNoon,
  studioDateKey,
  studioDateTimeParts,
} from "@/lib/studio-tz";

export function localDateKey(value: Date | string) {
  return studioDateKey(value);
}

function parseCivil(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return { year: year || 1970, month: month || 1, day: day || 1 };
}

export default function MonthCalendar({
  availableDates,
  selectedDate,
  onSelect,
  allowPast = false,
  highlightDates,
}: {
  availableDates: Set<string>;
  selectedDate: string | null;
  onSelect: (dateKey: string) => void;
  allowPast?: boolean;
  highlightDates?: Set<string>;
}) {
  const todayKey = studioDateKey(new Date());
  const initial = selectedDate ?? todayKey;
  const seed = parseCivil(initial);
  const [visible, setVisible] = useState({
    year: seed.year,
    month: seed.month,
  });

  useEffect(() => {
    if (!selectedDate) return;
    const next = parseCivil(selectedDate);
    setVisible((current) => {
      if (current.year === next.year && current.month === next.month) {
        return current;
      }
      return { year: next.year, month: next.month };
    });
  }, [selectedDate]);

  const days = useMemo(() => {
    const first = studioCivilNoon(visible.year, visible.month, 1);
    const mondayOffset = (first.getUTCDay() + 6) % 7;
    const start = new Date(first.getTime() - mondayOffset * 86_400_000);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start.getTime() + index * 86_400_000);
      const parts = studioDateTimeParts(date);
      return {
        key: studioDateKey(date),
        day: parts.day,
        inMonth: parts.month === visible.month,
        date,
      };
    });
  }, [visible]);

  const shiftMonth = (delta: number) => {
    setVisible((current) => {
      const month = current.month + delta;
      if (month < 1) return { year: current.year - 1, month: 12 };
      if (month > 12) return { year: current.year + 1, month: 1 };
      return { year: current.year, month };
    });
  };

  const monthLabel = formatStudioDate(
    studioCivilNoon(visible.year, visible.month, 1),
    { month: "long", year: "numeric" }
  );

  return (
    <div className="rounded-2xl bg-studio-surface p-4 ring-1 ring-studio-border">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          className="min-h-11 min-w-11 rounded-lg p-2 text-studio-muted transition hover:bg-studio-card hover:text-studio-text"
          aria-label="Предыдущий месяц"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="font-medium capitalize">{monthLabel}</p>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          className="min-h-11 min-w-11 rounded-lg p-2 text-studio-muted transition hover:bg-studio-card hover:text-studio-text"
          aria-label="Следующий месяц"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1 text-center text-[11px] text-studio-muted">
        Время студии: Екатеринбург
      </p>

      <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[10px] uppercase text-studio-muted">
        {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((label) => (
          <span key={label} className="py-1">
            {label}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const pending = highlightDates?.has(day.key) ?? false;
          const available = availableDates.has(day.key) || pending;
          const selected = selectedDate === day.key;
          const past = day.key < todayKey;

          return (
            <button
              key={day.key}
              type="button"
              disabled={!available || (!allowPast && past)}
              onClick={() => onSelect(day.key)}
              className={`relative aspect-square min-h-11 rounded-xl text-sm transition ${
                selected
                  ? "bg-studio-accent text-white"
                  : pending
                    ? "bg-studio-gold/20 text-studio-text hover:bg-studio-gold/30"
                    : available
                    ? "bg-studio-card text-studio-text hover:bg-studio-accent/20"
                    : day.inMonth
                      ? "text-studio-muted/45"
                      : "text-studio-muted/20"
              } disabled:cursor-default`}
              aria-label={
                pending
                  ? `${formatStudioDate(day.date, { day: "numeric", month: "long" })}, есть запрос на перенос`
                  : formatStudioDate(day.date, { day: "numeric", month: "long" })
              }
            >
              {day.day}
              {pending ? (
                <span className="absolute bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-studio-gold" />
              ) : available && !selected ? (
                <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-studio-accent" />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
