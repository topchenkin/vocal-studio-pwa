import type { CatLevel } from "@/types";

/** Display names. Star uses a spaced hyphen so it stays a straight dash, not a glued hyphen. */
export const CAT_LEVEL_LABELS: Record<CatLevel, string> = {
  beginner: "Мурчащий котик",
  basic: "Певчий котик",
  pro: "Джазовый кот",
  star: "Кот - Звезда",
};

export const CAT_LEVEL_OPTIONS: Array<{ value: CatLevel; label: string }> = (
  Object.entries(CAT_LEVEL_LABELS) as Array<[CatLevel, string]>
).map(([value, label]) => ({ value, label }));
