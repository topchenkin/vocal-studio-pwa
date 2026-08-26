import { supabase } from "@/lib/supabase";
import {
  toVocalReportPayload,
  vocalReportChatText,
  type VocalReportPayload,
} from "@/lib/vocal-report-payload";
import type { VocalReport } from "@/lib/vocal-metrics";
import type { ChatMessage } from "@/types";

export type VocalTestResultRow = {
  id: string;
  user_id: string;
  mode: "note" | "scale";
  target_label: string;
  duration_sec: number;
  overall_score: number;
  pitch_accuracy: number;
  tone_stability: number;
  breath_control: number;
  too_quiet: boolean;
  payload: VocalReportPayload;
  review_status?: "none" | "pending" | "approved" | "rejected";
  created_at: string;
};

export async function saveVocalTestResult(
  userId: string,
  report: VocalReport
): Promise<string | null> {
  const payload = toVocalReportPayload(report);
  const { data, error } = await supabase
    .from("vocal_test_results")
    .insert({
      user_id: userId,
      mode: report.mode,
      target_label: report.targetLabel,
      duration_sec: report.durationSec,
      overall_score: report.overallScore,
      pitch_accuracy: report.pitchAccuracy,
      tone_stability: report.toneStability,
      breath_control: report.breathControl,
      too_quiet: report.tooQuiet,
      payload,
    })
    .select("id")
    .single();
  if (error) {
    if (
      error.message.includes("vocal_test_results") ||
      error.code === "42P01"
    ) {
      throw new Error(
        "Таблица прогресса ещё не создана. Выполните SQL vocal-test-results в Supabase."
      );
    }
    throw new Error(error.message);
  }
  return data?.id ?? null;
}

export async function listVocalTestResults(
  userId: string,
  limit = 80
): Promise<VocalTestResultRow[]> {
  const { data, error } = await supabase
    .from("vocal_test_results")
    .select("*")
    .eq("user_id", userId)
    .eq("too_quiet", false)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (
      error.message.includes("vocal_test_results") ||
      error.code === "42P01"
    ) {
      return [];
    }
    throw new Error(error.message);
  }
  return (data ?? []) as VocalTestResultRow[];
}

/**
 * Static host has no Next `/api/chat/*` (Caddy `/api` is the AI service).
 * Insert into chat_messages with the student session — same RLS as a normal
 * student message, so reports still go through if the chat UI is paywalled.
 */
export async function sendVocalReportToChat(input: {
  studentId: string;
  senderId: string;
  senderName: string;
  report: VocalReport;
  resultId?: string;
}): Promise<void> {
  const message = vocalReportChatText(
    toVocalReportPayload(input.report, input.resultId)
  );
  const row = {
    student_id: input.studentId,
    sender_id: input.senderId,
    sender_name: input.senderName,
    message,
    media_path: null,
    media_mime: null,
    media_duration_sec: null,
  };

  const typed = await supabase
    .from("chat_messages")
    .insert({
      ...row,
      message_type: "vocal_report" as ChatMessage["message_type"],
    })
    .select("id")
    .single();

  if (!typed.error) return;

  const fallback = await supabase
    .from("chat_messages")
    .insert({
      ...row,
      message_type: "text",
    })
    .select("id")
    .single();

  if (fallback.error) {
    throw new Error(fallback.error.message || "Не удалось отправить отчёт в чат");
  }
}
