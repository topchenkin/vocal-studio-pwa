"use client";

import { useEffect, useRef, useState } from "react";
import { reloadCabinet } from "@/lib/reload-app";

const THRESHOLD = 72;

function isStandaloneApp() {
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches
  );
}

function isNestedScrolled(target: EventTarget | null) {
  let node = target instanceof HTMLElement ? target : null;
  while (node && node !== document.body) {
    const overflowY = window.getComputedStyle(node).overflowY;
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      node.scrollTop > 0
    ) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

export default function PullToRefresh({
  children,
}: {
  children: React.ReactNode;
}) {
  const startY = useRef<number | null>(null);
  const pull = useRef(0);
  const [offset, setOffset] = useState(0);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(isStandaloneApp());
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const onStart = (event: TouchEvent) => {
      if (window.scrollY > 0 || isNestedScrolled(event.target)) {
        startY.current = null;
        return;
      }
      startY.current = event.touches[0]?.clientY ?? null;
      pull.current = 0;
    };

    const onMove = (event: TouchEvent) => {
      if (startY.current == null) return;
      const dy = (event.touches[0]?.clientY ?? startY.current) - startY.current;
      if (dy < 10) return;
      if (window.scrollY > 0 || isNestedScrolled(event.target)) {
        startY.current = null;
        pull.current = 0;
        setOffset(0);
        return;
      }
      event.preventDefault();
      pull.current = Math.min(dy, 112);
      setOffset(pull.current);
    };

    const onEnd = () => {
      const shouldReload = pull.current >= THRESHOLD;
      startY.current = null;
      if (shouldReload) {
        setOffset(THRESHOLD);
        reloadCabinet();
        return;
      }
      pull.current = 0;
      setOffset(0);
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", onEnd);
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
  }, [enabled]);

  if (!enabled) return children;

  const progress = Math.min(offset / THRESHOLD, 1);

  return (
    <>
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex justify-center"
        style={{
          paddingTop: "calc(8px + env(safe-area-inset-top))",
          opacity: progress,
          transform: `translateY(${Math.max(offset - 28, 0)}px)`,
        }}
        aria-hidden
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-studio-card ring-1 ring-studio-border">
          <span
            className="h-4 w-4 rounded-full border-2 border-studio-accent border-t-transparent"
            style={{
              animation:
                offset >= THRESHOLD ? "spin 0.8s linear infinite" : undefined,
              transform: `rotate(${progress * 300}deg)`,
            }}
          />
        </div>
      </div>
      {children}
    </>
  );
}
