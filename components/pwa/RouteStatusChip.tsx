"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";

export default function RouteStatusChip() {
  const { reconnecting, profile } = useAuth();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!reconnecting || !profile) {
      setVisible(false);
      return;
    }
    const show = window.setTimeout(() => setVisible(true), 1_000);
    return () => window.clearTimeout(show);
  }, [profile, reconnecting]);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[55] flex justify-center px-4">
      <p className="rounded-full bg-studio-card/95 px-4 py-2 text-xs font-medium text-studio-muted ring-1 ring-studio-border shadow-card">
        Восстанавливаем связь…
      </p>
    </div>
  );
}
