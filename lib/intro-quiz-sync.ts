import {
  clearPendingIntroQuiz,
  computeIntroQuizResult,
  loadPendingIntroQuiz,
} from "@/lib/intro-quiz";
import { supabase } from "@/lib/supabase";
import { withTimeout } from "@/lib/supabase-errors";

/**
 * Saves the answers a visitor gave on the home page to their new profile.
 * Returns true when something was saved. On failure the answers stay in the browser
 * and the next cabinet visit tries again.
 */
export async function syncPendingIntroQuiz(userId: string): Promise<boolean> {
  const answers = loadPendingIntroQuiz();
  if (!answers) return false;

  const { catLevel } = computeIntroQuizResult(answers);
  try {
    const { error } = await withTimeout(
      supabase.from("intro_quiz_answers").upsert(
        { user_id: userId, ...answers, cat_level: catLevel },
        { onConflict: "user_id" }
      ),
      15000
    );
    if (error) {
      console.error("[uvs:intro-quiz] save failed", error);
      return false;
    }
    clearPendingIntroQuiz();
    return true;
  } catch (error) {
    console.error("[uvs:intro-quiz] save failed", error);
    return false;
  }
}
