export const EXERCISE_RESULT_MARKER = "UVS_EXERCISE_RESULT";
export const EXERCISE_VOICE_MARKER = "UVS_EXERCISE_VOICE";

export type ExerciseResultPayload = {
  v: 2 | 3;
  kind: "exercise_result" | "exercise_practice";
  overall?: number;
  intonation?: number;
  rhythm?: number;
  completeness?: number;
  exerciseTitle: string;
  phraseTitle?: string;
  shift?: number | null;
  durationSec?: number;
};

export function exerciseResultNotificationText(studentName: string) {
  const name = studentName.trim() || "Ученик";
  return `${name} отправил(а) практику`;
}

export function isExerciseResultText(raw: string | null | undefined) {
  const text = raw || "";
  return (
    text.includes(EXERCISE_RESULT_MARKER) ||
    text.includes('"kind":"exercise_result"') ||
    text.includes('"kind":"exercise_practice"') ||
    /результаты упражнения/i.test(text) ||
    /отправил[аи]?\s*\(?а\)?\s*практик/i.test(text) ||
    /практика с упражнения/i.test(text)
  );
}

export function isExerciseVoiceFollowup(raw: string | null | undefined) {
  return (raw || "").includes(EXERCISE_VOICE_MARKER);
}

export function exerciseResultChatText(
  studentName: string,
  payload: ExerciseResultPayload
) {
  return `${exerciseResultNotificationText(studentName)}\n${EXERCISE_RESULT_MARKER} ${JSON.stringify(payload)}`.slice(
    0,
    2000
  );
}

export function exercisePracticeChatText(
  studentName: string,
  exerciseTitle: string,
  durationSec: number
) {
  const payload: ExerciseResultPayload = {
    v: 3,
    kind: "exercise_practice",
    exerciseTitle,
    durationSec,
  };
  return exerciseResultChatText(studentName, payload);
}

export function exerciseVoiceFollowupText(exerciseTitle: string, phraseTitle: string) {
  return `${EXERCISE_VOICE_MARKER} ${exerciseTitle} · ${phraseTitle}`.slice(0, 2000);
}

export function parseExerciseResultPayload(
  raw: unknown
): ExerciseResultPayload | null {
  if (raw == null) return null;
  let parsed: Partial<ExerciseResultPayload> | null = null;
  if (typeof raw === "object" && !Array.isArray(raw)) {
    parsed = raw as Partial<ExerciseResultPayload>;
  } else if (typeof raw === "string") {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      parsed = JSON.parse(raw.slice(start, end + 1)) as Partial<ExerciseResultPayload>;
    } catch {
      return null;
    }
  }
  if (!parsed) return null;
  if (parsed.kind === "exercise_practice" || parsed.v === 3) {
    return {
      v: 3,
      kind: "exercise_practice",
      exerciseTitle: String(parsed.exerciseTitle || ""),
      durationSec: Number(parsed.durationSec) || 0,
    };
  }
  if (parsed.v !== 2 || parsed.kind !== "exercise_result") return null;
  return {
    v: 2,
    kind: "exercise_result",
    overall: Number(parsed.overall) || 0,
    intonation: Number(parsed.intonation) || 0,
    rhythm: Number(parsed.rhythm) || 0,
    completeness: Number(parsed.completeness) || 0,
    exerciseTitle: String(parsed.exerciseTitle || ""),
    phraseTitle: String(parsed.phraseTitle || ""),
    shift: parsed.shift == null ? null : Number(parsed.shift),
  };
}
