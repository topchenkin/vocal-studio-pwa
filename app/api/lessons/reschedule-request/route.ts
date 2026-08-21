import { NextRequest, NextResponse } from "next/server";
import { ADMIN_DISPLAY_NAME } from "@/lib/admin";
import { sendWebPush } from "@/lib/push";
import { getRequestUser } from "@/lib/server-auth";

export const runtime = "nodejs";

/**
 * Leftover for `next dev` only. GitHub Pages static export has no API routes.
 * Production student UI calls `request_lesson_reschedule` via the Supabase client.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getRequestUser(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = (await request.json()) as {
      lessonId?: string;
      preferredDatetime?: string | null;
      note?: string | null;
    };

    const lessonId = body.lessonId?.trim();
    if (!lessonId) {
      return NextResponse.json({ error: "lessonId required" }, { status: 400 });
    }

    const { data: lesson, error: lessonError } = await auth.admin
      .from("lessons")
      .select("*")
      .eq("id", lessonId)
      .eq("student_id", auth.user.id)
      .eq("status", "scheduled")
      .maybeSingle();

    if (lessonError || !lesson) {
      return NextResponse.json(
        { error: "Урок не найден или недоступен для переноса" },
        { status: 404 }
      );
    }

    const { error: updateError } = await auth.admin
      .from("lessons")
      .update({ reschedule_request: "pending" })
      .eq("id", lessonId)
      .eq("student_id", auth.user.id)
      .in("reschedule_request", ["none", "rejected"]);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    const studentName =
      auth.profile.full_name || auth.user.email || "Ученик";
    const currentWhen = new Date(lesson.datetime).toLocaleString("ru-RU", {
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });
    let preferredText = "";
    if (body.preferredDatetime) {
      const preferred = new Date(body.preferredDatetime);
      if (!Number.isNaN(preferred.getTime())) {
        preferredText = preferred.toLocaleString("ru-RU", {
          day: "numeric",
          month: "long",
          hour: "2-digit",
          minute: "2-digit",
        });
      }
    }
    const note = body.note?.trim().slice(0, 200) ?? "";

    const messageParts = [
      `${studentName} запросил(а) перенос урока`,
      `Сейчас: ${currentWhen}`,
      preferredText ? `Желаемое время: ${preferredText}` : null,
      note ? `Комментарий: ${note}` : null,
    ].filter(Boolean);

    const message = messageParts.join(". ");
    const actionUrl = `/dashboard/admin?tab=schedule&lesson=${lessonId}`;

    const { data: admins } = await auth.admin
      .from("profiles")
      .select("id")
      .eq("role", "admin");
    const adminIds = (admins ?? []).map((item) => item.id);

    const notificationRows: Array<{
      recipient_id: string | null;
      recipient_role: "admin";
      title: string;
      message: string;
      kind: "lesson";
      action_url: string;
      email_fallback_at: string;
    }> =
      adminIds.length > 0
        ? adminIds.map((recipientId) => ({
            recipient_id: recipientId,
            recipient_role: "admin" as const,
            title: "Запрос переноса урока",
            message,
            kind: "lesson" as const,
            action_url: actionUrl,
            email_fallback_at: new Date(Date.now() + 5 * 60_000).toISOString(),
          }))
        : [
            {
              recipient_id: null,
              recipient_role: "admin" as const,
              title: "Запрос переноса урока",
              message,
              kind: "lesson" as const,
              action_url: actionUrl,
              email_fallback_at: new Date(Date.now() + 5 * 60_000).toISOString(),
            },
          ];

    await auth.admin.from("notifications").insert(notificationRows);

    const push = await sendWebPush(adminIds, {
      title: ADMIN_DISPLAY_NAME,
      body: message.slice(0, 180),
      url: actionUrl,
    });

    return NextResponse.json({
      ok: true,
      pushDelivered: push.delivered,
      pushConfigured: push.configured,
    });
  } catch (error) {
    console.error("Reschedule request failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Request failed" },
      { status: 500 }
    );
  }
}
