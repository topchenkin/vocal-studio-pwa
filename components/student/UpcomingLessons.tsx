"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRightLeft,
  Calendar,
  CalendarX2,
  Cat,
  CheckCircle2,
  Clock,
  Fish,
  List,
  Snowflake,
} from "lucide-react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import SbpPaymentSheet, {
  type PaymentPurpose,
} from "@/components/payment/SbpPaymentSheet";
import MonthCalendar, { localDateKey } from "@/components/calendar/MonthCalendar";
import { useAuth } from "@/context/AuthContext";
import { realtimeTopic } from "@/lib/client-instance";
import { supabase } from "@/lib/supabase";
import type { Lesson } from "@/types";

const STUDIO_TZ = "Asia/Yekaterinburg";

function yekatDateKey(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: STUDIO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatRub(amount: number) {
  return `${amount.toLocaleString("ru-RU")} ₽`;
}

export default function UpcomingLessons() {
  const { user, profile, refreshProfile } = useAuth();
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
  const [payment, setPayment] = useState<PaymentPurpose | null>(null);

  const payType = profile?.lesson_pay_type;
  const lessonPrice = Number(profile?.custom_lesson_price) || 0;
  const abonementPrice = Number(profile?.custom_abonement_price) || 0;
  const lessonsBalance = Number(profile?.lessons_balance) || 0;
  const abonementCovered = payType === "abonement" && lessonsBalance > 0;

  const loadLessons = useCallback(async () => {
    if (!user) return;

    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error: queryError } = await supabase
      .from("lessons")
      .select("*")
      .eq("student_id", user.id)
      .eq("status", "scheduled")
      .gte("datetime", since)
      .order("datetime", { ascending: true })
      .limit(20);

    if (queryError) {
      setError("Не удалось загрузить расписание");
      console.error("Unable to load lessons:", queryError.message);
    } else {
      const now = Date.now();
      const rows = (data ?? []).filter((lesson) => {
        const at = new Date(lesson.datetime).getTime();
        if (at >= now) return true;
        return payType === "one_time" && !lesson.paid_at;
      });
      setLessons(rows);
      setError("");
    }
    setLoading(false);
  }, [payType, user]);

  useEffect(() => {
    void loadLessons();
    const refresh = () => {
      void loadLessons();
      void refreshProfile();
    };
    window.addEventListener("uvs-lesson-booked", refresh);
    window.addEventListener("uvs-profile-updated", refresh);
    window.addEventListener("focus", refresh);

    if (!user) {
      return () => {
        window.removeEventListener("uvs-lesson-booked", refresh);
        window.removeEventListener("uvs-profile-updated", refresh);
        window.removeEventListener("focus", refresh);
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
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${user.id}`,
        },
        () => {
          void refreshProfile();
          void loadLessons();
        }
      )
      .subscribe();

    return () => {
      window.removeEventListener("uvs-lesson-booked", refresh);
      window.removeEventListener("uvs-profile-updated", refresh);
      window.removeEventListener("focus", refresh);
      void supabase.removeChannel(channel);
    };
  }, [loadLessons, refreshProfile, user]);

  const upcomingFuture = useMemo(
    () => lessons.filter((lesson) => new Date(lesson.datetime).getTime() >= Date.now()),
    [lessons]
  );
  const firstUpcomingId = upcomingFuture[0]?.id ?? lessons[0]?.id ?? null;
  const todayKey = yekatDateKey(new Date());
  const nearestUnpaidOneTime = useMemo(
    () =>
      payType === "one_time"
        ? lessons.find((lesson) => !lesson.paid_at) ?? null
        : null,
    [lessons, payType]
  );
  const highlightUnpaidToday =
    Boolean(nearestUnpaidOneTime) &&
    yekatDateKey(nearestUnpaidOneTime!.datetime) === todayKey;

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
            Запись делает преподаватель. Здесь можно оплатить, запросить перенос
            или отмену.
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
          const isFuture = date.getTime() >= Date.now();
          const isFirstUpcoming = lesson.id === firstUpcomingId;
          const frozen =
            payType === "abonement" &&
            !abonementCovered &&
            isFuture &&
            !isFirstUpcoming;
          const paid = Boolean(lesson.paid_at) || abonementCovered;
          const showAbonementPay =
            payType === "abonement" &&
            !abonementCovered &&
            isFirstUpcoming &&
            isFuture;
          const showLessonPay = payType === "one_time" && !lesson.paid_at;
          const catHighlight =
            payType === "one_time" &&
            highlightUnpaidToday &&
            nearestUnpaidOneTime?.id === lesson.id;
          const endedUnpaid =
            payType === "one_time" && !lesson.paid_at && !isFuture;

          return (
            <div
              key={lesson.id}
              className={
                frozen
                  ? "relative overflow-hidden rounded-2xl bg-studio-surface/70 p-4 ring-1 ring-cyan-300/20"
                  : catHighlight
                    ? "relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-300/10 via-studio-surface to-studio-accent/15 p-4 ring-1 ring-amber-300/35 shadow-[0_0_28px_rgba(251,191,36,0.12)]"
                    : endedUnpaid
                      ? "rounded-2xl bg-studio-surface p-4 ring-1 ring-studio-border"
                      : "rounded-2xl bg-studio-surface p-4 ring-1 ring-studio-border"
              }
            >
              {frozen ? (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(186,230,253,0.18),transparent_46%),linear-gradient(135deg,rgba(165,180,252,0.08),transparent_55%)]"
                />
              ) : null}

              <div className="relative flex items-start justify-between gap-3">
                <div
                  className={`flex min-w-0 items-center gap-3 ${
                    frozen ? "opacity-55" : ""
                  }`}
                >
                  <div
                    className={`flex h-12 w-12 flex-col items-center justify-center rounded-xl text-xs ${
                      frozen
                        ? "bg-cyan-300/10 text-cyan-100/80"
                        : catHighlight
                          ? "bg-amber-300/15 text-amber-200"
                          : "bg-studio-accent/10"
                    }`}
                  >
                    <span
                      className={`font-bold ${
                        frozen
                          ? "text-cyan-100"
                          : catHighlight
                            ? "text-amber-200"
                            : "text-studio-accent"
                      }`}
                    >
                      {date.getDate()}
                    </span>
                    <span className="text-[10px] text-studio-muted">
                      {date.toLocaleDateString("ru-RU", { month: "short" })}
                    </span>
                  </div>
                  <div className="min-w-0">
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
                    {frozen ? (
                      <p className="mt-1 flex items-center gap-1 text-[11px] text-cyan-100/80">
                        <Snowflake className="h-3 w-3" />
                        Заморожено до оплаты абонемента
                      </p>
                    ) : null}
                    {catHighlight ? (
                      <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-100/90">
                        <Cat className="h-3 w-3" />
                        Котик, урок сегодня — можно кинуть корм
                      </p>
                    ) : null}
                    {endedUnpaid ? (
                      <p className="mt-1 flex items-center gap-1 text-[11px] text-studio-muted">
                        <Cat className="h-3 w-3" />
                        Урок уже прошёл, котик всё ещё ждёт корм
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="relative flex shrink-0 flex-col items-end gap-1.5">
                  {showAbonementPay ? (
                    <>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-red-400">
                        Не оплачен
                      </p>
                      {abonementPrice > 0 ? (
                        <Button
                          size="sm"
                          onClick={() =>
                            setPayment({
                              type: "abonement",
                              amount: abonementPrice,
                              lessonsCount: 8,
                            })
                          }
                        >
                          Оплатить абонемент
                        </Button>
                      ) : (
                        <p className="max-w-[9.5rem] text-right text-[11px] text-studio-muted">
                          Стоимость абонемента ещё не указана
                        </p>
                      )}
                      {abonementPrice > 0 ? (
                        <p className="text-[11px] text-studio-muted">
                          {formatRub(abonementPrice)}
                        </p>
                      ) : null}
                    </>
                  ) : showLessonPay ? (
                    <>
                      {catHighlight || endedUnpaid ? (
                        <p
                          className={
                            catHighlight
                              ? "flex items-center gap-1 text-[11px] font-semibold text-amber-200"
                              : "text-[11px] font-medium text-studio-muted"
                          }
                        >
                          {catHighlight ? <Fish className="h-3 w-3" /> : null}
                          Не оплачен
                        </p>
                      ) : null}
                      {lessonPrice > 0 ? (
                        <Button
                          size="sm"
                          variant={catHighlight ? "primary" : "secondary"}
                          onClick={() =>
                            setPayment({
                              type: "lesson",
                              amount: lessonPrice,
                              lessonId: lesson.id,
                            })
                          }
                        >
                          Оплатить
                        </Button>
                      ) : (
                        <p className="max-w-[9.5rem] text-right text-[11px] text-studio-muted">
                          Стоимость урока ещё не указана
                        </p>
                      )}
                      {lessonPrice > 0 ? (
                        <p className="text-[11px] text-studio-muted">
                          {formatRub(lessonPrice)}
                        </p>
                      ) : null}
                    </>
                  ) : paid && payType === "one_time" ? (
                    <Badge variant="success">Оплачен</Badge>
                  ) : frozen ? (
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan-300/10 ring-1 ring-cyan-200/20">
                      <Snowflake className="h-4 w-4 text-cyan-100/80" />
                    </span>
                  ) : (
                    <Badge variant="success">Запланирован</Badge>
                  )}
                </div>
              </div>

              {requestPending ? (
                <p className="relative mt-4 flex items-center gap-2 rounded-xl bg-studio-accent/10 px-3 py-2.5 text-sm text-studio-accent-light">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  {cancelPending
                    ? "Запрос на отмену отправлен преподавателю"
                    : "Запрос на перенос отправлен преподавателю"}
                </p>
              ) : (
                <div className={`relative mt-4 ${frozen ? "opacity-70" : ""}`}>
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
                      variant="secondary"
                      disabled={requestingId === lesson.id}
                      onClick={() => {
                        setCancelLesson(lesson);
                        setNote("");
                      }}
                    >
                      <CalendarX2 className="h-4 w-4" />
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

      {payment ? (
        <SbpPaymentSheet
          open
          purpose={payment}
          onClose={() => setPayment(null)}
          onSuccess={() => {
            void refreshProfile();
            void loadLessons();
          }}
        />
      ) : null}

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
            disabled={Boolean(requestingId)}
            onClick={() => void requestCancel()}
          >
            <CalendarX2 className="h-4 w-4" />
            {requestingId ? "Отправляем..." : "Отправить запрос на отмену"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
