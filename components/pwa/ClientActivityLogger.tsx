"use client";

import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { flushClientLog, logClientEvent } from "@/lib/client-log";

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
  const { isAuthenticated } = useAuth();

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

    const onOnline = () => {
      void flushClientLog();
    };
    const onHidden = () => {
      if (document.visibilityState === "hidden") void flushClientLog();
    };

    window.addEventListener("error", onError, true);
    window.addEventListener("unhandledrejection", onReject);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onHidden);

    return () => {
      window.removeEventListener("error", onError, true);
      window.removeEventListener("unhandledrejection", onReject);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, []);

  return null;
}
