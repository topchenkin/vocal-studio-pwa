import { supabase } from "@/lib/supabase";
import { emitXpToast } from "@/lib/xp-toast";

export type CatXpKind =
  | "checkin"
  | "analyzer"
  | "exercise_share"
  | "exercise"
  | "mixer"
  | "chat"
  | "practice"
  | "pro_test"
  | "streak"
  | "lesson";

export type CatXpResult = {
  awarded: number;
  already?: boolean;
  capped?: boolean;
  xp?: number;
  threshold?: number;
  exam_ready?: boolean;
  streak?: number;
  streak_bonus?: number;
  lesson_xp?: number;
};

const TOAST_LINE: Partial<Record<CatXpKind, string>> = {
  checkin: "Зашли в кабинет. Серия обновлена.",
  analyzer: "Практика в анализаторе.",
  exercise_share: "Практика ушла преподавателю.",
  exercise: "Практика засчитана.",
  mixer: "Запись в студии.",
  chat: "Сообщение ушло преподавателю.",
  practice: "Практика началась.",
};

function toastLine(kind: CatXpKind, result: CatXpResult): string {
  if (Number(result.lesson_xp) > 0) {
    return "Занятие засчитано. Опыт добавлен к прогрессу.";
  }
  if (Number(result.streak_bonus) > 0) {
    return "Серия держится — небольшой бонус котику.";
  }
  return TOAST_LINE[kind] ?? "Опыт добавлен к прогрессу.";
}

export async function awardCatXp(
  kind: CatXpKind,
  sourceId?: string
): Promise<CatXpResult | null> {
  const { data, error } = await supabase.rpc("award_cat_xp", {
    p_kind: kind,
    p_source_id: sourceId ?? null,
  });
  if (error) {
    if (
      error.message.includes("award_cat_xp") ||
      error.code === "42883" ||
      error.code === "PGRST202"
    ) {
      return null;
    }
    console.warn("award_cat_xp", error.message);
    return null;
  }
  const result = (data ?? null) as CatXpResult | null;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("uvs-cabinet-progress"));
  }
  if (result) {
    const shown =
      Number(result.awarded) +
      Number(result.streak_bonus || 0) +
      Number(result.lesson_xp || 0);
    if (shown > 0) {
      emitXpToast(shown, toastLine(kind, result));
    }
  }
  return result;
}

export async function submitVocalTestForReview(resultId: string): Promise<void> {
  const { error } = await supabase.rpc("submit_vocal_test_for_review", {
    p_result_id: resultId,
  });
  if (error) throw new Error(error.message);
}

export async function reviewVocalTest(
  resultId: string,
  approve: boolean
): Promise<void> {
  const { error } = await supabase.rpc("review_vocal_test", {
    p_result_id: resultId,
    p_approve: approve,
  });
  if (error) throw new Error(error.message);
}
