import { supabase } from "@/lib/supabase";

export type PracticeKind = "analyzer" | "mixer" | "exercise";

export async function logPracticeSeconds(
  kind: PracticeKind,
  seconds: number
): Promise<void> {
  const amount = Math.round(seconds);
  if (!Number.isFinite(amount) || amount < 1) return;
  const { error } = await supabase.rpc("log_practice_seconds", {
    p_kind: kind,
    p_seconds: amount,
  });
  if (error) {
    if (
      error.message.includes("log_practice_seconds") ||
      error.code === "42883" ||
      error.code === "PGRST202"
    ) {
      return;
    }
    console.warn("log_practice_seconds", error.message);
  }
}
