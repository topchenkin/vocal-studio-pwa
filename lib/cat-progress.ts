import type { CatLevel } from "@/types";
import { CAT_LEVEL_LABELS } from "@/lib/cat-levels";

export const CAT_XP_THRESHOLDS: Record<CatLevel, number> = {
  beginner: 48,
  basic: 280,
  pro: 1100,
  star: 0,
};

export const CAT_LEVEL_ORDER: CatLevel[] = [
  "beginner",
  "basic",
  "pro",
  "star",
];

export function nextCatLevel(level: CatLevel): CatLevel | null {
  if (level === "beginner") return "basic";
  if (level === "basic") return "pro";
  if (level === "pro") return "star";
  return null;
}

export function catProgressPercent(level: CatLevel, xp: number): number {
  const threshold = CAT_XP_THRESHOLDS[level];
  if (!threshold) return 100;
  return Math.max(0, Math.min(100, Math.round((xp / threshold) * 100)));
}

export function catProgressPhrase(
  level: CatLevel,
  percent: number,
  examReady: boolean
): string {
  if (level === "star") {
    return "Вершина. Держи форму — котик уже звезда.";
  }
  if (examReady || percent >= 100) {
    return "Полоска полная. Можно договариваться об экзамене.";
  }
  if (percent >= 85) return "Ещё немного — и котик готов к экзамену.";
  if (percent >= 55) return "Форма растёт. Так держать.";
  if (percent >= 25) return "Разогрев идёт. Заходи ещё — будет легче.";
  return "Котик только проснулся. Маленький шаг сегодня уже считается.";
}

export function catNextLabel(level: CatLevel): string {
  const next = nextCatLevel(level);
  return next ? CAT_LEVEL_LABELS[next] : "Максимальный уровень";
}
