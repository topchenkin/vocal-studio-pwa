import { supabase } from "@/lib/supabase";

export type CatXpKind =
  | "checkin"
  | "analyzer"
  | "exercise_share"
  | "pro_test"
  | "streak";

export type CatXpResult = {
  awarded: number;
  already?: boolean;
  capped?: boolean;
  xp?: number;
  threshold?: number;
  exam_ready?: boolean;
  streak?: number;
  streak_bonus?: number;
};

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
  return (data ?? null) as CatXpResult | null;
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
