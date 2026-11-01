export const LESSON_DURATION_OPTIONS = [40, 45, 50, 55, 60] as const;
export type LessonDurationMin = (typeof LESSON_DURATION_OPTIONS)[number];
export const DEFAULT_LESSON_DURATION_MIN = 60 as const;

export function clampLessonDurationMin(value: unknown): LessonDurationMin {
  const n = Number(value);
  if (
    n === 40 ||
    n === 45 ||
    n === 50 ||
    n === 55 ||
    n === 60
  ) {
    return n;
  }
  return DEFAULT_LESSON_DURATION_MIN;
}

export function lessonDurationMs(value: unknown): number {
  return clampLessonDurationMin(value) * 60 * 1000;
}

/** Half-open ranges: a lesson ending at 19:00 does not collide with one starting at 19:00. */
export function lessonsOverlap(
  aStartIso: string,
  aDurationMin: unknown,
  bStartIso: string,
  bDurationMin: unknown
): boolean {
  const a0 = new Date(aStartIso).getTime();
  const b0 = new Date(bStartIso).getTime();
  if (!Number.isFinite(a0) || !Number.isFinite(b0)) return false;
  const a1 = a0 + lessonDurationMs(aDurationMin);
  const b1 = b0 + lessonDurationMs(bDurationMin);
  return a0 < b1 && b0 < a1;
}
