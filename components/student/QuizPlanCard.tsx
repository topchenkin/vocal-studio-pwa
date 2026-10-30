"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { buttonSizes, buttonVariants } from "@/components/ui/Button";
import CatLevelText from "@/components/ui/CatLevelText";
import { CAT_LEVEL_IMAGES } from "@/lib/cat-levels";
import {
  computeIntroQuizResult,
  loadPendingIntroQuiz,
  type IntroQuizAnswers,
} from "@/lib/intro-quiz";
import type { CabinetProgress } from "@/lib/student-progress";
import { supabase } from "@/lib/supabase";
import { withTimeout } from "@/lib/supabase-errors";
import { cn } from "@/lib/utils";

/** Newcomer plan from the home-page quiz, shown until the first lesson is booked or done. */
export default function QuizPlanCard({
  progress,
}: {
  progress: CabinetProgress | null;
}) {
  const { user } = useAuth();
  const [answers, setAnswers] = useState<IntroQuizAnswers | null>(null);

  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await withTimeout(
          supabase
            .from("intro_quiz_answers")
            .select("goal, experience, barrier, outcome, format")
            .eq("user_id", userId)
            .maybeSingle(),
          10000
        );
        if (cancelled) return;
        if (error) {
          console.error("[uvs:intro-quiz] load failed", error);
          setAnswers(loadPendingIntroQuiz());
          return;
        }
        setAnswers(data ?? loadPendingIntroQuiz());
      } catch (error) {
        console.error("[uvs:intro-quiz] load failed", error);
        if (!cancelled) setAnswers(loadPendingIntroQuiz());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!answers || !progress) return null;
  if (progress.stats.lessons_total > 0 || progress.next_lesson) return null;

  const result = computeIntroQuizResult(answers);

  return (
    <section
      aria-label="Ваш план первых занятий"
      className="rounded-3xl bg-gradient-to-br from-studio-accent/15 via-studio-card to-studio-card p-5 ring-1 ring-studio-accent/25"
    >
      <div className="flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={CAT_LEVEL_IMAGES[result.catLevel]}
          alt=""
          className="h-20 w-20 shrink-0 bg-transparent object-contain"
        />
        <div className="min-w-0">
          <p className="text-sm font-medium text-studio-accent-light">
            Ваш план первых занятий
          </p>
          <CatLevelText
            as="h2"
            label={result.headline}
            className="mt-1 font-display text-2xl font-semibold"
          />
        </div>
      </div>

      <ol className="mt-4 space-y-2.5">
        {result.steps.map((text, index) => (
          <li key={text} className="flex items-start gap-3 text-sm">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-studio-accent/15 text-sm font-semibold text-studio-accent-light">
              {index + 1}
            </span>
            <span className="pt-0.5">{text}</span>
          </li>
        ))}
      </ol>

      <p className="mt-4 text-sm text-studio-muted">{result.trialLine}</p>
      <Link
        href="/dashboard/student/chat"
        className={cn(
          "mt-4 inline-flex min-h-11 w-full touch-manipulation items-center justify-center gap-2 font-semibold transition-all duration-300 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-studio-accent sm:w-auto",
          buttonVariants.primary,
          buttonSizes.lg
        )}
      >
        Записаться на пробный
      </Link>
    </section>
  );
}
