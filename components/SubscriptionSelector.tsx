"use client";

import SubscriptionCard from "./SubscriptionCard";
import { PLANS } from "@/lib/constants";
import type { SubscriptionPlan } from "@/lib/types";

interface SubscriptionSelectorProps {
  selectedId: string;
  onSelect: (id: string) => void;
  plans?: SubscriptionPlan[];
}

export default function SubscriptionSelector({
  selectedId,
  onSelect,
  plans = PLANS,
}: SubscriptionSelectorProps) {
  return (
    <div className="space-y-3" role="radiogroup" aria-label="Выбор тарифа">
      {plans.map((plan) => (
        <SubscriptionCard
          key={plan.id}
          plan={plan}
          selected={selectedId === plan.id}
          onSelect={() => onSelect(plan.id)}
        />
      ))}
    </div>
  );
}

export function getPlanById(id: string): SubscriptionPlan {
  return PLANS.find((p) => p.id === id) ?? PLANS[1]!;
}

export { PLANS };
