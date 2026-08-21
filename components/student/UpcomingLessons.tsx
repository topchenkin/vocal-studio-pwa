"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRightLeft, Ban, Calendar, CheckCircle2, Clock, List } from "lucide-react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import MonthCalendar, { localDateKey } from "@/components/calendar/MonthCalendar";
import { useAuth } from "@/context/AuthContext";
import { realtimeTopic } from "@/lib/client-instance";
import { supabase } from "@/lib/supabase";
import type { Lesson } from "@/types";

export default function UpcomingLessons() {
  const { user } = useAuth();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestingId, setRequestingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [rescheduleLesson, setRescheduleLesson] = useState<Lesson | null>(null);
  const [cancelLesson, setCancelLesson] = useState<Lesson | null>(null);
  const [preferredDate, setPreferredDate] = useState("");
  const [preferredTime, setPreferredTime] = useState("");
  const [note, setNote] = useState("");
  const [view, setView] = useState<"list" | "calendar">("list");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const loadLessons = useCallback(async () => {
    if (!user) return;

    const { data, error: queryError } = await supabase
      .from("lessons")
      .select("*")
      .eq("student_id", user.id)
      .eq("status", "scheduled")
      .gte("datetime", new Date().toISOString())
      .order("datetime", { ascending: true })
      .limit(12);

    if (queryError) {
      setError("Не удалось загрузить расписание");
      console.error("Unable to load lessons:", queryError.message);
    } else {
      setLessons(data ?? []);
      setError("");
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void loadLessons();
    const refresh = () => void loadLessons();
    window.addEventListener("uvs-lesson-booked", refresh);
    window.addEventListener("uvs-profile-updated", refresh);

    if (!user) {
      return () => {
        window.removeEventListener("uvs-lesson-booked", refresh);
        window.removeEventListener("uvs-profile-updated", refresh);
      };
    }

    const channel = supabase
      .channel(realtimeTopic(`student-lessons:${user.id}`))
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "lessons",
          filter: `student_id=eq.${user.id}`,
        },
        () => void loadLessons()
      )
      .subscribe();

    return () => {
      window.removeEventListener("uvs-lesson-booked", refresh);
      window.removeEventListener("uvs-profile-updated", refresh);
      void supabase.removeChannel(channel);
    };
  }, [loadLessons, user]);

  const openReschedule = (lesson: Lesson) => {
    const current = new Date(lesson.datetime);
    setRescheduleLesson(lesson);
    setPreferredDate(current.toISOString().slice(0, 10));
    setPreferredTime(
      current.toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
      })
    );
    setNote("");
  };

  const requestReschedule = async () => {
    if (!rescheduleLesson) return;
    setRequestingId(rescheduleLesson.id);
    setError("");

    let preferredDatetime: string | null = null;
    if (preferredDate && preferredTime) {
      const preferred = new Date(`${preferredDate}T${preferredTime}`);
      if (!Number.isNaN(preferred.getTime())) {
        preferredDatetime = preferred.toISOString();
      }
    }
    const studentNote = note.trim().slice(0, 200) || null;

    try {
      const { error: rpcError } = await supabase.rpc("request_lesson_reschedule", {
        lesson_id: rescheduleLesson.id,
        preferred_at: preferredDatetime,
        student_note: studentNote,
      });

      if (rpcError) {
        setError("Не удалось отправить запрос");
        console.error("Unable to request reschedule:", rpcError.message);
        setRequestingId(null);
        return;
      }

      setLessons((current) =>
        current.map((lesson) =>
          lesson.id === rescheduleLesson.id
            ? {
                ...lesson,
                reschedule_request: "pending",
                preferred_reschedule_at: preferredDatetime,
                reschedule_note: studentNote,
              }
            : lesson
        )
      );
      setRescheduleLesson(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка запроса");
    }
    setRequestingId(null);
  };

  const requestCancel = async () => {
    if (!cancelLesson) return;
    setRequestingId(cancelLesson.id);
    setError("");
    const studentNote = note.trim().slice(0, 200) || null;

    try {
      const { error: rpcError } = await supabase.rpc("request_lesson_cancel", {
        lesson_id: cancelLesson.id,
        student_note: studentNote,
      });

      if (rpcError) {
        setError("Не удалось отправить запрос на отмену");
        console.error("Unable to request cancel:", rpcError.message);
        setRequestingId(null);
        return;
      }

      setLessons((current) =>
        current.map((lesson) =>
          lesson.id === cancelLesson.id
            ? {
                ...lesson,
                cancel_request: "pending",
                cancel_note: studentNote,
              }
            : lesson
        )
      );
      setCancelLesson(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка запроса");
    }
    setRequestingId(null);
  };

  if (!user) return null;

  const lessonDates = new Set(lessons.map((lesson) => localDateKey(lesson.datetime)));
  const visibleLessons =
    view === "calendar" && selectedDate
      ? lessons.filter((lesson) => localDateKey(lesson.datetime) === selectedDate)
      : lessons;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold">Ближайшие занятия</h3>
          <p className="text-xs text-studio-muted">
            Запись делает преподаватель. Здесь можно запросить перенос или отмену.
          </p>
        </div>
        <div className="flex shrink-0 rounded-xl bg-studio-surface p-1 ring-1 ring-studio-border">
          <button
            type="button"
            onClick={() => {
              setView("list");
              setSelectedDate(null);
            }}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
              view === "list"
                ? "bg-studio-accent/20 text-studio-accent-light"
                : "text-studio-muted"
            }`}
          >
            <List className="h-3.5 w-3.5" />
            Список
          </button>
          <button
            type="button"
            onClick={() => setView("calendar")}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
              view === "calendar"
                ? "bg-studio-accent/20 text-studio-accent-light"
                : "text-studio-muted"
            }`}
          >
            <Calendar className="h-3.5 w-3.5" />
            Календарь
          </button>
        </div>
      </div>

      {view === "calendar" && !loading && lessons.length > 0 && (
        <MonthCalendar
          availableDates={lessonDates}
          selectedDate={selectedDate}
          onSelect={setSelectedDate}
        />
      )}

      {loading ? (
        <div className="h-28 animate-pulse rounded-2xl bg-studio-surface ring-1 ring-studio-border" />
      ) : visibleLessons.length === 0 ? (
        <div className="rounded-2xl bg-studio-surface p-6 text-center ring-1 ring-studio-border">
          <Calendar className="mx-auto h-8 w-8 text-studio-muted" />
          <p className="mt-2 text-sm text-studio-muted">
            {view === "calendar" && selectedDate
              ? "В этот день занятий нет — выберите дату с точкой"
              : "Нет запланированных уроков — преподаватель добавит их в расписание"}
          </p>
        </div>
      ) : (
        visibleLessons.map((lesson) => {
          const date = new Date(lesson.datetime);
          const reschedulePending = lesson.reschedule_request === "pending";
          const cancelPending = lesson.cancel_request === "pending";
          const requestPending = reschedulePending || cancelPending;

          return (
            <div
              key={lesson.id}
              className="rounded-2xl bg-studio-surface p-4 ring-1 ring-studio-border"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 flex-col items-center justify-center rounded-xl bg-studio-accent/10 text-xs">
                    <span className="font-bold text-studio-accent">
                      {date.getDate()}
                    </span>
                    <span className="text-[10px] text-studio-muted">
                      {date.toLocaleDateString("ru-RU", { month: "short" })}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium">
                      {date.toLocaleDateString("ru-RU", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                      })}
                    </p>
                    <p className="flex items-center gap-1 text-sm text-studio-muted">
                      <Clock className="h-3.5 w-3.5" />
                      {date.toLocaleTimeString("ru-RU", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    {lesson.is_recurring ? (
                      <p className="mt-1 text-[11px] text-studio-accent-light">
                        Еженедельное занятие
                      </p>
                    ) : null}
                  </div>
                </div>
                <Badge variant="success">Запланирован</Badge>
              </div>

              {requestPending ? (
                <p className="mt-4 flex items-center gap-2 rounded-xl bg-studio-accent/10 px-3 py-2.5 text-sm text-studio-accent-light">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  {cancelPending
                    ? "Запрос на отмену отправлен преподавателю"
                    : "Запрос на перенос отправлен преподавателю"}
                </p>
              ) : (
                <div className="mt-4">
                  {lesson.reschedule_request === "rejected" && (
                    <p className="mb-2 text-xs text-red-300">
                      Перенос отклонён. Можно отправить новый или написать в чат.
                    </p>
                  )}
                  {lesson.cancel_request === "rejected" && (
                    <p className="mb-2 text-xs text-red-300">
                      Отмена отклонена. Можно отправить новый запрос или написать в чат.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={requestingId === lesson.id}
                      onClick={() => openReschedule(lesson)}
                    >
                      <ArrowRightLeft className="h-4 w-4" />
                      Запросить перенос
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={requestingId === lesson.id}
                      onClick={() => {
                        setCancelLesson(lesson);
                        setNote("");
                      }}
                    >
                      <Ban className="h-4 w-4" />
                      Запросить отмену
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      <Modal
        open={Boolean(rescheduleLesson)}
        onClose={() => setRescheduleLesson(null)}
        title="Запрос переноса"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-studio-muted">
            Преподаватель получит уведомление сразу. Укажите желаемое время —
            так проще согласовать.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="mb-1.5 block text-xs text-studio-muted">
                Желаемая дата
              </span>
              <input
                type="date"
                value={preferredDate}
                onChange={(event) => setPreferredDate(event.target.value)}
                className="w-full rounded-xl bg-studio-surface px-3 py-3 text-sm ring-1 ring-studio-border"
              />
            </label>
            <label>
              <span className="mb-1.5 block text-xs text-studio-muted">
                Желаемое время
              </span>
              <input
                type="time"
                value={preferredTime}
                onChange={(event) => setPreferredTime(event.target.value)}
                className="w-full rounded-xl bg-studio-surface px-3 py-3 text-sm ring-1 ring-studio-border"
              />
            </label>
          </div>
          <label>
            <span className="mb-1.5 block text-xs text-studio-muted">
              Комментарий (необязательно)
            </span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              className="w-full rounded-xl bg-studio-surface px-3 py-3 text-sm ring-1 ring-studio-border"
              placeholder="Например: могу только после 18:00"
            />
          </label>
          <Button
            fullWidth
            disabled={Boolean(requestingId)}
            onClick={() => void requestReschedule()}
          >
            <ArrowRightLeft className="h-4 w-4" />
            {requestingId ? "Отправляем..." : "Отправить запрос"}
          </Button>
        </div>
      </Modal>

      <Modal
        open={Boolean(cancelLesson)}
        onClose={() => setCancelLesson(null)}
        title="Запрос отмены"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-studio-muted">
            Преподаватель получит уведомление и сам решит, отменить занятие или
            оставить его в расписании.
          </p>
          <label>
            <span className="mb-1.5 block text-xs text-studio-muted">
              Комментарий (необязательно)
            </span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              className="w-full rounded-xl bg-studio-surface px-3 py-3 text-sm ring-1 ring-studio-border"
              placeholder="Например: заболел(а), не успеваю"
            />
          </label>
          <Button
            fullWidth
            variant="danger"
            disabled={Boolean(requestingId)}
            onClick={() => void requestCancel()}
          >
            <Ban className="h-4 w-4" />
            {requestingId ? "Отправляем..." : "Отправить запрос на отмену"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
