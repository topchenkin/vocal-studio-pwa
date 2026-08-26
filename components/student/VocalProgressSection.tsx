"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, TrendingUp } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import VocalReportCard from "@/components/ai/VocalReportCard";
import {
  listVocalTestResults,
  type VocalTestResultRow,
} from "@/lib/vocal-test-results";
import { parseVocalReportPayload } from "@/lib/vocal-report-payload";

function groupKey(item: VocalTestResultRow): string {
  return item.mode === "scale"
    ? "scale"
    : `note:${item.target_label || "?"}`;
}

function groupTitle(item: VocalTestResultRow): string {
  return item.mode === "scale" ? "Гамма C–E–G" : `Нота ${item.target_label}`;
}

function attemptsWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "попытка";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "попытки";
  return "попыток";
}

function reviewLabel(status: VocalTestResultRow["review_status"]): string {
  if (status === "approved") return "засчитан";
  if (status === "pending") return "у преподавателя";
  if (status === "rejected") return "не засчитан";
  return "";
}

export default function VocalProgressSection() {
  const { user, profile } = useAuth();
  const [items, setItems] = useState<VocalTestResultRow[]>([]);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
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

  const groups = useMemo(() => {
    const map = new Map<
      string,
      { key: string; title: string; items: VocalTestResultRow[] }
    >();
    for (const item of items) {
      const key = groupKey(item);
      const current = map.get(key);
      if (current) {
        current.items.push(item);
      } else {
        map.set(key, { key, title: groupTitle(item), items: [item] });
      }
    }
    return [...map.values()].sort(
      (a, b) =>
        new Date(b.items[0]?.created_at ?? 0).getTime() -
        new Date(a.items[0]?.created_at ?? 0).getTime()
    );
  }, [items]);

  if (!user) return null;

  return (
    <section>
      <h3 className="font-display text-lg font-semibold">История тестов</h3>
      <p className="mb-3 text-xs text-studio-muted">
        Сгруппировано по нотам и гамме — так видно, как растёт каждая.
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
        <ul className="space-y-3">
          {groups.map((group) => {
            const chronological = [...group.items].reverse();
            const maxScore = Math.max(
              100,
              ...group.items.map((item) => item.overall_score),
              1
            );
            const latest = group.items[0];
            const open = openGroup === group.key;
            return (
              <li
                key={group.key}
                className="rounded-2xl bg-studio-surface ring-1 ring-studio-border"
              >
                <button
                  type="button"
                  onClick={() => {
                    setOpenGroup(open ? null : group.key);
                    setOpenId(null);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{group.title}</p>
                    <p className="mt-0.5 text-xs text-studio-muted">
                      {group.items.length} {attemptsWord(group.items.length)}
                      {latest
                        ? ` · последняя ${new Date(
                            latest.created_at
                          ).toLocaleDateString("ru-RU", {
                            day: "numeric",
                            month: "short",
                          })}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex h-10 w-24 items-end gap-px">
                    {chronological.map((item) => (
                      <div
                        key={item.id}
                        className="flex-1 rounded-sm bg-gradient-to-t from-studio-accent to-amber-300"
                        style={{
                          height: `${Math.max(
                            12,
                            (item.overall_score / maxScore) * 100
                          )}%`,
                        }}
                      />
                    ))}
                  </div>
                  <span className="font-display text-xl font-semibold text-studio-accent-light">
                    {latest?.overall_score}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-studio-muted transition ${
                      open ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {open && (
                  <ul className="space-y-2 border-t border-studio-border px-3 py-3">
                    {group.items.map((item) => {
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
                      const rowOpen = openId === item.id;
                      const review = reviewLabel(item.review_status);
                      return (
                        <li
                          key={item.id}
                          className="rounded-xl bg-studio-bg/60 ring-1 ring-studio-border"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setOpenId(rowOpen ? null : item.id)
                            }
                            className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                          >
                            <span className="text-sm">
                              {new Date(item.created_at).toLocaleString("ru-RU", {
                                day: "numeric",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                              {review ? (
                                <span className="ml-2 text-xs text-studio-muted">
                                  · {review}
                                </span>
                              ) : null}
                            </span>
                            <span className="font-display text-lg font-semibold text-studio-accent-light">
                              {item.overall_score}
                            </span>
                          </button>
                          {rowOpen && (
                            <div className="border-t border-studio-border px-2 py-2">
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
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
