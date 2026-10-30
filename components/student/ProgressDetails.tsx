"use client";

import VocalProgressSection from "@/components/student/VocalProgressSection";
import { useCabinetProgress } from "@/hooks/useCabinetProgress";
import { useStudentRetention } from "@/hooks/useStudentRetention";
import { practiceMinutes } from "@/lib/student-progress";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-studio-card px-4 py-3 ring-1 ring-studio-border">
      <p className="text-sm text-studio-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold">{value}</p>
    </div>
  );
}

/** Records, totals and test history: everything that does not need to sit on the home screen. */
export default function ProgressDetails() {
  const { progress } = useCabinetProgress();
  const { board } = useStudentRetention();
  const stats = progress?.stats;

  return (
    <div className="space-y-8">
      <section>
        <h3 className="font-display text-lg font-semibold">Рекорды</h3>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat
            label="Лучшая серия"
            value={`${board?.records.bestStreak ?? progress?.streak ?? 0} дн.`}
          />
          <Stat
            label="Минуты за неделю"
            value={
              board
                ? `${board.records.weekMin} / ${board.records.bestWeekMin}`
                : "—"
            }
          />
          <Stat
            label="Дольше фраза"
            value={
              board && board.records.bestPhraseSec > 0
                ? `${board.records.bestPhraseSec} сек`
                : "ещё нет"
            }
          />
        </div>
      </section>

      <section>
        <h3 className="font-display text-lg font-semibold">Всего</h3>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="Пение за неделю"
            value={`${practiceMinutes(stats?.practice_sec_week ?? 0)} мин`}
          />
          <Stat label="Занятий" value={String(stats?.lessons_total ?? 0)} />
          <Stat
            label="Дней практики"
            value={String(stats?.exercises_total ?? 0)}
          />
          <Stat
            label="В анализаторе за неделю"
            value={`${practiceMinutes(stats?.analyzer_sec_week ?? 0)} мин`}
          />
        </div>
      </section>

      <VocalProgressSection />
    </div>
  );
}
