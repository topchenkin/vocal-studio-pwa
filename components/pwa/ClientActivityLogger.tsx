"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  flushClientLog,
  logClientEvent,
  shouldSkipLoginLog,
} from "@/lib/client-log";

const SESSION_HEARTBEAT_MS = 5 * 60 * 1000;

function isNoisyError(message: string) {
  return (
    /resizeobserver|script error\.?$/i.test(message) ||
    /chrome-extension:|moz-extension:|safari-extension:/i.test(message) ||
    message.includes("log_client_event")
  );
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
      if (!message || isNoisyError(message)) continue;
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
  const { isAuthenticated, isAdmin, profile, user } = useAuth();
  const skipLogin = shouldSkipLoginLog(
    user?.email ?? profile?.email,
    isAdmin ? "admin" : profile?.role
  );

  useEffect(() => {
    if (isAuthenticated) void flushClientLog();
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || skipLogin) return;
    logClientEvent({
      kind: "login",
      name: "session",
      path: pathname,
    });
  }, [isAuthenticated, pathname, skipLogin]);

  useEffect(() => {
    if (!isAuthenticated || skipLogin) return;

    const ping = () => {
      if (document.visibilityState !== "visible") return;
      logClientEvent({
        kind: "login",
        name: "session",
        path: pathname,
      });
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") ping();
      else void flushClientLog();
    };
    const onOnline = () => {
      ping();
      void flushClientLog();
    };

    ping();
    const timer = window.setInterval(ping, SESSION_HEARTBEAT_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", ping);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", ping);
    };
  }, [isAuthenticated, pathname, skipLogin]);

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
      if (isNoisyError(message)) return;
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
      if (isNoisyError(message)) return;
      logClientEvent({
        kind: "error",
        name: "unhandled",
        detail: { message: message.slice(0, 180) },
      });
    };

    window.addEventListener("error", onError, true);
    window.addEventListener("unhandledrejection", onReject);

    return () => {
      window.removeEventListener("error", onError, true);
      window.removeEventListener("unhandledrejection", onReject);
    };
  }, []);

  return null;
}
