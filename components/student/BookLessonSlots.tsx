"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarCheck2, CheckCircle2, Clock3 } from "lucide-react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import MonthCalendar, {
  localDateKey,
} from "@/components/calendar/MonthCalendar";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import type { Lesson } from "@/types";

export default function BookLessonSlots() {
  const { isActiveStudent } = useAuth();
  const [slots, setSlots] = useState<Lesson[]>([]);
  const [selected, setSelected] = useState<Lesson | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState(false);
  const [error, setError] = useState("");

  const loadSlots = useCallback(async () => {
    const { data, error: queryError } = await supabase
      .from("lessons")
      .select("*")
      .eq("status", "open")
      .is("student_id", null)
      .gte("datetime", new Date().toISOString())
      .order("datetime", { ascending: true });

    if (queryError) {
      setError("Не удалось загрузить свободные окна");
      console.error("Unable to load open slots:", queryError.message);
    } else {
      setSlots(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadSlots();
  }, [loadSlots]);

  const groupedSlots = useMemo(() => {
    return slots.reduce<Record<string, Lesson[]>>((groups, slot) => {
      const key = localDateKey(slot.datetime);
      groups[key] = [...(groups[key] ?? []), slot];
      return groups;
    }, {});
  }, [slots]);

  useEffect(() => {
    if (selectedDate && groupedSlots[selectedDate]?.length) return;
    setSelectedDate(Object.keys(groupedSlots)[0] ?? null);
  }, [groupedSlots, selectedDate]);

  const bookSlot = async () => {
    if (!selected) return;
    setBooking(true);
    setError("");

    const { error: bookingError } = await supabase.rpc("book_lesson_slot", {
      slot_id: selected.id,
    });
    setBooking(false);

    if (bookingError) {
      setError("Этот слот уже занят или запись недоступна");
      console.error("Unable to book lesson:", bookingError.message);
      return;
    }

    setSlots((current) => current.filter((slot) => slot.id !== selected.id));
    setBooked(true);
    window.dispatchEvent(new Event("uvs-lesson-booked"));
  };

  return (
    <section className="space-y-4">
      <div>
        <h3 className="font-display text-xl font-semibold">Записаться на урок</h3>
        <p className="mt-1 text-sm text-studio-muted">
          Выберите свободное окно в расписании преподавателя.
        </p>
      </div>

      {!isActiveStudent ? (
        <div className="rounded-2xl bg-studio-surface p-5 text-sm text-studio-muted ring-1 ring-studio-border">
          Администратор должен активировать ваш профиль перед первой записью.
        </div>
      ) : loading ? (
        <div className="h-32 animate-pulse rounded-2xl bg-studio-surface ring-1 ring-studio-border" />
      ) : slots.length === 0 ? (
        <div className="rounded-2xl bg-studio-surface p-7 text-center ring-1 ring-studio-border">
          <CalendarCheck2 className="mx-auto h-8 w-8 text-studio-muted" />
          <p className="mt-2 text-sm text-studio-muted">
            Свободных окон пока нет
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.05fr_.95fr]">
          <MonthCalendar
            availableDates={new Set(Object.keys(groupedSlots))}
            selectedDate={selectedDate}
            onSelect={setSelectedDate}
          />
          <div className="rounded-2xl bg-studio-surface p-4 ring-1 ring-studio-border">
            <p className="font-medium capitalize">
              {selectedDate
                ? new Date(`${selectedDate}T12:00:00`).toLocaleDateString(
                    "ru-RU",
                    {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    }
                  )
                : "Выберите день"}
            </p>
            <p className="mt-1 text-xs text-studio-muted">
              Время отображается по вашему часовому поясу
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-3">
              {(selectedDate ? groupedSlots[selectedDate] ?? [] : []).map(
                (slot) => (
                  <button
                    key={slot.id}
                    type="button"
                    onClick={() => {
                      setBooked(false);
                      setSelected(slot);
                    }}
                    className="flex items-center justify-center gap-1 rounded-xl bg-studio-card px-2 py-3 text-sm ring-1 ring-studio-border transition duration-200 hover:-translate-y-0.5 hover:bg-studio-accent/15 hover:text-studio-accent-light hover:ring-studio-accent/50"
                  >
                    <Clock3 className="h-3.5 w-3.5" />
                    {new Date(slot.datetime).toLocaleTimeString("ru-RU", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={booked ? undefined : "Подтвердите запись"}
        size="sm"
      >
        {booked ? (
          <div className="py-5 text-center">
            <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-400" />
            <h3 className="mt-4 font-display text-2xl font-semibold">
              Вы записаны!
            </h3>
            <p className="mt-2 text-sm text-studio-muted">
              Урок добавлен в ваше расписание.
            </p>
            <Button className="mt-5" fullWidth onClick={() => setSelected(null)}>
              Отлично
            </Button>
          </div>
        ) : selected ? (
          <div>
            <div className="rounded-2xl bg-studio-surface p-4 text-center ring-1 ring-studio-border">
              <p className="font-display text-2xl font-semibold">
                {new Date(selected.datetime).toLocaleDateString("ru-RU", {
                  day: "numeric",
                  month: "long",
                })}
              </p>
              <p className="mt-1 text-studio-accent">
                {new Date(selected.datetime).toLocaleTimeString("ru-RU", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
            <p className="mt-4 text-center text-sm text-studio-muted">
              После подтверждения слот будет закреплён за вами.
            </p>
            <Button
              className="mt-5"
              fullWidth
              disabled={booking}
              onClick={() => void bookSlot()}
            >
              {booking ? "Записываем..." : "Подтвердить запись"}
            </Button>
          </div>
        ) : null}
      </Modal>
    </section>
  );
}
