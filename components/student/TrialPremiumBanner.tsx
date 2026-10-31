"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import {
  isStudioTrialActive,
  STUDIO_TRIAL_END_LABEL,
} from "@/lib/studio-trial";

export default function TrialPremiumBanner() {
  if (!isStudioTrialActive()) return null;

  return (
    <aside
      className="mt-4 rounded-2xl bg-studio-gold/10 px-4 py-3 ring-1 ring-studio-gold/30"
      aria-label="Пробный Premium"
    >
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-studio-gold" />
        <div className="min-w-0 text-sm leading-relaxed">
          <p className="font-medium text-studio-text">
            Пробный Premium до {STUDIO_TRIAL_END_LABEL} включительно
          </p>
          <p className="mt-1 text-studio-muted">
            Лаборатория и упражнения открыты как на Premium. Удаление вокала и
            «Автор песен» закрыты. С 11 ноября доступ вернётся к вашему тарифу.
          </p>
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            <Link
              href="/dashboard/student/ai-tools"
              className="font-medium text-studio-accent-light underline-offset-2 hover:underline"
            >
              Лаборатория
            </Link>
            <Link
              href="/dashboard/student/subscription"
              className="font-medium text-studio-accent-light underline-offset-2 hover:underline"
            >
              Оставить Premium
            </Link>
          </p>
        </div>
      </div>
    </aside>
  );
}
