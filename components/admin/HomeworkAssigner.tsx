"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen, Send } from "lucide-react";
import Button from "@/components/ui/Button";
import { supabase } from "@/lib/supabase";
import type { Lesson, LessonHomework } from "@/types";

export default function HomeworkAssigner({
  studentId,
  mockMode,
}: {
  studentId: string;
  mockMode: boolean;
}) {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [history, setHistory] = useState<LessonHomework[]>([]);
  const [lessonId, setLessonId] = useState("");
  const [homework, setHomework] = useState("");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    if (mockMode) {
      setLessons([]);
      setHistory([]);
      return;
    }
    const [lessonsResult, homeworkResult] = await Promise.all([
      supabase
        .from("lessons")
        .select("*")
        .eq("student_id", studentId)
        .in("status", ["completed", "scheduled"])
        .order("datetime", { ascending: false })
        .limit(20),
      supabase
        .from("lesson_homework")
        .select("*")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    setLessons(lessonsResult.data ?? []);
    setHistory(homeworkResult.data ?? []);
  }, [mockMode, studentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const assign = async () => {
    if (!homework.trim()) return;
    setSaving(true);
    setError("");
    setSuccess("");
    if (mockMode) {
      setSaving(false);
      setSuccess("В тестовом режиме ДЗ не сохраняется");
      return;
    }
    const { error: assignError } = await supabase.rpc("admin_assign_homework", {
      target_student_id: studentId,
      homework_text: homework.trim(),
      teacher_comment_text: comment.trim(),
      target_lesson_id: lessonId || null,
    });
    setSaving(false);
    if (assignError) {
      setError(assignError.message);
      return;
    }
    setHomework("");
    setComment("");
    setLessonId("");
    setSuccess("ДЗ отправлено ученику с уведомлением");
    await load();
  };

  return (
    <div className="space-y-4 rounded-2xl bg-studio-accent/5 p-4 ring-1 ring-studio-accent/20">
      <div>
        <p className="font-medium">Домашнее задание по занятию</p>
        <p className="mt-1 text-xs text-studio-muted">
          Привяжите ДЗ к уроку из истории. Ученик получит Push и увидит задание
          в разделе «Домашние задания».
        </p>
      </div>

      <label>
        <span className="mb-1.5 block text-xs text-studio-muted">
          Урок из истории
        </span>
        <select
          value={lessonId}
          onChange={(event) => setLessonId(event.target.value)}
          className="w-full rounded-xl bg-studio-surface px-3 py-3 text-sm ring-1 ring-studio-border"
        >
          <option value="">Без привязки к уроку</option>
          {lessons.map((lesson) => (
            <option key={lesson.id} value={lesson.id}>
              {new Date(lesson.datetime).toLocaleString("ru-RU", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              · {lesson.status === "completed" ? "завершён" : "запланирован"}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span className="mb-1.5 block text-xs text-studio-muted">Задание</span>
        <textarea
          value={homework}
          onChange={(event) => setHomework(event.target.value)}
          rows={3}
          maxLength={4000}
          placeholder="Что потренировать до следующего урока"
          className="w-full resize-none rounded-xl bg-studio-surface px-3 py-3 text-sm ring-1 ring-studio-border"
        />
      </label>

      <label>
        <span className="mb-1.5 block text-xs text-studio-muted">
          Комментарий преподавателя
        </span>
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          rows={2}
          maxLength={2000}
          className="w-full resize-none rounded-xl bg-studio-surface px-3 py-3 text-sm ring-1 ring-studio-border"
        />
      </label>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {success && <p className="text-sm text-emerald-400">{success}</p>}

      <Button
        fullWidth
        disabled={!homework.trim() || saving}
        onClick={() => void assign()}
      >
        <Send className="h-4 w-4" />
        {saving ? "Отправляем…" : "Выдать ДЗ и уведомить"}
      </Button>

      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-studio-muted">
          История заданий
        </p>
        {history.length === 0 ? (
          <p className="text-xs text-studio-muted">Пока пусто</p>
        ) : (
          history.map((item) => (
            <article
              key={item.id}
              className="rounded-xl bg-studio-surface p-3 ring-1 ring-studio-border"
            >
              <div className="flex items-center gap-2 text-[10px] text-studio-muted">
                <BookOpen className="h-3.5 w-3.5" />
                {item.lesson_datetime
                  ? new Date(item.lesson_datetime).toLocaleDateString("ru-RU")
                  : new Date(item.created_at).toLocaleDateString("ru-RU")}
              </div>
              <p className="mt-1 text-sm">{item.homework}</p>
              {item.teacher_comment && (
                <p className="mt-1 text-xs text-studio-muted">
                  {item.teacher_comment}
                </p>
              )}
            </article>
          ))
        )}
      </div>
    </div>
  );
}
