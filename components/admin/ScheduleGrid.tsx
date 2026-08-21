"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Plus,
  UserRound,
  LayoutGrid,
  List,
  CalendarClock,
  UserPlus,
  XCircle,
} from "lucide-react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import NumberInput from "@/components/ui/NumberInput";
import MonthCalendar, {
  localDateKey,
} from "@/components/calendar/MonthCalendar";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import type { Lesson, StudentProfile } from "@/types";

const WEEKDAY_SHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"] as const;
const VIEW_STORAGE = "uvs-admin-schedule-view";

function weekdayShort(date: Date) {
  return WEEKDAY_SHORT[date.getDay()] ?? "—";
}

function statusBadge(status: Lesson["status"], hasStudent: boolean) {
  if (status === "completed") return <Badge variant="success">Завершён</Badge>;
  if (status === "cancelled") return <Badge variant="muted">Отменён</Badge>;
  return hasStudent ? (
    <Badge variant="gold">В расписании</Badge>
  ) : (
    <Badge>Без ученика</Badge>
  );
}

function ScheduleCard({
  lesson,
  studentLabel,
  completingId,
  highlighted,
  onComplete,
  onOpenReschedule,
  onRejectReschedule,
  onCancel,
  onAssign,
}: {
  lesson: Lesson;
  studentLabel: (studentId: string | null) => string;
  completingId: string | null;
  highlighted?: boolean;
  onComplete: (lessonId: string) => Promise<void>;
  onOpenReschedule: (lesson: Lesson) => void;
  onRejectReschedule: (lessonId: string) => Promise<void>;
  onCancel: (lessonId: string) => Promise<void>;
  onAssign: (lesson: Lesson) => void;
}) {
  const lessonDate = new Date(lesson.datetime);
  const hasStudent = Boolean(lesson.student_id);

  return (
    <article
      id={`lesson-${lesson.id}`}
      className={`scroll-mt-28 rounded-2xl bg-studio-surface p-4 ring-1 transition ${
        highlighted
          ? "ring-2 ring-studio-accent shadow-glow"
          : "ring-studio-border hover:ring-studio-accent/30"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-studio-accent/10 text-sm font-semibold text-studio-accent"
            aria-label={weekdayShort(lessonDate)}
          >
            {weekdayShort(lessonDate)}
          </div>
          <div>
            <p className="font-medium">
              {lessonDate.toLocaleDateString("ru-RU", {
                day: "numeric",
                month: "long",
              })}
            </p>
            <p className="flex items-center gap-1 text-sm text-studio-muted">
              <Clock3 className="h-3.5 w-3.5" />
              {lessonDate.toLocaleTimeString("ru-RU", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        </div>
        {statusBadge(lesson.status, hasStudent)}
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-xl bg-studio-bg/50 px-3 py-2.5 text-sm">
        <UserRound className="h-4 w-4 text-studio-muted" />
        <span className={hasStudent ? "text-studio-text" : "text-studio-muted"}>
          {studentLabel(lesson.student_id)}
        </span>
      </div>

      {lesson.is_recurring ? (
        <p className="mt-3 text-xs text-studio-accent-light">
          Повторяется каждую неделю
        </p>
      ) : null}

      {lesson.reschedule_request === "pending" && (
        <div className="mt-3 rounded-xl bg-studio-gold/10 p-3 ring-1 ring-studio-gold/20">
          <p className="text-xs text-studio-gold">Запрошен перенос урока</p>
          {lesson.preferred_reschedule_at ? (
            <p className="mt-1 text-xs text-studio-muted">
              Желаемое время:{" "}
              {new Date(lesson.preferred_reschedule_at).toLocaleString("ru-RU", {
                day: "numeric",
                month: "long",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          ) : null}
          {lesson.reschedule_note ? (
            <p className="mt-1 text-xs text-studio-muted">
              Комментарий: {lesson.reschedule_note}
            </p>
          ) : null}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => onOpenReschedule(lesson)}
              className="rounded-lg bg-studio-accent px-3 py-1.5 text-xs text-white"
            >
              Перенести
            </button>
            <button
              type="button"
              onClick={() => void onRejectReschedule(lesson.id)}
              className="rounded-lg bg-studio-card px-3 py-1.5 text-xs text-studio-muted"
            >
              Отклонить
            </button>
          </div>
        </div>
      )}

      {lesson.status === "open" && (
        <Button
          className="mt-4"
          fullWidth
          variant="secondary"
          onClick={() => onAssign(lesson)}
        >
          <UserPlus className="h-4 w-4" />
          Назначить ученика
        </Button>
      )}

      {lesson.status === "scheduled" && hasStudent && (
        <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
          <Button
            fullWidth
            variant="secondary"
            disabled={completingId === lesson.id}
            onClick={() => void onComplete(lesson.id)}
          >
            <CheckCircle2 className="h-4 w-4" />
            {completingId === lesson.id ? "Завершаем..." : "Завершить"}
          </Button>
          <button
            type="button"
            onClick={() => void onCancel(lesson.id)}
            className="rounded-xl px-3 text-studio-muted ring-1 ring-studio-border hover:text-red-400"
            aria-label="Отменить урок"
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      )}
    </article>
  );
}

export default function ScheduleGrid() {
  const { isMockAdmin } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const focusLessonId = searchParams.get("lesson");
  const focusDate = searchParams.get("date");
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [createStudentId, setCreateStudentId] = useState("");
  const [weeklyRepeat, setWeeklyRepeat] = useState(false);
  const [weeklyCount, setWeeklyCount] = useState(8);
  const [saving, setSaving] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [rescheduleLesson, setRescheduleLesson] = useState<Lesson | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [assignLesson, setAssignLesson] = useState<Lesson | null>(null);
  const [assignStudentId, setAssignStudentId] = useState("");
  const appliedFocus = useRef<string | null>(null);

  const lessonsByDate = useMemo(
    () =>
      lessons.reduce<Record<string, Lesson[]>>((result, lesson) => {
        const key = localDateKey(lesson.datetime);
        result[key] = [...(result[key] ?? []), lesson];
        return result;
      }, {}),
    [lessons]
  );

  const pendingDates = useMemo(
    () =>
      new Set(
        lessons
          .filter((lesson) => lesson.reschedule_request === "pending")
          .map((lesson) => localDateKey(lesson.datetime))
      ),
    [lessons]
  );

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(VIEW_STORAGE);
      if (stored === "list" || stored === "calendar") setView(stored);
    } catch {
      /* private mode */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(VIEW_STORAGE, view);
    } catch {
      /* private mode */
    }
  }, [view]);

  useEffect(() => {
    const focusKey = `${focusLessonId ?? ""}:${focusDate ?? ""}`;
    if (!focusLessonId && !focusDate) {
      if (selectedDate && lessonsByDate[selectedDate]) return;
      const today = localDateKey(new Date());
      const firstFuture =
        Object.keys(lessonsByDate).find((key) => key >= today) ??
        Object.keys(lessonsByDate)[0] ??
        null;
      setSelectedDate(firstFuture);
      return;
    }

    if (appliedFocus.current === focusKey) return;

    const focusedLesson = focusLessonId
      ? lessons.find((item) => item.id === focusLessonId)
      : undefined;
    const dateFromUrl =
      focusDate && /^\d{4}-\d{2}-\d{2}$/.test(focusDate) ? focusDate : null;
    const dateFromLesson = focusedLesson
      ? localDateKey(focusedLesson.datetime)
      : null;
    const nextDate = dateFromLesson ?? dateFromUrl;

    if (nextDate && selectedDate !== nextDate) setSelectedDate(nextDate);
    if (
      dateFromLesson ||
      (!focusLessonId && dateFromUrl) ||
      (!loading && lessons.length > 0)
    ) {
      appliedFocus.current = focusKey;
    }
  }, [
    lessonsByDate,
    selectedDate,
    focusLessonId,
    focusDate,
    lessons,
    loading,
  ]);

  useEffect(() => {
    if (!focusLessonId || loading) return;
    const timer = window.setTimeout(() => {
      document
        .getElementById(`lesson-${focusLessonId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 160);
    return () => window.clearTimeout(timer);
  }, [focusLessonId, loading, view, selectedDate, lessons.length]);

  const loadSchedule = useCallback(async () => {
    if (isMockAdmin) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(14, 0, 0, 0);
      const nextDay = new Date(tomorrow);
      nextDay.setDate(nextDay.getDate() + 1);
      nextDay.setHours(17, 30, 0, 0);

      setStudents([
        {
          id: "demo-student-anna",
          email: "anna@example.com",
          full_name: "Анна Волкова",
          role: "student",
          app_sub_tier: "premium",
          app_sub_variant: "individual",
          cat_level: "pro",
          is_active_student: true,
          lesson_pay_type: "abonement",
          custom_lesson_price: 3000,
          custom_abonement_price: 20000,
          lessons_balance: 5,
          debt_amount: 0,
        },
      ]);
      setLessons([
        {
          id: "demo-lesson-booked",
          student_id: "demo-student-anna",
          datetime: tomorrow.toISOString(),
          status: "scheduled",
          reschedule_request: "pending",
          is_recurring: true,
        },
        {
          id: "demo-lesson-2",
          student_id: "demo-student-anna",
          datetime: nextDay.toISOString(),
          status: "scheduled",
          reschedule_request: "none",
          is_recurring: false,
        },
      ]);
      setLoading(false);
      return;
    }

    const [lessonsResult, studentsResult] = await Promise.all([
      supabase.from("lessons").select("*").order("datetime", { ascending: true }),
      supabase.from("profiles").select("*").eq("role", "student"),
    ]);

    if (lessonsResult.error || studentsResult.error) {
      setError("Не удалось загрузить расписание");
      console.error(
        "Unable to load schedule:",
        lessonsResult.error?.message ?? studentsResult.error?.message
      );
    } else {
      setLessons(lessonsResult.data ?? []);
      setStudents(studentsResult.data ?? []);
      setError("");
    }
    setLoading(false);
  }, [isMockAdmin]);

  useEffect(() => {
    void loadSchedule();
  }, [loadSchedule]);

  const createLesson = async () => {
    if (!date || !time || !createStudentId) return;

    setSaving(true);
    setError("");
    const start = new Date(`${date}T${time}`);
    if (Number.isNaN(start.getTime())) {
      setSaving(false);
      setError("Некорректные дата или время");
      return;
    }

    const weeks = weeklyRepeat
      ? Math.max(1, Math.min(52, Number(weeklyCount) || 8))
      : 1;
    const seriesId = weeklyRepeat ? crypto.randomUUID() : null;
    const rows = Array.from({ length: weeks }, (_, index) => {
      const when = new Date(start);
      when.setDate(when.getDate() + index * 7);
      return {
        student_id: createStudentId,
        datetime: when.toISOString(),
        status: "scheduled" as const,
        reschedule_request: "none" as const,
        is_recurring: weeklyRepeat,
        series_id: seriesId,
      };
    });

    if (isMockAdmin) {
      setLessons((current) =>
        [
          ...current,
          ...rows.map((row, index) => ({
            id: `demo-lesson-${Date.now()}-${index}`,
            ...row,
          })),
        ].sort(
          (a, b) =>
            new Date(a.datetime).getTime() - new Date(b.datetime).getTime()
        )
      );
      setSaving(false);
      setCreateOpen(false);
      setDate("");
      setTime("");
      setCreateStudentId("");
      setWeeklyRepeat(false);
      showSuccess(
        weeklyRepeat
          ? `Добавлено ${weeks} еженедельных уроков`
          : "Урок добавлен в расписание"
      );
      return;
    }

    const { data, error: insertError } = await supabase
      .from("lessons")
      .insert(rows)
      .select("*");
    setSaving(false);

    if (insertError) {
      // Fallback without optional columns if migration not applied yet
      const fallbackRows = rows.map(({ student_id, datetime, status, reschedule_request }) => ({
        student_id,
        datetime,
        status,
        reschedule_request,
      }));
      const retry = await supabase.from("lessons").insert(fallbackRows).select("*");
      if (retry.error) {
        setError("Не удалось создать урок");
        console.error("Unable to create lesson:", insertError.message, retry.error.message);
        return;
      }
      setLessons((current) =>
        [...current, ...(retry.data ?? [])].sort(
          (a, b) =>
            new Date(a.datetime).getTime() - new Date(b.datetime).getTime()
        )
      );
    } else {
      setLessons((current) =>
        [...current, ...(data ?? [])].sort(
          (a, b) =>
            new Date(a.datetime).getTime() - new Date(b.datetime).getTime()
        )
      );
    }

    setCreateOpen(false);
    setDate("");
    setTime("");
    setCreateStudentId("");
    setWeeklyRepeat(false);
    showSuccess(
      weeklyRepeat
        ? `Добавлено ${weeks} еженедельных уроков`
        : "Урок добавлен в расписание"
    );
  };

  const completeLesson = async (lessonId: string) => {
    setCompletingId(lessonId);
    setError("");

    if (isMockAdmin) {
      setLessons((current) =>
        current.map((lesson) =>
          lesson.id === lessonId ? { ...lesson, status: "completed" } : lesson
        )
      );
      setCompletingId(null);
      showSuccess("Тестовый урок завершён");
      return;
    }

    const { error: completeError } = await supabase.rpc("complete_lesson", {
      lesson_id: lessonId,
    });
    setCompletingId(null);

    if (completeError) {
      setError("Не удалось завершить урок");
      console.error("Unable to complete lesson:", completeError.message);
      return;
    }

    setLessons((current) =>
      current.map((lesson) =>
        lesson.id === lessonId ? { ...lesson, status: "completed" } : lesson
      )
    );
    showSuccess("Урок завершён, баланс ученика обновлён");
  };

  const openReschedule = (lesson: Lesson) => {
    const preferred = lesson.preferred_reschedule_at
      ? new Date(lesson.preferred_reschedule_at)
      : null;
    const current =
      preferred && !Number.isNaN(preferred.getTime())
        ? preferred
        : new Date(lesson.datetime);
    setRescheduleLesson(lesson);
    setRescheduleDate(localDateKey(current));
    setRescheduleTime(
      current.toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
      })
    );
  };

  const resolveReschedule = async (lessonId: string, approve: boolean) => {
    const newDatetime =
      approve && rescheduleDate && rescheduleTime
        ? new Date(`${rescheduleDate}T${rescheduleTime}`).toISOString()
        : null;
    if (approve && !newDatetime) return;

    if (isMockAdmin) {
      setLessons((current) =>
        current.map((lesson) =>
          lesson.id === lessonId
            ? {
                ...lesson,
                datetime: newDatetime ?? lesson.datetime,
                reschedule_request: approve ? "approved" : "rejected",
                preferred_reschedule_at: null,
                reschedule_note: null,
              }
            : lesson
        )
      );
    } else {
      const { error: resolveError } = await supabase.rpc(
        "admin_resolve_reschedule",
        {
          lesson_id: lessonId,
          approve,
          new_datetime: newDatetime,
        }
      );
      if (resolveError) {
        setError(`Не удалось обработать перенос: ${resolveError.message}`);
        return;
      }
      await loadSchedule();
    }
    setRescheduleLesson(null);
    const params = new URLSearchParams(searchParams.toString());
    if (params.has("lesson") || params.has("date")) {
      params.delete("lesson");
      params.delete("date");
      router.replace(`/dashboard/admin?${params.toString()}`, { scroll: false });
    }
    showSuccess(approve ? "Урок перенесён" : "Запрос на перенос отклонён");
  };

  const cancelLesson = async (lessonId: string) => {
    if (isMockAdmin) {
      setLessons((current) =>
        current.map((lesson) =>
          lesson.id === lessonId ? { ...lesson, status: "cancelled" } : lesson
        )
      );
    } else {
      const { error: cancelError } = await supabase.rpc("admin_cancel_lesson", {
        lesson_id: lessonId,
      });
      if (cancelError) {
        setError(`Не удалось отменить урок: ${cancelError.message}`);
        return;
      }
      await loadSchedule();
    }
    showSuccess("Урок отменён");
  };

  const assignStudent = async () => {
    if (!assignLesson || !assignStudentId) return;
    if (isMockAdmin) {
      setLessons((current) =>
        current.map((lesson) =>
          lesson.id === assignLesson.id
            ? {
                ...lesson,
                student_id: assignStudentId,
                status: "scheduled",
              }
            : lesson
        )
      );
    } else {
      const { error: assignError } = await supabase.rpc("admin_assign_lesson", {
        lesson_id: assignLesson.id,
        target_student_id: assignStudentId,
      });
      if (assignError) {
        setError(`Не удалось назначить ученика: ${assignError.message}`);
        return;
      }
      await loadSchedule();
    }
    setAssignLesson(null);
    setAssignStudentId("");
    showSuccess("Ученик записан на урок");
  };

  const showSuccess = (message: string) => {
    setSuccess(message);
    window.setTimeout(() => setSuccess(""), 3000);
  };

  const studentLabel = (studentId: string | null) => {
    if (!studentId) return "Свободно";
    const profile = students.find((student) => student.id === studentId);
    return profile
      ? profile.full_name || profile.email || `Ученик ${profile.id.slice(0, 8)}`
      : `Ученик ${studentId.slice(0, 8)}`;
  };

  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            className="h-40 animate-pulse rounded-2xl bg-studio-surface ring-1 ring-studio-border"
          />
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h3 className="font-display text-xl font-semibold">Расписание</h3>
            <p className="text-sm text-studio-muted">
              Уроки назначает преподаватель · ученик может запросить перенос
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-xl bg-studio-surface p-1 ring-1 ring-studio-border">
              <button
                type="button"
                onClick={() => setView("calendar")}
                className={`rounded-lg p-2 transition ${
                  view === "calendar"
                    ? "bg-studio-accent/20 text-studio-accent-light"
                    : "text-studio-muted"
                }`}
                aria-label="Календарь"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setView("list")}
                className={`rounded-lg p-2 transition ${
                  view === "list"
                    ? "bg-studio-accent/20 text-studio-accent-light"
                    : "text-studio-muted"
                }`}
                aria-label="Список"
              >
                <List className="h-4 w-4" />
              </button>
            </div>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Добавить урок
            </Button>
          </div>
        </div>

        {lessons.some((l) => l.reschedule_request === "pending") && (
          <div className="rounded-2xl bg-studio-gold/10 px-4 py-3 text-sm text-studio-gold ring-1 ring-studio-gold/25">
            Есть запросы на перенос — в календаре такие дни с жёлтой точкой.
          </div>
        )}

        {success && (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400 ring-1 ring-emerald-500/20">
            <CheckCircle2 className="h-4 w-4" />
            {success}
          </div>
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}

        {view === "calendar" && lessons.length > 0 && (
          <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
            <MonthCalendar
              availableDates={new Set(Object.keys(lessonsByDate))}
              highlightDates={pendingDates}
              selectedDate={selectedDate}
              onSelect={setSelectedDate}
              allowPast
            />
            <div>
              <p className="mb-3 font-medium capitalize">
                {selectedDate
                  ? new Date(`${selectedDate}T12:00:00`).toLocaleDateString(
                      "ru-RU",
                      { weekday: "long", day: "numeric", month: "long" }
                    )
                  : "Выберите день"}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {(selectedDate ? lessonsByDate[selectedDate] ?? [] : []).map(
                  (lesson) => (
                    <ScheduleCard
                      key={lesson.id}
                      lesson={lesson}
                      studentLabel={studentLabel}
                      completingId={completingId}
                      highlighted={focusLessonId === lesson.id}
                      onComplete={completeLesson}
                      onOpenReschedule={openReschedule}
                      onRejectReschedule={(lessonId) =>
                        resolveReschedule(lessonId, false)
                      }
                      onCancel={cancelLesson}
                      onAssign={(lesson) => {
                        setAssignLesson(lesson);
                        setAssignStudentId("");
                      }}
                    />
                  )
                )}
              </div>
            </div>
          </div>
        )}

        {view === "list" && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ...lessons.filter((lesson) => lesson.id === focusLessonId),
              ...lessons.filter((lesson) => lesson.id !== focusLessonId),
            ].map((lesson) => (
              <ScheduleCard
                key={lesson.id}
                lesson={lesson}
                studentLabel={studentLabel}
                completingId={completingId}
                highlighted={focusLessonId === lesson.id}
                onComplete={completeLesson}
                onOpenReschedule={openReschedule}
                onRejectReschedule={(lessonId) =>
                  resolveReschedule(lessonId, false)
                }
                onCancel={cancelLesson}
                onAssign={(targetLesson) => {
                  setAssignLesson(targetLesson);
                  setAssignStudentId("");
                }}
              />
            ))}
          </div>
        )}

        {lessons.length === 0 && (
          <div className="rounded-2xl bg-studio-surface p-10 text-center ring-1 ring-studio-border">
            <CalendarDays className="mx-auto h-9 w-9 text-studio-muted" />
            <p className="mt-3 text-sm text-studio-muted">
              Пока нет уроков — добавьте занятие ученику
            </p>
          </div>
        )}
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Добавить урок"
        size="sm"
      >
        <div className="space-y-4">
          <label>
            <span className="mb-1.5 block text-xs font-medium text-studio-muted">
              Ученик
            </span>
            <select
              value={createStudentId}
              onChange={(event) => setCreateStudentId(event.target.value)}
              className="w-full rounded-xl bg-studio-surface px-4 py-3 text-sm ring-1 ring-studio-border focus:outline-none focus:ring-studio-accent"
            >
              <option value="">Выберите ученика</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.full_name || student.email || student.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-medium text-studio-muted">
              Дата
            </span>
            <input
              type="date"
              value={date}
              min={new Date().toISOString().split("T")[0]}
              onChange={(event) => setDate(event.target.value)}
              className="w-full rounded-xl bg-studio-surface px-4 py-3 text-sm ring-1 ring-studio-border focus:outline-none focus:ring-studio-accent"
            />
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-medium text-studio-muted">
              Время
            </span>
            <input
              type="time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
              className="w-full rounded-xl bg-studio-surface px-4 py-3 text-sm ring-1 ring-studio-border focus:outline-none focus:ring-studio-accent"
            />
          </label>
          <label className="flex items-start gap-3 rounded-xl bg-studio-surface px-4 py-3 ring-1 ring-studio-border">
            <input
              type="checkbox"
              checked={weeklyRepeat}
              onChange={(event) => setWeeklyRepeat(event.target.checked)}
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-medium">
                Повторять каждую неделю
              </span>
              <span className="mt-0.5 block text-xs text-studio-muted">
                Сразу создаст серию уроков в календаре на выбранное время
              </span>
            </span>
          </label>
          {weeklyRepeat && (
            <label>
              <span className="mb-1.5 block text-xs font-medium text-studio-muted">
                Сколько недель подряд
              </span>
              <NumberInput
                min={2}
                max={52}
                value={weeklyCount}
                emptyValue={8}
                onChange={setWeeklyCount}
              />
            </label>
          )}
          <Button
            fullWidth
            onClick={() => void createLesson()}
            disabled={!date || !time || !createStudentId || saving}
          >
            <Plus className="h-4 w-4" />
            {saving
              ? "Сохраняем..."
              : weeklyRepeat
                ? `Создать ${weeklyCount} уроков`
                : "Добавить урок"}
          </Button>
        </div>
      </Modal>

      <Modal
        open={Boolean(rescheduleLesson)}
        onClose={() => setRescheduleLesson(null)}
        title="Подтвердить перенос"
        size="sm"
      >
        <div className="space-y-4">
          {rescheduleLesson?.reschedule_note ? (
            <p className="rounded-xl bg-studio-surface px-3 py-2 text-xs text-studio-muted ring-1 ring-studio-border">
              Комментарий ученика: {rescheduleLesson.reschedule_note}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="mb-1.5 block text-xs text-studio-muted">
                Новая дата
              </span>
              <input
                type="date"
                value={rescheduleDate}
                onChange={(event) => setRescheduleDate(event.target.value)}
                className="w-full rounded-xl bg-studio-surface px-3 py-3 text-sm ring-1 ring-studio-border"
              />
            </label>
            <label>
              <span className="mb-1.5 block text-xs text-studio-muted">
                Новое время
              </span>
              <input
                type="time"
                value={rescheduleTime}
                onChange={(event) => setRescheduleTime(event.target.value)}
                className="w-full rounded-xl bg-studio-surface px-3 py-3 text-sm ring-1 ring-studio-border"
              />
            </label>
          </div>
          <p className="text-xs text-studio-muted">
            Ученик получит Push и email через 5 минут, если не прочитает
            уведомление.
          </p>
          <Button
            fullWidth
            disabled={!rescheduleDate || !rescheduleTime}
            onClick={() =>
              rescheduleLesson &&
              void resolveReschedule(rescheduleLesson.id, true)
            }
          >
            <CalendarClock className="h-4 w-4" />
            Подтвердить новое время
          </Button>
          <Button
            fullWidth
            variant="secondary"
            onClick={() =>
              rescheduleLesson &&
              void resolveReschedule(rescheduleLesson.id, false)
            }
          >
            Отклонить перенос
          </Button>
        </div>
      </Modal>

      <Modal
        open={Boolean(assignLesson)}
        onClose={() => setAssignLesson(null)}
        title="Назначить ученика"
        size="sm"
      >
        <div className="space-y-4">
          <select
            value={assignStudentId}
            onChange={(event) => setAssignStudentId(event.target.value)}
            className="w-full rounded-xl bg-studio-surface px-4 py-3 text-sm ring-1 ring-studio-border"
          >
            <option value="">Выберите ученика</option>
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {student.full_name || student.email || student.id.slice(0, 8)}
              </option>
            ))}
          </select>
          <Button
            fullWidth
            disabled={!assignStudentId}
            onClick={() => void assignStudent()}
          >
            <UserPlus className="h-4 w-4" />
            Записать на этот слот
          </Button>
        </div>
      </Modal>
    </>
  );
}
