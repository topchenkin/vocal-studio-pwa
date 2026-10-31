"use client";

import type { SubscriptionPlan } from "@/lib/types";
import {
  subscriptionMonthlyRate,
  type SubscriptionMonthOption,
} from "@/lib/constants";
import { formatPrice } from "@/lib/storage";

type Props = {
  plan: SubscriptionPlan;
  selected: boolean;
  onSelect: () => void;
  months?: SubscriptionMonthOption;
};

export default function SubscriptionCard({
  plan,
  selected,
  onSelect,
  months = 1,
}: Props) {
  const listMonthly = plan.pricePerMonth;
  const effectiveMonthly = subscriptionMonthlyRate(listMonthly, months);
  const showDiscount = months > 1 && effectiveMonthly < listMonthly;

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={[
        "group relative w-full rounded-2xl p-4 text-left transition-all duration-300",
        "ring-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-studio-accent",
        selected
          ? "bg-studio-card ring-studio-accent/60 shadow-glow"
          : "bg-studio-surface ring-studio-border hover:ring-studio-accent/30 hover:bg-studio-card/60",
      ].join(" ")}
    >
      {plan.badge && (
        <span
          className={[
            "absolute -top-2.5 right-4 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
            selected
              ? "bg-studio-gold text-studio-bg"
              : "bg-studio-border text-studio-muted group-hover:text-white",
          ].join(" ")}
        >
          {plan.badge}
        </span>
      )}

      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={[
              "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
              selected
                ? "border-studio-accent bg-studio-accent"
                : "border-studio-border group-hover:border-studio-accent/50",
            ].join(" ")}
          >
            {selected && (
              <div className="h-2 w-2 rounded-full bg-white" aria-hidden />
            )}
          </div>
          <div className="min-w-0">
            <p className="font-medium">{plan.duration}</p>
            {plan.summary ? (
              <p className="mt-0.5 text-sm text-studio-muted">{plan.summary}</p>
            ) : (
              <p className="text-sm text-studio-muted">
                {formatPrice(plan.pricePerMonth)} ₽ / мес
              </p>
            )}
          </div>
        </div>

        <div className="shrink-0 text-right">
          {showDiscount ? (
            <p className="text-sm text-studio-muted line-through">
              {formatPrice(listMonthly)} ₽/мес
            </p>
          ) : null}
          <p className="font-display text-2xl font-semibold">
            {formatPrice(effectiveMonthly)}
            <span className="text-sm font-sans font-normal text-studio-muted">
              {" "}
              ₽/мес
            </span>
          </p>
        </div>
      </div>

      {plan.features && plan.features.length > 0 ? (
        <ul className="mt-3 space-y-1.5 pl-8 text-sm text-studio-muted">
          {plan.features.map((item) => (
            <li key={item} className="flex gap-2">
              <span
                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-studio-accent/70"
                aria-hidden
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </button>
  );
}
