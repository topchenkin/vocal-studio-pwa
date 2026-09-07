"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  EMPTY_CABINET_PROGRESS,
  fetchCabinetProgress,
  type CabinetProgress,
} from "@/lib/student-progress";

export function useCabinetProgress() {
  const { user, isAdmin, loading } = useAuth();
  const [progress, setProgress] = useState<CabinetProgress | null>(null);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    if (!user || isAdmin) {
      setProgress(null);
      setReady(true);
      return;
    }
    const next = await fetchCabinetProgress();
    setProgress(next ?? { ...EMPTY_CABINET_PROGRESS, streak: 0 });
    setReady(true);
  }, [isAdmin, user]);

  useEffect(() => {
    if (loading) return;
    void reload();
  }, [loading, reload]);

  useEffect(() => {
    const onFocus = () => void reload();
    window.addEventListener("focus", onFocus);
    window.addEventListener("uvs-profile-updated", onFocus);
    window.addEventListener("uvs-cabinet-progress", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("uvs-profile-updated", onFocus);
      window.removeEventListener("uvs-cabinet-progress", onFocus);
    };
  }, [reload]);

  return { progress, ready, reload };
}
