"use client";

import { LayoutGroup, motion, useReducedMotion } from "framer-motion";

export default function HubPills<T extends string>({
  label,
  value,
  onChange,
  items,
}: {
  label: string;
  value: T;
  onChange: (id: T) => void;
  items: Array<{ id: T; label: string }>;
}) {
  const reduce = useReducedMotion();

  return (
    <LayoutGroup id={label}>
      <div
        role="tablist"
        aria-label={label}
        className="mb-5 flex gap-1 overflow-x-auto rounded-2xl bg-studio-surface p-1.5 ring-1 ring-studio-border"
      >
        {items.map((item) => {
          const active = item.id === value;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(item.id)}
              className={`relative min-h-11 shrink-0 rounded-xl px-4 text-sm font-medium transition ${
                active ? "text-studio-accent-light" : "text-studio-muted"
              }`}
            >
              {active && (
                <motion.span
                  layoutId={`${label}-pill`}
                  className="absolute inset-0 rounded-xl bg-studio-accent/20"
                  transition={
                    reduce
                      ? { duration: 0 }
                      : { type: "spring", stiffness: 420, damping: 34 }
                  }
                />
              )}
              <span className="relative z-[1]">{item.label}</span>
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
