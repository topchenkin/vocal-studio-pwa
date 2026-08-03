import { NextRequest, NextResponse } from "next/server";
import { ADMIN_DISPLAY_NAME, ADMIN_EMAIL } from "@/lib/admin";
import { sendWebPush } from "@/lib/push";
import { getRequestUser } from "@/lib/server-auth";

export const runtime = "nodejs";

const CHAT_TAB_URL = "/dashboard/student?tab=chat";

export async function POST(request: NextRequest) {
  try {
    const auth = await getRequestUser(request);
    if (!auth) {
      return NextResponse.json(
        { error: "Admin session is missing or expired" },
        { status: 401 }
      );
    }
    const isAdmin =
      auth.profile.role === "admin" ||
      auth.user.email?.toLowerCase() === ADMIN_EMAIL;
    if (!isAdmin) {
      return NextResponse.json(
        { error: `Admin access required (current role: ${auth.profile.role})` },
        { status: 403 }
      );
    }

    const body = (await request.json()) as {
      recipientIds?: string[];
      message?: string;
      title?: string;
    };
    const message = body.message?.trim();
    const topic = body.title?.trim() || "Уведомление";
    const recipientIds = [...new Set(body.recipientIds ?? [])];

    if (!message || message.length > 500 || topic.length > 80 || recipientIds.length === 0) {
      return NextResponse.json({ error: "Invalid notification" }, { status: 400 });
    }

    const { data: recipients, error: recipientError } = await auth.admin
      .from("profiles")
      .select("id")
      .eq("role", "student")
      .in("id", recipientIds);

    if (recipientError) throw recipientError;
    const validRecipientIds = (recipients ?? []).map((item) => item.id);
    if (validRecipientIds.length === 0) {
      return NextResponse.json({ error: "Recipients were not found" }, { status: 404 });
    }

    const chatText =
      topic && topic !== ADMIN_DISPLAY_NAME ? `${topic}\n\n${message}` : message;

    const { error: insertError } = await auth.admin.from("notifications").insert(
      validRecipientIds.map((recipientId) => ({
        recipient_id: recipientId,
        recipient_role: "student" as const,
        title: topic,
        message,
        kind: "general" as const,
        action_url: CHAT_TAB_URL,
        email_fallback_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      }))
    );
    if (insertError) throw insertError;

    // Mirror into personal chats so tap → chat shows the same content.
    const { error: chatError } = await auth.admin.from("chat_messages").insert(
      validRecipientIds.map((recipientId) => ({
        student_id: recipientId,
        sender_id: auth.user.id,
        sender_name: ADMIN_DISPLAY_NAME,
        message: chatText,
        message_type: "announcement",
        media_path: null,
        media_mime: null,
        media_duration_sec: null,
      }))
    );
    if (chatError) throw chatError;

    // Telegram-style: title = sender, body = text. OS may still show app attribution.
    const push = await sendWebPush(validRecipientIds, {
      title: ADMIN_DISPLAY_NAME,
      body: message.slice(0, 180),
      url: CHAT_TAB_URL,
    });

    return NextResponse.json({
      recipients: validRecipientIds.length,
      pushDelivered: push.delivered,
      pushConfigured: push.configured,
      pushMissing: push.missing,
    });
  } catch (error) {
    console.error("Notification send failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Notification failed" },
      { status: 500 }
    );
  }
}
