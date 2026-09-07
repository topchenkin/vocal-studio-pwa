"use client";

import { motion, useReducedMotion } from "framer-motion";

export default function SlidingTabUnderline({
  layoutId,
  active,
}: {
  layoutId: string;
  active: boolean;
}) {
  const reduce = useReducedMotion();
  if (!active) return null;

  return (
    <motion.span
      layoutId={reduce ? undefined : layoutId}
      className="pointer-events-none absolute inset-x-2 bottom-1 z-[1] h-[3px] rounded-full bg-studio-accent"
      transition={
        reduce
          ? { duration: 0 }
          : { type: "spring", stiffness: 420, damping: 34 }
      }
    />
  );
}
