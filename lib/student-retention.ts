import { supabase } from "@/lib/supabase";

export type VocalPathState = "done" | "current" | "locked";

export type RetentionBoard = {
  today: string;
  phrase: { id: string; title: string; line: string; done: boolean };
  quests: { cabinet: boolean; phrase: boolean; minute: boolean };
  streak: number;
  freezeLeft: boolean;
  comeback: boolean;
  path: Array<{
    id: string;
    title: string;
    stage: string;
    state: VocalPathState;
  }>;
  reviews: Array<{ id: string; title: string }>;
  records: {
    bestStreak: number;
    bestWeekMin: number;
    weekMin: number;
    bestPhraseSec: number;
  };
  duo: {
    active: boolean;
    partnerDone: boolean;
    together: boolean;
    streak: number;
  } | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asBool(value: unknown) {
  return Boolean(value);
}

export function parseRetentionBoard(data: unknown): RetentionBoard | null {
  const row = asRecord(data);
  if (row.admin) return null;
  const phrase = asRecord(row.phrase);
  const quests = asRecord(row.quests);
  const records = asRecord(row.records);
  const duoRaw = row.duo;
  const path = Array.isArray(row.path) ? row.path : [];
  const reviews = Array.isArray(row.reviews) ? row.reviews : [];
  if (!phrase.id) return null;
  return {
    today: String(row.today ?? ""),
    phrase: {
      id: String(phrase.id),
      title: String(phrase.title ?? ""),
      line: String(phrase.line ?? ""),
      done: asBool(phrase.done),
    },
    quests: {
      cabinet: asBool(quests.cabinet),
      phrase: asBool(quests.phrase),
      minute: asBool(quests.minute),
    },
    streak: Number(row.streak) || 0,
    freezeLeft: asBool(row.freeze_left),
    comeback: asBool(row.comeback),
    path: path.map((item) => {
      const node = asRecord(item);
      const state = String(node.state ?? "locked");
      return {
        id: String(node.id ?? ""),
        title: String(node.title ?? ""),
        stage: String(node.stage ?? ""),
        state:
          state === "done" || state === "current" ? state : "locked",
      };
    }),
    reviews: reviews.map((item) => {
      const review = asRecord(item);
      return { id: String(review.id ?? ""), title: String(review.title ?? "") };
    }),
    records: {
      bestStreak: Number(records.best_streak) || 0,
      bestWeekMin: Number(records.best_week_min) || 0,
      weekMin: Number(records.week_min) || 0,
      bestPhraseSec: Number(records.best_phrase_sec) || 0,
    },
    duo:
      duoRaw && typeof duoRaw === "object"
        ? {
            active: true,
            partnerDone: asBool(asRecord(duoRaw).partner_done),
            together: asBool(asRecord(duoRaw).together),
            streak: Number(asRecord(duoRaw).streak) || 0,
          }
        : null,
  };
}

export async function fetchRetentionBoard(): Promise<RetentionBoard | null> {
  const { data, error } = await supabase.rpc("student_retention_board");
  if (error) {
    if (
      error.message.includes("student_retention_board") ||
      error.code === "42883" ||
      error.code === "PGRST202"
    ) {
      return null;
    }
    console.warn("student_retention_board", error.message);
    return null;
  }
  return parseRetentionBoard(data);
}

export async function closeVocalStep(input: {
  kind: "phrase" | "exercise";
  ref: string;
  title: string;
  mark: "ok" | "again";
  seconds: number;
}): Promise<boolean> {
  const { error } = await supabase.rpc("close_vocal_step", {
    p_kind: input.kind,
    p_ref: input.ref,
    p_title: input.title,
    p_mark: input.mark,
    p_seconds: Math.round(input.seconds),
  });
  if (error) {
    console.warn("close_vocal_step", error.message);
    return false;
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("uvs-cabinet-progress"));
  }
  return true;
}

export function isExerciseRef(ref: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    ref
  );
}
