import type { VocalExerciseAttempt } from "@/types";

export type ScoreDimension = "intonation" | "rhythm" | "completeness";
export type TeacherMood = "joyful" | "satisfied" | "supportive";

export const TEACHER_AVATARS: Record<TeacherMood, string> = {
  joyful: "/teacher-score-high.webp",
  satisfied: "/teacher-score-medium.webp",
  supportive: "/teacher-score-low.webp",
};

const focusText: Record<ScoreDimension, string> = {
  intonation: "Сейчас лучше всего поможет внимание к нотам мелодии, без гонки за громкостью.",
  rhythm: "На следующей попытке поймайте точнее вступления певческих нот.",
  completeness: "Пропойте вокальные куски и помолчите, когда играет фортепиано.",
};

export function weakestDimension(
  attempt: Pick<
    VocalExerciseAttempt,
    "intonation_score" | "rhythm_score" | "completeness_score"
  >
): ScoreDimension {
  const values: Array<[ScoreDimension, number]> = [
    ["intonation", attempt.intonation_score ?? 0],
    ["rhythm", attempt.rhythm_score ?? 0],
    ["completeness", attempt.completeness_score ?? 0],
  ];
  values.sort((left, right) => left[1] - right[1]);
  return values[0]?.[0] ?? "intonation";
}

export function teacherReaction(
  score: number,
  weakest: ScoreDimension
): { mood: TeacherMood; avatar: string; title: string; message: string } {
  if (score >= 80) {
    return {
      mood: "joyful",
      avatar: TEACHER_AVATARS.joyful,
      title: "Сильный результат!",
      message: `Мелодия уже звучит уверенно — можно шлифовать детали. ${focusText[weakest]}`,
    };
  }
  if (score >= 50) {
    return {
      mood: "satisfied",
      avatar: TEACHER_AVATARS.satisfied,
      title: "Хорошая основа",
      message: `Фраза узнаваема, и прогресс слышен. ${focusText[weakest]}`,
    };
  }
  return {
    mood: "supportive",
    avatar: TEACHER_AVATARS.supportive,
    title: "Давайте ещё раз — получится",
    message: `Возьмите один короткий фрагмент и повторите спокойно. ${focusText[weakest]}`,
  };
}

/** Hit window for karaoke blocks (±60¢). Vibrato inside this is a perfect hit. */
export const EXERCISE_IN_TUNE_CENTS = 60;
/** Neighbouring-note band used for half-points. */
export const EXERCISE_NEAR_CENTS = 120;

/** Practical upper bound (upload/size), not a 45s product hard stop. */
export const EXERCISE_PHRASE_MAX_SEC = 600;
export const EXERCISE_ATTEMPT_MAX_SEC = 600;
export const EXERCISE_PHRASE_LIST_LIMIT = 500;

export function nextPhraseSortOrder(phrases: Array<{ sort_order: number }>): number {
  if (phrases.length === 0) return 0;
  return Math.max(...phrases.map((phrase) => Number(phrase.sort_order) || 0)) + 1;
}

export function phrasesForExercise<T extends { exercise_id: string }>(
  phrases: T[],
  exerciseId: string
): T[] {
  return phrases.filter((phrase) => phrase.exercise_id === exerciseId);
}

const UNRECOGNIZED_FEEDBACK = "Не удалось распознать";

export function sanitizeAttemptFeedback(text: string | null | undefined): string {
  const trimmed = text?.trim() ?? "";
  if (!trimmed) return UNRECOGNIZED_FEEDBACK;
  const marks = (trimmed.match(/\?/g) ?? []).length;
  if (marks >= 8 || /\?{6,}/.test(trimmed)) return UNRECOGNIZED_FEEDBACK;
  return trimmed;
}
