/**
 * Delivers Web Push for the static PWA.
 * Chat inserts no longer hit Next /api, so nothing was calling web-push.
 * This process polls `notifications` and sends to `push_subscriptions`.
 */
import { createServer } from "node:http";
import webpush from "web-push";

const PORT = Number(process.env.PORT) || 8789;
const BIND = process.env.BIND || "127.0.0.1";
const SUPABASE_URL = (
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  ""
).replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT || "mailto:iris.jar008@gmail.com";
const POLL_MS = Number(process.env.PUSH_POLL_MS) || 4000;
const REMIND_MS = Number(process.env.PUSH_REMIND_MS) || 15 * 60 * 1000;
const APP_ORIGIN = (
  process.env.NEXT_PUBLIC_APP_URL || "https://www.uniquevocal.ru"
).replace(/\/$/, "");

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function sbHeaders(extra = {}) {
  return {
    apikey: SERVICE_KEY,
    authorization: `Bearer ${SERVICE_KEY}`,
    "content-type": "application/json",
    prefer: "return=representation",
    ...extra,
  };
}

async function sb(path, init = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: { ...sbHeaders(init.headers), ...(init.headers || {}) },
  });
  return response;
}

function isExerciseResultText(raw) {
  const text = String(raw || "");
  return (
    text.includes("UVS_EXERCISE_RESULT") ||
    text.includes('"kind":"exercise_result"') ||
    /результаты упражнения/i.test(text)
  );
}

function isVocalReportText(raw) {
  const text = String(raw || "");
  return (
    /"v"\s*:\s*1/.test(text) ||
    text.includes("overallScore") ||
    text.includes("Отчёт вокалиста") ||
    text.includes("Отчет вокалиста")
  );
}

function safeActionUrl(row) {
  const raw = String(row.action_url || "").trim();
  const fallback =
    row.recipient_role === "admin"
      ? "/dashboard/admin?tab=chat"
      : "/dashboard/student?tab=chat";
  if (
    !raw ||
    raw.startsWith("{") ||
    raw.startsWith("[") ||
    raw.includes("overallScore")
  ) {
    return fallback;
  }
  try {
    const url = new URL(raw, APP_ORIGIN);
    const pathname = url.pathname.replace(/\.(txt|json)$/i, "");
    if (!pathname.startsWith("/dashboard")) return fallback;
    return `${pathname}${url.search}`;
  } catch {
    return fallback;
  }
}

function previewPayload(row) {
  const message = String(row.message || "");
  if (isExerciseResultText(message) || /результаты упражнения/i.test(String(row.title || ""))) {
    const text =
      String(row.title || "").trim() ||
      message.replace(/\s+/g, " ").trim() ||
      "Результаты упражнения";
    return {
      title: text,
      body: "Результаты упражнения",
      url: safeActionUrl(row),
    };
  }
  if (isVocalReportText(message)) {
    return {
      title: row.title || "Иришка",
      body: "Отчет от ученика",
      url: safeActionUrl({ ...row, recipient_role: row.recipient_role || "admin" }),
    };
  }
  const body = message.replace(/\s+/g, " ").trim().slice(0, 140);
  return {
    title: row.title || "Иришка",
    body: body || "Новое уведомление",
    url: safeActionUrl(row),
  };
}

async function markSent(ids) {
  if (ids.length === 0) return;
  const filter = ids.join(",");
  await sb(`/rest/v1/notifications?id=in.(${filter})`, {
    method: "PATCH",
    body: JSON.stringify({ push_sent_at: new Date().toISOString() }),
  });
}

async function skipBacklog() {
  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const response = await sb(
    `/rest/v1/notifications?push_sent_at=is.null&created_at=lt.${encodeURIComponent(cutoff)}`,
    {
      method: "PATCH",
      headers: { prefer: "return=minimal" },
      body: JSON.stringify({ push_sent_at: cutoff }),
    }
  );
  if (!response.ok && response.status !== 404) {
    const text = await response.text();
    console.error("push backlog skip failed", response.status, text.slice(0, 300));
  }
}

