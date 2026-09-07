"use client";

import { practiceMinutes, type CabinetProgress } from "@/lib/student-progress";

export default function StudentActivityStrip({
  progress,
  variant,
}: {
  progress: CabinetProgress | null;
  variant: "exercises" | "lessons" | "lab";
}) {
  if (!progress) return null;
  const stats = progress.stats;
  if (variant === "exercises") {
    return (
      <p className="mb-4 text-xs text-studio-muted">
        На этой неделе: {progress.exercises_week} / {progress.targets.exercises}{" "}
        фразы · {practiceMinutes(stats.practice_sec_week)} мин пения
      </p>
    );
  }
  if (variant === "lessons") {
    return (
      <p className="mb-3 text-xs text-studio-muted">
        На этой неделе засчитано занятий: {stats.lessons_week} · всего{" "}
        {stats.lessons_total}
      </p>
    );
  }
  return (
    <p className="mb-4 text-xs text-studio-muted">
      За неделю в анализаторе {practiceMinutes(stats.analyzer_sec_week)} мин
      {stats.mixer_sec_week > 0
        ? ` · в микшере ${practiceMinutes(stats.mixer_sec_week)} мин`
        : ""}
    </p>
  );
}
