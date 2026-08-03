"use client";

import type { SubscriptionPlan } from "@/lib/types";
import { formatPrice } from "@/lib/storage";
type Props = {
  plan: SubscriptionPlan;
  selected: boolean;
  onSelect: () => void;
};

export default function SubscriptionCard({ plan, selected, onSelect }: Props) {  return (
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

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className={[
              "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
              selected
                ? "border-studio-accent bg-studio-accent"
                : "border-studio-border group-hover:border-studio-accent/50",
            ].join(" ")}
          >
            {selected && (
              <div className="h-2 w-2 rounded-full bg-white" aria-hidden />
            )}
          </div>
          <div>
            <p className="font-medium">{plan.duration}</p>
            <p className="text-sm text-studio-muted">
              {formatPrice(plan.pricePerMonth)} ₽ / мес
            </p>
          </div>
        </div>

        <div className="text-right">
          <p className="font-display text-2xl font-semibold">
            {formatPrice(plan.price)}
            <span className="text-sm font-sans font-normal text-studio-muted">
              {" "}
              ₽
            </span>
          </p>
          {plan.months > 1 && (
            <p className="text-xs text-studio-gold">
              −{Math.round((1 - plan.pricePerMonth / 8000) * 100)}% экономия
            </p>
          )}
        </div>
      </div>
    </button>
  );
}
