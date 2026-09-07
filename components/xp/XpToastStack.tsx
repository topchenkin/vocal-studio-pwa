"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Cat } from "lucide-react";
import { subscribeXpToasts } from "@/lib/xp-toast";

const MAX_STACK = 3;
const LIFE_MS = 3000;

type ToastItem = { id: number; amount: number };

export default function XpToastStack() {
  const reduce = useReducedMotion();
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    return subscribeXpToasts((event) => {
      const id = Date.now() + Math.random();
      setItems((prev) => [...prev, { id, amount: event.amount }].slice(-MAX_STACK));
      window.setTimeout(() => {
        setItems((prev) => prev.filter((item) => item.id !== id));
      }, LIFE_MS);
    });
  }, []);

  return (
    <div
      className="pointer-events-none fixed right-3 top-[calc(env(safe-area-inset-top)+4.75rem)] z-[65] flex w-[min(100%-1.5rem,17rem)] flex-col gap-2"
      aria-live="polite"
    >
      <AnimatePresence initial={false}>
        {items.map((item) => (
          <motion.div
            key={item.id}
            role="status"
            initial={reduce ? { opacity: 1 } : { opacity: 0, y: -10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
            transition={
              reduce
                ? { duration: 0.12 }
                : { duration: 0.28, ease: [0.22, 1, 0.36, 1] }
            }
            className="pointer-events-auto flex items-center gap-2.5 rounded-2xl bg-studio-card/95 px-3.5 py-2.5 text-sm shadow-glow ring-1 ring-studio-accent/35 backdrop-blur-md"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-studio-accent/15 ring-1 ring-studio-accent/30">
              <Cat className="h-5 w-5 text-studio-accent-light" />
            </span>
            <span className="font-medium">+{item.amount} опыта</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
