import type { CatLevel } from "@/types";

export const CAT_LEVEL_LABELS: Record<CatLevel, string> = {
  beginner: "Мурчащий котик",
  basic: "Певчий котик",
  pro: "Джазовый кот",
  star: "Кот-Звезда",
};

/** Sticker shown for each level (same set as the student status bar). */
export const CAT_LEVEL_IMAGES: Record<CatLevel, string> = {
  beginner: "/stickers/sticker-cat-wave.png",
  basic: "/stickers/sticker-cat-sing.png",
  pro: "/stickers/sticker-cat-headphones.png",
  star: "/stickers/sticker-cat-star.png",
};

export const CAT_LEVEL_OPTIONS: Array<{ value: CatLevel; label: string }> = (
  Object.entries(CAT_LEVEL_LABELS) as Array<[CatLevel, string]>
).map(([value, label]) => ({ value, label }));
