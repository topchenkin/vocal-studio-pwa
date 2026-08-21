"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarX2 } from "lucide-react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { supabase } from "@/lib/supabase";
import type { Lesson, StudentProfile } from "@/types";

function todayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDaysKey(base: string, days: number) {
  const date = new Date(`${base}T12:00:00`);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthEndKey(base: string) {
  const date = new Date(`${base}T12:00:00`);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const year = end.getFullYear();
  const month = String(end.getMonth() + 1).padStart(2, "0");
  const day = String(end.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function periodIsoBounds(fromDate: string, toDate: string) {
  const start = new Date(`${fromDate}T00:00:00`);
  const end = new Date(`${toDate}T23:59:59.999`);
  return { start: start.toISOString(), end: end.toISOString() };
}

function studentLabel(student: StudentProfile) {
  return student.full_name || student.email || `Ученик ${student.id.slice(0, 8)}`;
}

function lessonWhen(lesson: Lesson) {
  return new Date(lesson.datetime).toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BulkCancelLessonsModal({
  open,
  onClose,
  students,
  lockedStudentId,
  mockMode,
  mockLessons = [],
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  students: StudentProfile[];
  lockedStudentId?: string | null;
  mockMode?: boolean;
  mockLessons?: Lesson[];
  onDone: (result: {
    count: number;
    studentId: string;
    start: string;
    end: string;
  }) => void;
}) {
  const [studentId, setStudentId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [preview, setPreview] = useState<Lesson[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const today = todayKey();
    setFromDate(today);
    setToDate(monthEndKey(today));
    setStudentId(lockedStudentId ?? "");
    setPreview([]);
    setError("");
  }, [lockedStudentId, open]);

  const selectedStudent = students.find((student) => student.id === studentId);
  const periodValid = Boolean(fromDate && toDate && fromDate <= toDate);

  useEffect(() => {
    if (!open || !studentId || !periodValid) {
      setPreview([]);
      return;
    }

    const { start, end } = periodIsoBounds(fromDate, toDate);

    if (mockMode) {
      setPreview(
        mockLessons
          .filter(
            (lesson) =>
              lesson.student_id === studentId &&
              lesson.status === "scheduled" &&
              lesson.datetime >= start &&
              lesson.datetime <= end
          )
          .sort(
            (a, b) =>
              new Date(a.datetime).getTime() - new Date(b.datetime).getTime()
          )
      );
      return;
    }

    let cancelled = false;
    setLoadingPreview(true);
    void supabase
      .from("lessons")
      .select("*")
      .eq("student_id", studentId)
      .eq("status", "scheduled")
      .gte("datetime", start)
      .lte("datetime", end)
      .order("datetime", { ascending: true })
      .then(({ data, error: queryError }) => {
        if (cancelled) return;
        setLoadingPreview(false);
        if (queryError) {
          setError("Не удалось загрузить занятия");
          setPreview([]);
          return;
        }
        setPreview(data ?? []);
      });

    return () => {
      cancelled = true;
    };
  }, [fromDate, mockLessons, mockMode, open, periodValid, studentId, toDate]);

  const applyPreset = (kind: "week" | "month" | "30" | "year") => {
    const today = todayKey();
    setFromDate(today);
    if (kind === "week") setToDate(addDaysKey(today, 6));
    if (kind === "month") setToDate(monthEndKey(today));
    if (kind === "30") setToDate(addDaysKey(today, 29));
    if (kind === "year") setToDate(addDaysKey(today, 365));
  };

  const confirmLabel = useMemo(() => {
    const n = preview.length;
    if (n === 1) return "Отменить 1 занятие";
    if (n >= 2 && n <= 4) return `Отменить ${n} занятия`;
    return `Отменить ${n} занятий`;
  }, [preview.length]);

  const submit = async () => {
    if (!studentId || !periodValid || preview.length === 0) return;
    setSaving(true);
    setError("");
    const { start, end } = periodIsoBounds(fromDate, toDate);

    if (mockMode) {
      onDone({ count: preview.length, studentId, start, end });
      setSaving(false);
      onClose();
      return;
    }

    const { data, error: rpcError } = await supabase.rpc(
      "admin_cancel_student_lessons",
      {
        target_student_id: studentId,
        period_start: start,
        period_end: end,
      }
    );

    setSaving(false);
    if (rpcError) {
      setError(rpcError.message || "Не удалось отменить занятия");
      return;
    }
    onDone({
      count: typeof data === "number" ? data : preview.length,
      studentId,
      start,
      end,
    });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Массовая отмена" size="md">
      <div className="space-y-4">
        <p className="text-sm text-studio-muted">
          Отменятся только запланированные занятия выбранного ученика в указанном
          периоде. Ученик получит одно уведомление.
        </p>

        <label>
          <span className="mb-1.5 block text-xs font-medium text-studio-muted">
            Ученик
          </span>
          <select
            value={studentId}
            disabled={Boolean(lockedStudentId)}
            onChange={(event) => setStudentId(event.target.value)}
            className="w-full rounded-xl bg-studio-surface px-4 py-3 text-sm ring-1 ring-studio-border focus:outline-none focus:ring-studio-accent disabled:opacity-70"
          >
            <option value="">Выберите ученика</option>
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {studentLabel(student)}
              </option>
            ))}
          </select>
        </label>

        <div>
          <p className="mb-1.5 text-xs font-medium text-studio-muted">Период</p>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {(
              [
                ["week", "7 дней"],
                ["month", "Этот месяц"],
                ["30", "30 дней"],
                ["year", "Год вперёд"],
              ] as const
            ).map(([kind, label]) => (
              <button
                key={kind}
                type="button"
                onClick={() => applyPreset(kind)}
                className="rounded-lg bg-studio-surface px-2.5 py-1 text-[11px] text-studio-muted ring-1 ring-studio-border hover:text-studio-text"
              >
                {label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="mb-1.5 block text-xs text-studio-muted">С</span>
              <input
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
                className="w-full rounded-xl bg-studio-surface px-3 py-3 text-sm ring-1 ring-studio-border"
              />
            </label>
            <label>
              <span className="mb-1.5 block text-xs text-studio-muted">По</span>
              <input
                type="date"
                value={toDate}
                min={fromDate || undefined}
                onChange={(event) => setToDate(event.target.value)}
                className="w-full rounded-xl bg-studio-surface px-3 py-3 text-sm ring-1 ring-studio-border"
              />
            </label>
          </div>
        </div>

        {selectedStudent && periodValid && (
          <div className="rounded-2xl bg-studio-bg/60 p-3 ring-1 ring-studio-border">
            <p className="text-xs text-studio-muted">
              {loadingPreview
                ? "Считаем занятия…"
                : preview.length === 0
                  ? "В этом периоде запланированных занятий нет"
                  : `Будет отменено: ${preview.length}`}
            </p>
            {preview.length > 0 && (
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-sm">
                {preview.slice(0, 8).map((lesson) => (
                  <li key={lesson.id} className="text-studio-text">
                    {lessonWhen(lesson)}
                  </li>
                ))}
                {preview.length > 8 && (
                  <li className="text-studio-muted">
                    и ещё {preview.length - 8}
                  </li>
                )}
              </ul>
            )}
          </div>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        <Button
          fullWidth
          variant="danger"
          disabled={
            saving ||
            !studentId ||
            !periodValid ||
            preview.length === 0 ||
            loadingPreview
          }
          onClick={() => void submit()}
        >
          <CalendarX2 className="h-4 w-4" />
          {saving ? "Отменяем…" : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
