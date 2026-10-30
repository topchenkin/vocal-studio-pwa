"use client";

import Link from "next/link";
import { Check, Lock, Play } from "lucide-react";
import type { RetentionBoard } from "@/lib/student-retention";
import { isExerciseRef } from "@/lib/student-retention";

export default function VoicePathStrip({
  board,
}: {
  board: RetentionBoard | null;
}) {
  if (!board || board.path.length === 0) return null;
  const current = board.path.find((node) => node.state === "current");

  return (
    <section>
      <div className="mb-3">
        <h3 className="font-display text-lg font-semibold">Тропа голоса</h3>
        <p className="text-sm text-studio-muted">
          {current
            ? `Сейчас: ${current.stage}. ${current.title}`
            : "Шаги открываются по одному."}
        </p>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {board.path.map((node) => {
          const locked = node.state === "locked";
          const className = `block min-w-[8rem] shrink-0 rounded-2xl px-3 py-3 ring-1 ${
            node.state === "current"
              ? "bg-studio-accent/15 ring-studio-accent/40"
              : "bg-studio-card ring-studio-border"
          } ${locked ? "opacity-60" : ""}`;
          const body = (
            <>
              <p className="text-xs text-studio-muted">{node.stage}</p>
              <p className="mt-1 text-sm font-medium leading-snug">{node.title}</p>
              <p className="mt-2 flex items-center gap-1 text-xs text-studio-muted">
                {node.state === "done" ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-studio-gold" />
                    Пройдено
                  </>
                ) : node.state === "current" ? (
                  <>
                    <Play className="h-3.5 w-3.5 text-studio-accent-light" />
                    Открыто
                  </>
                ) : (
                  <>
                    <Lock className="h-3.5 w-3.5" />
                    Дальше
                  </>
                )}
              </p>
            </>
          );
          return locked || !isExerciseRef(node.id) ? (
            <div key={node.id} className={className}>
              {body}
            </div>
          ) : (
            <Link
              key={node.id}
              href={`/dashboard/student/exercises#exercise-${node.id}`}
              className={className}
            >
              {body}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
