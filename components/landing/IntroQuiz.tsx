"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, RotateCcw } from "lucide-react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { AuthCta } from "@/components/landing/PublicAuth";
import {
  INTRO_QUIZ_QUESTIONS,
  computeIntroQuizResult,
  loadPendingIntroQuiz,
  savePendingIntroQuiz,
  type IntroQuizAnswers,
} from "@/lib/intro-quiz";

type Phase = "intro" | "ask" | "result";

export default function IntroQuiz({ id }: { id?: string }) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Partial<IntroQuizAnswers>>({});
  const [done, setDone] = useState<IntroQuizAnswers | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const touched = useRef(false);

  // A visitor who already finished the quiz sees the same result again.
  useEffect(() => {
    const saved = loadPendingIntroQuiz();
    if (!saved) return;
    setDone(saved);
    setDraft(saved);
    setPhase("result");
  }, []);

  useEffect(() => {
    if (!touched.current) return;
    headingRef.current?.focus({ preventScroll: true });
  }, [phase, step]);

  const result = useMemo(() => (done ? computeIntroQuizResult(done) : null), [done]);
  const question = INTRO_QUIZ_QUESTIONS[step];
  const total = INTRO_QUIZ_QUESTIONS.length;

  const start = () => {
    touched.current = true;
    setStep(0);
    setDraft({});
    setPhase("ask");
  };

  const choose = (value: string) => {
    if (!question) return;
    touched.current = true;
    const next = { ...draft, [question.key]: value };
    setDraft(next);
    if (step < total - 1) {
      setStep(step + 1);
      return;
    }
    const complete = INTRO_QUIZ_QUESTIONS.every((q) => Boolean(next[q.key]));
    if (!complete) return;
    const answers = next as IntroQuizAnswers;
    savePendingIntroQuiz(answers);
    setDone(answers);
    setPhase("result");
  };

  const back = () => {
    touched.current = true;
    if (step === 0) {
      setPhase("intro");
      return;
    }
    setStep(step - 1);
  };

  return (
    <section
      id={id}
      aria-labelledby="intro-quiz-title"
      className="scroll-mt-10 rounded-3xl bg-gradient-to-r from-blue-500/10 via-studio-card to-studio-accent/10 p-5 ring-1 ring-studio-border sm:p-10"
    >
      {phase === "intro" && (
        <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <Badge>Мини-тест · 1 минута</Badge>
            <h2
              id="intro-quiz-title"
              ref={headingRef}
              tabIndex={-1}
              className="mt-4 font-display text-3xl font-semibold outline-none sm:text-4xl"
            >
              Подберём ваш путь в вокале
            </h2>
            <p className="mt-3 max-w-xl text-studio-muted">
              Пять коротких вопросов о цели и опыте. Вы узнаете, с чего лучше
              начать, и получите план первых занятий. Регистрация для этого не
              нужна.
            </p>
          </div>
          <Button size="lg" className="w-full md:w-auto" onClick={start}>
            Пройти тест
          </Button>
        </div>
      )}

      {phase === "ask" && question && (
        <div>
          <div className="flex items-center justify-between gap-3 text-xs text-studio-muted">
            <span>
              Вопрос {step + 1} из {total}
            </span>
            <button
              type="button"
              onClick={back}
              className="inline-flex h-10 items-center gap-1 rounded-lg px-2 hover:text-studio-text focus:outline-none focus-visible:ring-2 focus-visible:ring-studio-accent"
            >
              <ArrowLeft className="h-4 w-4" />
              Назад
            </button>
          </div>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-studio-border/60"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={total}
            aria-valuenow={step + 1}
          >
            <div
              className="h-full rounded-full bg-studio-accent transition-[width] duration-300"
              style={{ width: `${((step + 1) / total) * 100}%` }}
            />
          </div>

          <h2
            id="intro-quiz-title"
            ref={headingRef}
            tabIndex={-1}
            className="mt-6 font-display text-2xl font-semibold outline-none sm:text-3xl"
          >
            {question.title}
          </h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {question.options.map((option) => {
              const selected = draft[question.key] === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => choose(option.value)}
                  className={`min-h-12 w-full touch-manipulation rounded-2xl px-4 py-3 text-left text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-studio-accent ${
                    selected
                      ? "bg-studio-accent/15 ring-2 ring-studio-accent"
                      : "bg-studio-surface ring-1 ring-studio-border hover:ring-studio-accent/50"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {phase === "result" && result && (
        <div className="grid gap-8 md:grid-cols-2 md:items-start">
          <div>
            <Badge>Ваш путь в вокале</Badge>
            <h2
              id="intro-quiz-title"
              ref={headingRef}
              tabIndex={-1}
              className="mt-4 font-display text-3xl font-semibold outline-none sm:text-4xl"
            >
              {result.headline}
            </h2>
            <p className="mt-3 text-studio-muted">{result.lead}</p>
            <p className="mt-3 text-sm font-medium">{result.goalLine}</p>
            <p className="mt-4 rounded-2xl bg-studio-surface/80 p-4 text-sm ring-1 ring-studio-border">
              {result.barrierAnswer}
            </p>
          </div>

          <div>
            <p className="text-sm font-medium">Первые шаги на занятиях</p>
            <ol className="mt-3 space-y-3">
              {result.steps.map((text, index) => (
                <li
                  key={text}
                  className="flex items-start gap-3 rounded-2xl bg-studio-surface/80 p-4 ring-1 ring-studio-border"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-studio-accent/15 text-sm font-semibold text-studio-accent-light ring-1 ring-studio-accent/30">
                    {index + 1}
                  </span>
                  <span className="pt-1 text-sm">{text}</span>
                </li>
              ))}
            </ol>

            <p className="mt-5 text-sm text-studio-muted">{result.trialLine}</p>
            <AuthCta className="cta-shimmer mt-4 w-full sm:w-auto" size="lg">
              Сохранить план и записаться на пробный
            </AuthCta>
            <p className="mt-3 text-xs text-studio-muted">
              Преподаватель увидит ваши ответы и подготовит урок под вашу цель.
            </p>
            <button
              type="button"
              onClick={start}
              className="mt-3 inline-flex h-10 items-center gap-1.5 text-xs text-studio-muted hover:text-studio-text focus:outline-none focus-visible:ring-2 focus-visible:ring-studio-accent"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Пройти заново
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
