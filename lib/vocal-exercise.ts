import type { VocalExerciseAttempt } from "@/types";

export type ScoreDimension = "intonation" | "rhythm" | "completeness";
export type TeacherMood = "joyful" | "satisfied" | "supportive";

export const TEACHER_AVATARS: Record<TeacherMood, string> = {
  joyful: "/teacher-score-high.webp",
  satisfied: "/teacher-score-medium.webp",
  supportive: "/teacher-score-low.webp",
};

const focusText: Record<ScoreDimension, string> = {
  intonation: "Сейчас лучше всего поможет внимание к интервалам между нотами.",
  rhythm: "На следующей попытке поймайте точнее вступления и длительности.",
  completeness: "Попробуйте допеть фразу на опоре до самого конца.",
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
