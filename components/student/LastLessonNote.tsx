"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, ChevronRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { formatStudioDate } from "@/lib/studio-tz";
import { supabase } from "@/lib/supabase";
import { withTimeout } from "@/lib/supabase-errors";
import type { LessonHomework } from "@/types";

const FRESH_MS = 21 * 24 * 60 * 60 * 1000;

/** The teacher's latest note and homework, right on the home screen. */
export default function LastLessonNote() {
  const { user } = useAuth();
  const [note, setNote] = useState<LessonHomework | null>(null);

  const userId = user?.id;
  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const { data, error } = await withTimeout(
        supabase
          .from("lesson_homework")
          .select("*")
          .eq("student_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        10000
      );
      if (error) {
        console.error("[uvs:homework] load failed", error);
        return;
      }
      setNote(data ?? null);
    } catch (error) {
      console.error("[uvs:homework] load failed", error);
    }
  }, [userId]);

  useEffect(() => {
    void load();
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  if (!note) return null;
  const created = new Date(note.created_at).getTime();
  if (Number.isNaN(created) || Date.now() - created > FRESH_MS) return null;

  const when = note.lesson_datetime
    ? `После урока ${formatStudioDate(note.lesson_datetime, {
        day: "numeric",
        month: "long",
      })}`
    : `Задание от ${formatStudioDate(note.created_at, {
        day: "numeric",
        month: "long",
      })}`;

  return (
    <Link
      href="/dashboard/student/exercises?section=homework"
      className="block rounded-3xl bg-studio-card p-5 ring-1 ring-studio-border transition hover:ring-studio-accent/40"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-medium text-studio-accent-light">
          <BookOpen className="h-4 w-4" />
          Домашнее задание
        </p>
        <ChevronRight className="h-4 w-4 shrink-0 text-studio-muted" />
      </div>
      <p className="mt-1 text-sm text-studio-muted">{when}</p>
      <p className="mt-3 line-clamp-3 text-sm leading-relaxed">{note.homework}</p>
      {note.teacher_comment ? (
        <p className="mt-3 line-clamp-2 rounded-xl bg-studio-surface px-3 py-2.5 text-sm text-studio-muted">
          <span className="font-medium text-studio-gold">Преподаватель: </span>
          {note.teacher_comment}
        </p>
      ) : null}
    </Link>
  );
}
