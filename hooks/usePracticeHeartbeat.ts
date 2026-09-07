"use client";

import { useEffect } from "react";
import { logPracticeSeconds, type PracticeKind } from "@/lib/practice-log";

const TICK_SEC = 15;

export function usePracticeHeartbeat(kind: PracticeKind, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      void logPracticeSeconds(kind, TICK_SEC);
    }, TICK_SEC * 1000);
    return () => window.clearInterval(id);
  }, [active, kind]);
}
