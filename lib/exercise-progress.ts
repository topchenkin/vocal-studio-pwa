export const PASSING_PHRASE_SCORE = 80;

export function phraseProgressPercent(phraseCount: number, passedCount: number) {
  if (phraseCount <= 0) return 0;
  const clamped = Math.max(0, Math.min(phraseCount, passedCount));
  return Math.round((clamped / phraseCount) * 100);
}

export function countPassedPhrases(
  phraseIds: string[],
  bestScores: Record<string, number | null | undefined>
) {
  return phraseIds.filter((id) => Number(bestScores[id] ?? 0) > PASSING_PHRASE_SCORE)
    .length;
}

export function progressLabel(percent: number) {
  return `Выполнено ${percent}%`;
}

export function bestScoreMap(
  rows: Array<{ phrase_id: string; best_score: number | null }>
): Record<string, number> {
  const next: Record<string, number> = {};
  for (const row of rows) {
    next[row.phrase_id] = Number(row.best_score ?? 0);
  }
  return next;
}
