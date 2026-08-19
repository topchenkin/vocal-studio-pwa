/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
}

const PENDING_NAV_CACHE = "uvs-pending-nav";
const PENDING_NAV_KEY = "/pending-nav";

function resolveTargetUrl(raw: string | undefined): string {
  const fallback = "/dashboard/student?tab=chat";
  const text = (raw || "").trim();
  if (
    !text ||
    text.startsWith("{") ||
    text.startsWith("[") ||
    text.includes("overallScore")
  ) {
    return new URL(fallback, self.location.origin).href;
  }
  try {
    const url = new URL(text, self.location.origin);
    url.pathname = url.pathname.replace(/\.(txt|json)$/i, "");
    if (url.origin !== self.location.origin || !url.pathname.startsWith("/dashboard")) {
      return new URL(fallback, self.location.origin).href;
    }
    return url.href;
  } catch {
    return new URL(fallback, self.location.origin).href;
  }
}

async function storePendingNav(url: string) {
  try {
    const cache = await caches.open(PENDING_NAV_CACHE);
    await cache.put(PENDING_NAV_KEY, new Response(url, { status: 200 }));
  } catch {
    // ignore cache failures
  }
}

self.addEventListener("install", () => {
  void self.skipWaiting();
});

self.addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event: PushEvent) => {
  let payload: PushPayload = {};
  try {
    payload = event.data?.json() as PushPayload;
  } catch {
    payload = { body: event.data?.text() };
  }

  const targetUrl = resolveTargetUrl(payload.url);

  event.waitUntil(
    self.registration.showNotification(payload.title ?? "Иришка", {
      body: payload.body ?? "Новое сообщение",
      data: { url: targetUrl },
      // Keep icon/badge minimal — OS still attributes the app name itself.
    })
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const targetUrl = resolveTargetUrl(
    typeof event.notification.data?.url === "string"
      ? event.notification.data.url
      : undefined
  );

  event.waitUntil(
    (async () => {
      // Persist before openWindow — iOS often launches start_url instead.
      await storePendingNav(targetUrl);

      const clientsList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      const existing = clientsList.find((client) =>
        client.url.startsWith(self.location.origin)
      );

      // Never use client.navigate() — Next.js App Router ignores ?tab=...
      if (existing) {
        await existing.focus();
        existing.postMessage({ type: "UVS_NAVIGATE", url: targetUrl });
        return;
      }

      const opened = await self.clients.openWindow(targetUrl);
      if (!opened) {
        // Fallback: open root; pending-nav listener will redirect to chat.
        await self.clients.openWindow(self.location.origin + "/");
      }
    })()
  );
});

export {};
