import { NextRequest, NextResponse } from "next/server";
import { ADMIN_EMAIL } from "@/lib/admin";
import { sendWebPush } from "@/lib/push";
import { getRequestUser } from "@/lib/server-auth";

export const runtime = "nodejs";

/**
 * Dedicated endpoint so ANY authenticated student can send a vocal-test report
 * to the teacher chat — even if app_sub_tier is "none" (chat paywall).
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getRequestUser(request);
    if (!auth) {
      return NextResponse.json(
        { error: "Сессия истекла. Войдите снова." },
        { status: 401 }
      );
    }

    const isAdmin =
      auth.profile.role === "admin" ||
      auth.user.email?.toLowerCase() === ADMIN_EMAIL;

    if (isAdmin) {
      return NextResponse.json(
        { error: "Отчёт вокалиста отправляет ученик, не администратор." },
        { status: 400 }
      );
    }

    if (auth.profile.role !== "student") {
      return NextResponse.json({ error: "Только для учеников" }, { status: 403 });
    }

    const body = (await request.json()) as {
      message?: string;
      overallScore?: number;
    };
    const message = body.message?.trim() ?? "";
    if (!message || message.length > 2000) {
      return NextResponse.json(
        { error: "Текст отчёта пустой или слишком длинный" },
        { status: 400 }
      );
    }

    const senderName = auth.profile.full_name || "Ученик";

    const { data: createdMessage, error: insertError } = await auth.admin
      .from("chat_messages")
      .insert({
        student_id: auth.user.id,
        sender_id: auth.user.id,
        sender_name: senderName,
        message,
        message_type: "text",
        media_path: null,
        media_mime: null,
        media_duration_sec: null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("vocal-report insert failed:", insertError);
      return NextResponse.json(
        { error: insertError.message || "Не удалось сохранить отчёт в чат" },
        { status: 500 }
      );
    }

    const { data: admins } = await auth.admin
      .from("profiles")
      .select("id")
      .eq("role", "admin");

    const scoreHint =
      typeof body.overallScore === "number"
        ? ` · ${body.overallScore}/100`
        : "";

    await sendWebPush(
      (admins ?? []).map((item) => item.id),
      {
        title: senderName,
        body: `Отчёт вокалиста${scoreHint}`,
        url: `/dashboard/admin?tab=chat&student=${auth.user.id}`,
      }
    );

    return NextResponse.json({ message: createdMessage, ok: true });
  } catch (error) {
    console.error("vocal-report failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Не удалось отправить отчёт",
      },
      { status: 500 }
    );
  }
}
