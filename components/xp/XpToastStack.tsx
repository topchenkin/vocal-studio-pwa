"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Cat, X } from "lucide-react";
import { subscribeXpToasts } from "@/lib/xp-toast";

const LIFE_MS = 4200;

type ToastItem = { id: number; amount: number; line?: string };

export default function XpToastStack() {
  const reduce = useReducedMotion();
  const [item, setItem] = useState<ToastItem | null>(null);

  useEffect(() => {
    return subscribeXpToasts((event) => {
      const id = Date.now() + Math.random();
      setItem({ id, amount: event.amount, line: event.line });
      window.setTimeout(() => {
        setItem((current) => (current?.id === id ? null : current));
      }, LIFE_MS);
    });
  }, []);

  return (
    <div
      className="pointer-events-none fixed right-3 top-[calc(env(safe-area-inset-top)+4.75rem)] z-[65] w-[min(100%-1.5rem,18.5rem)]"
      aria-live="polite"
    >
      <AnimatePresence initial={false}>
        {item ? (
          <motion.div
            key={item.id}
            role="status"
            initial={reduce ? { opacity: 1 } : { opacity: 0, y: -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
            transition={
              reduce
                ? { duration: 0.12 }
                : { duration: 0.28, ease: [0.22, 1, 0.36, 1] }
            }
            className="pointer-events-auto relative flex items-start gap-3 rounded-2xl bg-studio-card/95 px-3.5 py-3 shadow-glow ring-1 ring-studio-accent/40 backdrop-blur-md"
          >
            <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-studio-accent/15 ring-1 ring-studio-accent/35">
              <Cat className="h-6 w-6 text-studio-accent-light" />
            </span>
            <div className="min-w-0 flex-1 pr-5">
              <p className="font-display text-2xl font-semibold leading-none text-studio-gold">
                +{item.amount} XP
              </p>
              <p className="mt-1.5 text-xs leading-snug text-studio-muted">
                {item.line ?? "Опыт добавлен к прогрессу."}
              </p>
            </div>
            <button
              type="button"
              className="absolute right-2 top-2 rounded-md p-1 text-studio-muted/80 hover:text-studio-text"
              aria-label="Закрыть"
              onClick={() => setItem(null)}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
