import webPush from "web-push";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

interface PushPayload {
  title: string;
  body: string;
  url: string;
}

export async function sendWebPush(
  recipientIds: string[],
  payload: PushPayload
) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey || recipientIds.length === 0) {
    return {
      delivered: 0,
      configured: Boolean(publicKey && privateKey),
      missing: [
        ...(!publicKey ? ["NEXT_PUBLIC_VAPID_PUBLIC_KEY"] : []),
        ...(!privateKey ? ["VAPID_PRIVATE_KEY"] : []),
      ],
    };
  }

  webPush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:iris.jar008@gmail.com",
    publicKey,
    privateKey
  );

  const admin = getSupabaseAdmin();
  const { data: subscriptions, error } = await admin
    .from("push_subscriptions")
    .select("*")
    .in("user_id", recipientIds);

  if (error) throw error;

  let delivered = 0;
  await Promise.all(
    (subscriptions ?? []).map(async (subscription) => {
      try {
        await webPush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          JSON.stringify(payload)
        );
        delivered += 1;
      } catch (pushError) {
        const statusCode =
          typeof pushError === "object" &&
          pushError !== null &&
          "statusCode" in pushError
            ? Number(pushError.statusCode)
            : 0;

        if (statusCode === 404 || statusCode === 410) {
          await admin
            .from("push_subscriptions")
            .delete()
            .eq("endpoint", subscription.endpoint);
          return;
        }

        console.error("Unable to deliver Web Push:", pushError);
      }
    })
  );

  return { delivered, configured: true, missing: [] as string[] };
}
