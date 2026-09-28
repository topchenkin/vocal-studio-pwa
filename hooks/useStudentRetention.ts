"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  fetchRetentionBoard,
  type RetentionBoard,
} from "@/lib/student-retention";

export function useStudentRetention() {
  const { user, isAdmin, loading } = useAuth();
  const [board, setBoard] = useState<RetentionBoard | null>(null);

  const reload = useCallback(async () => {
    if (!user || isAdmin) {
      setBoard(null);
      return;
    }
    setBoard(await fetchRetentionBoard());
  }, [isAdmin, user]);

  useEffect(() => {
    if (loading) return;
    void reload();
  }, [loading, reload]);

  useEffect(() => {
    const onFocus = () => void reload();
    window.addEventListener("focus", onFocus);
    window.addEventListener("uvs-cabinet-progress", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("uvs-cabinet-progress", onFocus);
    };
  }, [reload]);

  return { board, reload };
}
