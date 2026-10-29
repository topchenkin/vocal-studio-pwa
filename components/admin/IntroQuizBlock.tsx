"use client";

import { useEffect, useState } from "react";
import { ClipboardList } from "lucide-react";
import {
  INTRO_QUIZ_LABELS,
  INTRO_QUIZ_QUESTIONS,
  INTRO_QUIZ_TITLES,
} from "@/lib/intro-quiz";
import { CAT_LEVEL_LABELS } from "@/lib/cat-levels";
import { supabase } from "@/lib/supabase";
import { mapBackendError, withTimeout } from "@/lib/supabase-errors";
import type { IntroQuizRow } from "@/types";

/** What the student answered in the home-page quiz before the trial lesson. */
export default function IntroQuizBlock({
  studentId,
  mockMode,
}: {
  studentId: string;
  mockMode: boolean;
}) {
  const [row, setRow] = useState<IntroQuizRow | null>(null);
  const [loading, setLoading] = useState(!mockMode);
  const [error, setError] = useState("");

  useEffect(() => {
    if (mockMode) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    void (async () => {
      try {
        const { data, error: loadError } = await withTimeout(
          supabase
            .from("intro_quiz_answers")
            .select("*")
            .eq("user_id", studentId)
            .maybeSingle(),
          15000
        );
        if (cancelled) return;
        if (loadError) {
          console.error("[uvs:intro-quiz] admin load failed", loadError);
          setError(mapBackendError(loadError));
          setRow(null);
        } else {
          setRow(data);
        }
      } catch (loadError) {
        if (cancelled) return;
        console.error("[uvs:intro-quiz] admin load failed", loadError);
        setError(mapBackendError(loadError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mockMode, studentId]);

  if (mockMode || loading) return null;
  if (error) return <p className="text-xs text-red-400">{error}</p>;
  if (!row) return null;

  return (
    <div className="rounded-xl bg-studio-bg/50 p-3 ring-1 ring-studio-border">
      <p className="flex items-center gap-2 text-xs font-medium text-studio-accent-light">
        <ClipboardList className="h-4 w-4" />
        Вводный тест · {CAT_LEVEL_LABELS[row.cat_level]}
      </p>
      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-[8rem_1fr]">
        {INTRO_QUIZ_QUESTIONS.map((question) => (
          <div key={question.key} className="contents">
            <dt className="text-studio-muted">{INTRO_QUIZ_TITLES[question.key]}</dt>
            <dd>
              {INTRO_QUIZ_LABELS[question.key][row[question.key]] ?? row[question.key]}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[10px] text-studio-muted">
        Уровень котика здесь только подсказка из теста, настоящий ставите вы.
      </p>
    </div>
  );
}
