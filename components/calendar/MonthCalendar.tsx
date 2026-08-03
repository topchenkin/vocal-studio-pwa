"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function localDateKey(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function MonthCalendar({
  availableDates,
  selectedDate,
  onSelect,
  allowPast = false,
}: {
  availableDates: Set<string>;
  selectedDate: string | null;
  onSelect: (dateKey: string) => void;
  allowPast?: boolean;
}) {
  const initialDate = selectedDate
    ? new Date(`${selectedDate}T12:00:00`)
    : new Date();
  const [visibleMonth, setVisibleMonth] = useState(
    new Date(initialDate.getFullYear(), initialDate.getMonth(), 1)
  );

  const days = useMemo(() => {
    const first = new Date(
      visibleMonth.getFullYear(),
      visibleMonth.getMonth(),
      1
    );
    const mondayOffset = (first.getDay() + 6) % 7;
    const start = new Date(first);
    start.setDate(first.getDate() - mondayOffset);

    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      return day;
    });
  }, [visibleMonth]);

  const shiftMonth = (delta: number) => {
    setVisibleMonth(
      (current) =>
        new Date(current.getFullYear(), current.getMonth() + delta, 1)
    );
  };

  return (
    <div className="rounded-2xl bg-studio-surface p-4 ring-1 ring-studio-border">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          className="rounded-lg p-2 text-studio-muted transition hover:bg-studio-card hover:text-studio-text"
          aria-label="Предыдущий месяц"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="font-medium capitalize">
          {visibleMonth.toLocaleDateString("ru-RU", {
            month: "long",
            year: "numeric",
          })}
        </p>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          className="rounded-lg p-2 text-studio-muted transition hover:bg-studio-card hover:text-studio-text"
          aria-label="Следующий месяц"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[10px] uppercase text-studio-muted">
        {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((label) => (
          <span key={label} className="py-1">
            {label}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const key = localDateKey(day);
          const available = availableDates.has(key);
          const selected = selectedDate === key;
          const inMonth = day.getMonth() === visibleMonth.getMonth();
          const past = day < new Date(new Date().setHours(0, 0, 0, 0));

          return (
            <button
              key={key}
              type="button"
              disabled={!available || (!allowPast && past)}
              onClick={() => onSelect(key)}
              className={`relative aspect-square rounded-xl text-sm transition ${
                selected
? "bg-studio-accent text-white"
                    : available
                    ? "bg-studio-card text-studio-text hover:bg-studio-accent/20"
                    : inMonth
                      ? "text-studio-muted/45"
                      : "text-studio-muted/20"
              } disabled:cursor-default`}
              aria-label={day.toLocaleDateString("ru-RU")}
            >
              {day.getDate()}
              {available && !selected && (
                <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-studio-accent" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
