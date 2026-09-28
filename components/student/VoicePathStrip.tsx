"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import type { RetentionBoard } from "@/lib/student-retention";
import { isExerciseRef } from "@/lib/student-retention";

export default function VoicePathStrip({
  board,
}: {
  board: RetentionBoard | null;
}) {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    setReduce(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  if (!board || board.path.length === 0) return null;
  const current = board.path.find((node) => node.state === "current");

  return (
    <section>
      <div className="mb-3">
        <h3 className="font-display text-lg font-semibold">Тропа голоса</h3>
        <p className="text-xs text-studio-muted">
          {current
            ? `Сейчас: ${current.stage}. ${current.title}`
            : "Шаги открываются по одному."}
        </p>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {board.path.map((node) => {
          const href = isExerciseRef(node.id)
            ? `/dashboard/student/exercises#exercise-${node.id}`
            : "/dashboard/student";
          const locked = node.state === "locked";
          return (
            <Link
              key={node.id}
              href={locked ? "/dashboard/student" : href}
              aria-disabled={locked}
              className={`min-w-[7.5rem] shrink-0 rounded-2xl px-3 py-3 ring-1 ${
                node.state === "current"
                  ? "bg-studio-accent/15 ring-studio-accent/40"
                  : "bg-studio-card ring-studio-border"
              } ${locked ? "opacity-50" : ""}`}
            >
              <p className="text-[10px] uppercase tracking-[0.14em] text-studio-muted">
                {node.stage}
              </p>
              <p className="mt-1 text-sm font-medium leading-snug">{node.title}</p>
              <p className="mt-2 text-[11px] text-studio-muted">
                {node.state === "done"
                  ? "Пройдено"
                  : node.state === "current"
                    ? "Открыто"
                    : "Дальше"}
              </p>
              {node.state === "current" && !reduce && (
                <motion.span
                  className="mt-2 block h-1 rounded-full bg-emerald-400"
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 1.8, repeat: Infinity }}
                />
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