async function loadSubscriptions(userIds) {
  if (userIds.length === 0) return [];
  const filter = userIds.join(",");
  const response = await sb(
    `/rest/v1/push_subscriptions?user_id=in.(${filter})&select=endpoint,user_id,p256dh,auth`
  );
  if (!response.ok) return [];
  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}

async function dropSubscription(endpoint) {
  await sb(`/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, {
    method: "DELETE",
    headers: { prefer: "return=minimal" },
  });
}

async function deliver(row, subscriptions) {
  const payload = JSON.stringify(previewPayload(row));
  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          payload
        );
      } catch (error) {
        const status = Number(error?.statusCode) || 0;
        if (status === 404 || status === 410) {
          await dropSubscription(subscription.endpoint);
          return;
        }
        console.error("web-push failed", status, error?.message || error);
      }
    })
  );
}

async function pollOnce() {
  const response = await sb(
    `/rest/v1/notifications?push_sent_at=is.null&select=id,recipient_id,recipient_role,title,message,action_url,created_at&order=created_at.asc&limit=25`
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`list notifications ${response.status}: ${text.slice(0, 200)}`);
  }
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length === 0) return 0;

  const recipientIds = [
    ...new Set(rows.map((row) => row.recipient_id).filter(Boolean)),
  ];
  const subscriptions = await loadSubscriptions(recipientIds);
  const byUser = new Map();
  for (const item of subscriptions) {
    const list = byUser.get(item.user_id) || [];
    list.push(item);
    byUser.set(item.user_id, list);
  }

  for (const row of rows) {
    const targets = row.recipient_id ? byUser.get(row.recipient_id) || [] : [];
    if (targets.length > 0) {
      await deliver(row, targets);
    }
    await markSent([row.id]);
  }
  return rows.length;
}

let ticking = false;
let lastRemindAt = 0;

async function remindPendingReschedules() {
  const response = await sb("/rest/v1/rpc/remind_pending_reschedules", {
    method: "POST",
    body: "{}",
  });
  if (!response.ok) {
    const text = await response.text();
    console.error(
      "remind pending failed",
      response.status,
      text.slice(0, 300)
    );
    return;
  }
  try {
    const count = await response.json();
    if (count) console.log("pending reschedule reminders", count);
  } catch {
    // RPC may return empty
  }
}

async function remindSubscriptionExpiring() {
  try {
    await sb("/rest/v1/rpc/expire_app_subscriptions", {
      method: "POST",
      body: "{}",
    });
  } catch (error) {
    console.error("expire subscriptions failed", error?.message || error);
  }

  const response = await sb("/rest/v1/rpc/remind_subscription_expiring", {
    method: "POST",
    body: "{}",
  });
  if (!response.ok) {
    const text = await response.text();
    console.error(
      "subscription expiry remind failed",
      response.status,
      text.slice(0, 300)
    );
    return;
  }
  try {
    const count = await response.json();
    if (count) console.log("subscription expiry reminders", count);
  } catch {
    // RPC may return empty
  }
}

async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    await pollOnce();
    if (Date.now() - lastRemindAt >= REMIND_MS) {
      lastRemindAt = Date.now();
      await remindPendingReschedules();
      await remindSubscriptionExpiring();
    }
  } catch (error) {
    console.error("push poll failed", error?.message || error);
  } finally {
    ticking = false;
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/uvs-push/health")) {
    json(res, 200, {
      ok: true,
      configured: Boolean(VAPID_PUBLIC && VAPID_PRIVATE && SERVICE_KEY && SUPABASE_URL),
      app: APP_ORIGIN,
    });
    return;
  }
  json(res, 404, { error: "Not found" });
});

if (!VAPID_PUBLIC || !VAPID_PRIVATE || !SERVICE_KEY || !SUPABASE_URL) {
  console.error("push-api missing VAPID or Supabase env");
  process.exit(1);
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

server.listen(PORT, BIND, () => {
  console.log(`push-api listening on ${BIND}:${PORT}`);
  void skipBacklog().then(() => {
    void tick();
    setInterval(() => void tick(), POLL_MS);
  });
});
