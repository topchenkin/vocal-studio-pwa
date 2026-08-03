"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRightLeft, Calendar, CheckCircle2, Clock } from "lucide-react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import type { Lesson } from "@/types";

export default function UpcomingLessons() {
  const { user } = useAuth();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestingId, setRequestingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadLessons = useCallback(async () => {
    if (!user) return;

    const { data, error: queryError } = await supabase
      .from("lessons")
      .select("*")
      .eq("student_id", user.id)
      .eq("status", "scheduled")
      .gte("datetime", new Date().toISOString())
      .order("datetime", { ascending: true })
      .limit(5);

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
      .channel(`student-lessons:${user.id}`)
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

  const requestReschedule = async (lessonId: string) => {
    setRequestingId(lessonId);
    const { error: updateError } = await supabase.rpc(
      "request_lesson_reschedule",
      { lesson_id: lessonId }
    );

    if (updateError) {
      setError("Не удалось отправить запрос. Попробуйте ещё раз.");
      console.error("Unable to request reschedule:", updateError.message);
    } else {
      setLessons((current) =>
        current.map((lesson) =>
          lesson.id === lessonId
            ? { ...lesson, reschedule_request: "pending" }
            : lesson
        )
      );
    }
    setRequestingId(null);
  };

  if (!user) return null;

  return (
    <div className="space-y-3">
      <h3 className="font-display text-lg font-semibold">Предстоящие уроки</h3>

      {loading ? (
        <div className="h-28 animate-pulse rounded-2xl bg-studio-surface ring-1 ring-studio-border" />
      ) : lessons.length === 0 ? (
        <div className="rounded-2xl bg-studio-surface p-6 text-center ring-1 ring-studio-border">
          <Calendar className="mx-auto h-8 w-8 text-studio-muted" />
          <p className="mt-2 text-sm text-studio-muted">
            Нет запланированных уроков
          </p>
        </div>
      ) : (
        lessons.map((lesson) => {
          const date = new Date(lesson.datetime);
          const requestPending = lesson.reschedule_request === "pending";

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
                </div>
              </div>
              <Badge variant="success">Запланирован</Badge>
            </div>

            {requestPending ? (
              <p className="mt-4 flex items-center gap-2 rounded-xl bg-studio-accent/10 px-3 py-2.5 text-sm text-studio-accent-light">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Запрос на перенос отправлен администратору
              </p>
            ) : (
              <div className="mt-4">
                {lesson.reschedule_request === "rejected" && (
                  <p className="mb-2 text-xs text-red-300">
                    Запрос отклонён. Можно отправить новый или написать в чат.
                  </p>
                )}
              <Button
                size="sm"
                variant="secondary"
                disabled={requestingId === lesson.id}
                onClick={() => void requestReschedule(lesson.id)}
              >
                <ArrowRightLeft className="h-4 w-4" />
                {requestingId === lesson.id
                  ? "Отправляем..."
                  : "Запросить перенос"}
              </Button>
              </div>
            )}
          </div>
          );
        })
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
