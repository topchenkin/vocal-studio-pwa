"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { flushClientLog, logClientEvent } from "@/lib/client-log";

function netHint() {
  const conn = (
    navigator as Navigator & {
      connection?: { effectiveType?: string };
    }
  ).connection;
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator &&
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
  return {
    online: navigator.onLine,
    pwa: standalone,
    ...(conn?.effectiveType ? { effective_type: conn.effectiveType } : {}),
  };
}

function clickLabel(el: Element): string | null {
  const named = el.getAttribute("data-uvs-act") || el.getAttribute("aria-label");
  if (named) return named.slice(0, 80);
  const text = (el.textContent || "").replace(/\s+/g, " ").trim();
  if (!text || text.length > 64) return null;
  if (/^https?:/i.test(text) || text.includes("@")) return null;
  return text;
}

function drainBootLogs() {
  try {
    const raw = sessionStorage.getItem("uvs-logs");
    if (!raw) return;
    const rows = JSON.parse(raw) as Array<{ e?: string }>;
    sessionStorage.removeItem("uvs-logs");
    if (!Array.isArray(rows)) return;
    for (const row of rows.slice(-12)) {
      const message = String(row?.e || "").slice(0, 180);
      if (!message) continue;
      logClientEvent({
        kind: "error",
        name: "boot",
        detail: { message },
      });
    }
  } catch {
    /* private mode */
  }
}

export default function ClientActivityLogger() {
  const pathname = usePathname() || "/";
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) return;
    logClientEvent({
      kind: "screen",
      name: pathname,
      path: pathname,
      detail: netHint(),
    });
  }, [isAuthenticated, pathname]);

  useEffect(() => {
    if (isAuthenticated) void flushClientLog();
  }, [isAuthenticated]);

  useEffect(() => {
    drainBootLogs();

    const onError = (event: ErrorEvent) => {
      const el = event.target;
      if (el instanceof HTMLElement && "src" in el) {
        const src = String((el as HTMLElement & { src?: string }).src || "");
        logClientEvent({
          kind: "error",
          name: "resource",
          detail: { message: src.split("?")[0]?.slice(-120) || "resource" },
        });
        return;
      }
      const message = String(event.message || "window_error").slice(0, 180);
      if (message.includes("log_client_event")) return;
      logClientEvent({
        kind: "error",
        name: "window",
        detail: { message },
      });
    };

    const onReject = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === "string"
            ? reason
            : "unhandledrejection";
      if (message.includes("log_client_event")) return;
      logClientEvent({
        kind: "error",
        name: "unhandled",
        detail: { message: message.slice(0, 180) },
      });
    };

    const onOffline = () => {
      logClientEvent({ kind: "connect", name: "offline", detail: netHint() });
    };
    const onOnline = () => {
      logClientEvent({ kind: "connect", name: "online", detail: netHint() });
      void flushClientLog();
    };
    const onHidden = () => {
      if (document.visibilityState === "hidden") void flushClientLog();
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("input, textarea, select, [contenteditable='true']")) {
        return;
      }
      const hit = target.closest("button, a, [role='button']");
      if (!hit) return;
      const name = clickLabel(hit);
      if (!name) return;
      logClientEvent({
        kind: "action",
        name,
        detail: { tag: hit.tagName.toLowerCase() },
      });
    };

    window.addEventListener("error", onError, true);
    window.addEventListener("unhandledrejection", onReject);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onHidden);
    document.addEventListener("click", onClick, true);

    return () => {
      window.removeEventListener("error", onError, true);
      window.removeEventListener("unhandledrejection", onReject);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onHidden);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  return null;
}
