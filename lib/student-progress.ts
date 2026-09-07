import { supabase } from "@/lib/supabase";

export type CabinetGoalId =
  | "lesson"
  | "practice_min"
  | "cabinet"
  | "exercises"
  | "connect";

export type CabinetNextLesson = {
  id: string;
  datetime: string;
  status: string;
};

export type CabinetProgressStats = {
  practice_sec_week: number;
  practice_sec_total: number;
  lessons_week: number;
  lessons_total: number;
  exercises_week: number;
  exercises_total: number;
  analyzer_sec_week: number;
  mixer_sec_week: number;
};

export type CabinetProgress = {
  today: string;
  week_start: string;
  streak: number;
  checked_in_today: boolean;
  cabinet_days: number;
  lessons_week: number;
  practice_sec_week: number;
  exercises_week: number;
  connect_week: number;
  targets: {
    cabinet_days: number;
    lessons: number;
    practice_min: number;
    exercises: number;
    connect: number;
  };
  stats: CabinetProgressStats;
  next_lesson: CabinetNextLesson | null;
};

export const EMPTY_CABINET_PROGRESS: CabinetProgress = {
  today: "",
  week_start: "",
  streak: 0,
  checked_in_today: false,
  cabinet_days: 0,
  lessons_week: 0,
  practice_sec_week: 0,
  exercises_week: 0,
  connect_week: 0,
  targets: {
    cabinet_days: 5,
    lessons: 1,
    practice_min: 20,
    exercises: 3,
    connect: 1,
  },
  stats: {
    practice_sec_week: 0,
    practice_sec_total: 0,
    lessons_week: 0,
    lessons_total: 0,
    exercises_week: 0,
    exercises_total: 0,
    analyzer_sec_week: 0,
    mixer_sec_week: 0,
  },
  next_lesson: null,
};

export function practiceMinutes(seconds: number) {
  return Math.floor(Math.max(0, seconds) / 60);
}

export async function fetchCabinetProgress(): Promise<CabinetProgress | null> {
  const { data, error } = await supabase.rpc("student_cabinet_progress");
  if (error) {
    if (
      error.message.includes("student_cabinet_progress") ||
      error.code === "42883" ||
      error.code === "PGRST202"
    ) {
      return null;
    }
    console.warn("student_cabinet_progress", error.message);
    return null;
  }
  if (!data || typeof data !== "object" || (data as { admin?: boolean }).admin) {
    return null;
  }
  const row = data as Record<string, unknown>;
  const targets = (row.targets ?? {}) as Record<string, unknown>;
  const stats = (row.stats ?? {}) as Record<string, unknown>;
  const next = row.next_lesson as CabinetNextLesson | null;
  return {
    today: String(row.today ?? ""),
    week_start: String(row.week_start ?? ""),
    streak: Number(row.streak) || 0,
    checked_in_today: Boolean(row.checked_in_today),
    cabinet_days: Number(row.cabinet_days) || 0,
    lessons_week: Number(row.lessons_week) || 0,
    practice_sec_week: Number(row.practice_sec_week) || 0,
    exercises_week: Number(row.exercises_week) || 0,
    connect_week: Number(row.connect_week) || 0,
    targets: {
      cabinet_days: Number(targets.cabinet_days) || 5,
      lessons: Number(targets.lessons) || 1,
      practice_min: Number(targets.practice_min) || 20,
      exercises: Number(targets.exercises) || 3,
      connect: Number(targets.connect) || 1,
    },
    stats: {
      practice_sec_week: Number(stats.practice_sec_week) || 0,
      practice_sec_total: Number(stats.practice_sec_total) || 0,
      lessons_week: Number(stats.lessons_week) || 0,
      lessons_total: Number(stats.lessons_total) || 0,
      exercises_week: Number(stats.exercises_week) || 0,
      exercises_total: Number(stats.exercises_total) || 0,
      analyzer_sec_week: Number(stats.analyzer_sec_week) || 0,
      mixer_sec_week: Number(stats.mixer_sec_week) || 0,
    },
    next_lesson: next?.id && next.datetime ? next : null,
  };
}
