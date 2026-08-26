"use client";

import { useCallback, useEffect, useState } from "react";
import { TrendingUp } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import VocalReportCard from "@/components/ai/VocalReportCard";
import {
  listVocalTestResults,
  type VocalTestResultRow,
} from "@/lib/vocal-test-results";
import { parseVocalReportPayload } from "@/lib/vocal-report-payload";

export default function VocalProgressSection() {
  const { user, profile } = useAuth();
  const [items, setItems] = useState<VocalTestResultRow[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const rows = await listVocalTestResults(user.id);
      setItems(rows);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить прогресс");
    }
  }, [user]);

  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener("uvs-vocal-test-saved", refresh);
    return () => window.removeEventListener("uvs-vocal-test-saved", refresh);
  }, [load]);

  if (!user) return null;

  const chronological = [...items].reverse();
  const maxScore = Math.max(100, ...items.map((item) => item.overall_score), 1);

  return (
    <section>
      <h3 className="font-display text-lg font-semibold">История тестов</h3>
      <p className="mb-3 text-xs text-studio-muted">
        Здесь копятся ваши зачёты. Баллы к уровню котика преподаватель ставит
        после просмотра.
      </p>
      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
      {items.length === 0 ? (
        <div className="rounded-2xl bg-studio-surface p-6 text-center ring-1 ring-studio-border">
          <TrendingUp className="mx-auto h-7 w-7 text-studio-muted" />
          <p className="mt-2 text-sm text-studio-muted">
            Пока нет тестов. Пройдите зачёт выше — оценка останется на этой
            странице и уйдёт преподавателю в чат, когда отправите.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex h-24 items-end gap-1 rounded-2xl bg-studio-surface px-3 py-3 ring-1 ring-studio-border">
            {chronological.map((item) => (
              <div
                key={item.id}
                className="flex h-full flex-1 flex-col justify-end"
                title={`${item.overall_score}/100`}
              >
                <div
                  className="w-full rounded-sm bg-gradient-to-t from-studio-accent to-amber-300"
                  style={{
                    height: `${Math.max(8, (item.overall_score / maxScore) * 100)}%`,
                  }}
                />
              </div>
            ))}
          </div>
          <ul className="space-y-2">
            {items.map((item) => {
              const payload = parseVocalReportPayload(item.payload) ?? {
                v: 1 as const,
                overallScore: item.overall_score,
                pitchAccuracy: item.pitch_accuracy,
                toneStability: item.tone_stability,
                breathControl: item.breath_control,
                mode: item.mode,
                targetLabel: item.target_label,
                durationSec: Number(item.duration_sec),
                cents: [],
              };
              const open = openId === item.id;
              return (
                <li
                  key={item.id}
                  className="rounded-2xl bg-studio-surface ring-1 ring-studio-border"
                >
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : item.id)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  >
                    <span className="text-sm">
                      {item.mode === "scale"
                        ? "Гамма C–E–G"
                        : `Нота ${item.target_label}`}
                      <span className="ml-2 text-xs text-studio-muted">
                        {new Date(item.created_at).toLocaleString("ru-RU", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {item.review_status === "approved"
                          ? " · засчитан"
                          : item.review_status === "pending"
                            ? " · у преподавателя"
                            : item.review_status === "rejected"
                              ? " · не засчитан"
                              : ""}
                      </span>
                    </span>
                    <span className="font-display text-lg font-semibold text-studio-accent-light">
                      {item.overall_score}
                    </span>
                  </button>
                  {open && (
                    <div className="border-t border-studio-border px-3 py-3">
                      <VocalReportCard
                        payload={payload}
                        catLevel={profile?.cat_level}
                        compact
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
