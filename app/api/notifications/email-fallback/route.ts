import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function GET(request: NextRequest) {
  return POST(request);
}

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (
    !cronSecret ||
    request.headers.get("authorization") !== `Bearer ${cronSecret}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resendKey = process.env.RESEND_API_KEY;
  const emailFrom = process.env.EMAIL_FROM;
  if (!resendKey || !emailFrom) {
    return NextResponse.json(
      {
        error: "Email provider is not configured",
        missing: [
          ...(!resendKey ? ["RESEND_API_KEY"] : []),
          ...(!emailFrom ? ["EMAIL_FROM"] : []),
        ],
      },
      { status: 503 }
    );
  }

  const admin = getSupabaseAdmin();
  const { data: notifications, error: notificationsError } = await admin
    .from("notifications")
    .select("*")
    .eq("is_read", false)
    .is("email_sent_at", null)
    .not("recipient_id", "is", null)
    .lte("email_fallback_at", new Date().toISOString())
    .order("email_fallback_at", { ascending: true })
    .limit(50);

  if (notificationsError) {
    return NextResponse.json(
      { error: notificationsError.message },
      { status: 500 }
    );
  }

  const recipientIds = [
    ...new Set(
      (notifications ?? [])
        .map((notification) => notification.recipient_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const { data: profiles } = recipientIds.length
    ? await admin
        .from("profiles")
        .select("id,email,full_name")
        .in("id", recipientIds)
    : { data: [] };
  const profileById = new Map(
    (profiles ?? []).map((profile) => [profile.id, profile])
  );

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://vocal-studio-pwa.vercel.app";
  let sent = 0;

  for (const notification of notifications ?? []) {
    const profile = notification.recipient_id
      ? profileById.get(notification.recipient_id)
      : null;
    if (!profile?.email) continue;

    const actionUrl = notification.action_url
      ? new URL(notification.action_url, appUrl).toString()
      : appUrl;
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: emailFrom,
        to: [profile.email],
        subject: notification.title || "Unique Vocal",
        html: `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto">
            <h2>Unique Vocal</h2>
            <p>Здравствуйте${profile.full_name ? `, ${escapeHtml(profile.full_name)}` : ""}!</p>
            <p>${escapeHtml(notification.message)}</p>
            <p><a href="${escapeHtml(actionUrl)}">Открыть приложение</a></p>
            <p style="color:#777;font-size:12px">Письмо отправлено, потому что уведомление в приложении не было прочитано в течение 5 минут.</p>
          </div>
        `,
      }),
    });

    if (!response.ok) {
      console.error("Email fallback failed:", await response.text());
      continue;
    }

    await admin
      .from("notifications")
      .update({ email_sent_at: new Date().toISOString() })
      .eq("id", notification.id)
      .eq("is_read", false);
    sent += 1;
  }

  return NextResponse.json({
    checked: notifications?.length ?? 0,
    sent,
  });
}
