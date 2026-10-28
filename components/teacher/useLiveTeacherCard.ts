"use client";

import { useEffect, useState } from "react";
import { loadTeacherCard } from "@/lib/teacher-card-client";
import type { TeacherCard } from "@/lib/teacher-card";

/** Static HTML ships the build snapshot; visitors get the admin's latest edits right away. */
export function useLiveTeacherCard(snapshot: TeacherCard | null) {
  const [card, setCard] = useState<TeacherCard | null>(snapshot);

  useEffect(() => {
    let alive = true;
    loadTeacherCard()
      .then((fresh) => {
        if (alive) setCard(fresh);
      })
      .catch((error) => {
        console.error("[uvs:teacher-card] live load failed, keeping snapshot", error);
      });
    return () => {
      alive = false;
    };
  }, []);

  return card;
}
