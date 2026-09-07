"use client";

import { cn } from "@/lib/utils";
import { LayoutGroup } from "framer-motion";
import SlidingTabUnderline from "@/components/ui/SlidingTabUnderline";

interface TabsProps {
  tabs: { id: string; label: string; icon?: React.ReactNode }[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}

export default function Tabs({ tabs, active, onChange, className }: TabsProps) {
  return (
    <LayoutGroup id="admin-tabs">
      <div
        className={cn(
          "flex gap-1 overflow-x-auto rounded-xl bg-studio-surface p-1 ring-1 ring-studio-border scrollbar-none",
          className
        )}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              "relative flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200",
              active === tab.id
                ? "bg-studio-accent/20 text-studio-accent-light shadow-sm"
                : "text-studio-muted hover:text-studio-text"
            )}
          >
            <span className="relative z-[1] flex items-center gap-1.5">
              {tab.icon}
              {tab.label}
            </span>
            <SlidingTabUnderline layoutId="admin-tabs-line" active={active === tab.id} />
          </button>
        ))}
      </div>
    </LayoutGroup>
  );
}
