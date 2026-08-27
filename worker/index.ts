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

function isScriptLike(request: Request, path: string) {
  const dest = request.destination;
  return (
    dest === "script" ||
    dest === "style" ||
    dest === "worker" ||
    path.startsWith("/_next/static/") ||
    /\.(?:js|css|mjs)$/i.test(path)
  );
}

self.addEventListener("install", () => {
  void self.skipWaiting();
});

self.addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (key) =>
              key.includes("start-url") ||
              key.includes("next-static-assets") ||
              /-pages$/.test(key) ||
              key.endsWith("-pages")
          )
          .map((key) => caches.delete(key))
      );
    })()
  );
});

self.addEventListener("fetch", (event: FetchEvent) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (!isScriptLike(request, url.pathname)) return;

  event.respondWith(
    (async () => {
      const response = await fetch(request);
      const type = (response.headers.get("content-type") || "").toLowerCase();
      if (type.includes("text/html")) {
        return new Response("", {
          status: 404,
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      }
      return response;
    })()
  );
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
