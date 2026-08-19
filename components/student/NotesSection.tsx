"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen, MessageSquare } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { realtimeTopic } from "@/lib/client-instance";
import { supabase } from "@/lib/supabase";
import type { LessonHomework } from "@/types";

export default function NotesSection() {
  const { user } = useAuth();
  const [items, setItems] = useState<LessonHomework[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("lesson_homework")
      .select("*")
      .eq("student_id", user.id)
      .order("created_at", { ascending: false });
    setItems(data ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
    if (!user) return;

    const channel = supabase
      .channel(realtimeTopic(`homework:${user.id}`))
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "lesson_homework",
          filter: `student_id=eq.${user.id}`,
        },
        () => void load()
      )
      .subscribe();

    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [load, user]);

  if (!user) return null;
  if (loading) {
    return <div className="h-56 animate-pulse rounded-2xl bg-studio-surface" />;
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl bg-studio-surface p-8 text-center ring-1 ring-studio-border">
        <BookOpen className="mx-auto h-8 w-8 text-studio-muted" />
        <p className="mt-3 text-sm text-studio-muted">
          Домашних заданий пока нет. Они появятся после урока.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <article
          key={item.id}
          className="rounded-2xl bg-studio-surface p-5 ring-1 ring-studio-border"
        >
          <p className="text-xs text-studio-muted">
            {item.lesson_datetime
              ? `После урока ${new Date(item.lesson_datetime).toLocaleString(
                  "ru-RU",
                  {
                    day: "numeric",
                    month: "long",
                    hour: "2-digit",
                    minute: "2-digit",
                  }
                )}`
              : `Выдано ${new Date(item.created_at).toLocaleDateString("ru-RU")}`}
          </p>
          <div className="mt-3 flex items-start gap-2">
            <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-studio-accent" />
            <div>
              <h3 className="font-medium">Домашнее задание</h3>
              <p className="mt-1 text-sm leading-relaxed text-studio-muted">
                {item.homework}
              </p>
            </div>
          </div>
          {item.teacher_comment && (
            <div className="mt-4 flex items-start gap-2 rounded-xl bg-studio-bg/50 p-3">
              <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-studio-gold" />
              <div>
                <p className="text-xs font-medium text-studio-gold">
                  Комментарий преподавателя
                </p>
                <p className="mt-1 text-sm text-studio-muted">
                  {item.teacher_comment}
                </p>
              </div>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
