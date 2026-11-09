import { APP_RELEASE } from "@/lib/app-release";
import { supabase } from "@/lib/supabase";

export type ClientLogKind = "screen" | "action" | "error" | "connect";

export type ClientLogDetail = Record<
  string,
  string | number | boolean | null
>;

type QueuedEvent = {
  kind: ClientLogKind;
  name: string;
  path: string;
  detail: ClientLogDetail;
};

const MAX_QUEUE = 40;
const MAX_PER_MIN = 30;
const queue: QueuedEvent[] = [];
const sentAt: number[] = [];

let flushing = false;
let lastScreen = "";
let lastScreenAt = 0;
let lastConnectKey = "";
let lastConnectAt = 0;
let lastActionKey = "";
let lastActionAt = 0;

function clip(value: string, max = 180): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function safePath(raw?: string): string {
  if (!raw) {
    if (typeof window === "undefined") return "";
    const path = window.location.pathname.slice(0, 120);
    if (path.startsWith("/gate/")) return "/gate";
    return path;
  }
  try {
    const url = raw.startsWith("http")
      ? new URL(raw)
      : new URL(raw, "https://www.uniquevocal.ru");
    const path = (url.pathname || "/").slice(0, 120);
    if (path.startsWith("/gate/")) return "/gate";
    return path;
  } catch {
    const path = clip(raw.split("?")[0] || "", 120);
    if (path.startsWith("/gate/")) return "/gate";
    return path;
  }
}

function cleanDetail(raw?: ClientLogDetail): ClientLogDetail {
  const out: ClientLogDetail = {};
  if (!raw) return out;
  for (const [key, value] of Object.entries(raw)) {
    if (!/^[a-z0-9_]{1,32}$/i.test(key)) continue;
    if (value == null || typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    } else {
      out[key] = clip(String(value));
    }
  }
  return out;
}

function underRateLimit(): boolean {
  const cutoff = Date.now() - 60_000;
  while (sentAt.length && (sentAt[0] ?? 0) < cutoff) sentAt.shift();
  return sentAt.length < MAX_PER_MIN;
}

export function logClientEvent(input: {
  kind: ClientLogKind;
  name: string;
  path?: string;
  detail?: ClientLogDetail;
}): void {
  if (typeof window === "undefined") return;
  const name = clip(input.name, 80);
  if (!name) return;

  const now = Date.now();
  if (input.kind === "screen") {
    if (name === lastScreen && now - lastScreenAt < 2_000) return;
    lastScreen = name;
    lastScreenAt = now;
  }
  if (input.kind === "connect") {
    const key = `${name}:${JSON.stringify(input.detail ?? {})}`;
    if (key === lastConnectKey && now - lastConnectAt < 15_000) return;
    lastConnectKey = key;
    lastConnectAt = now;
  }
  if (input.kind === "action") {
    const key = `${name}:${input.path ?? ""}`;
    if (key === lastActionKey && now - lastActionAt < 1_200) return;
    lastActionKey = key;
    lastActionAt = now;
  }

  queue.push({
    kind: input.kind,
    name,
    path: safePath(input.path),
    detail: cleanDetail(input.detail),
  });
  if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
  void flushClientLog();
}

export async function flushClientLog(): Promise<void> {
  if (flushing || typeof window === "undefined" || queue.length === 0) return;
  flushing = true;
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    const ua = clip(navigator.userAgent, 180);
    while (queue.length && underRateLimit()) {
      const event = queue.shift();
      if (!event) break;
      sentAt.push(Date.now());
      const { error } = await supabase.rpc("log_client_event", {
        p_kind: event.kind,
        p_name: event.name,
        p_path: event.path,
        p_detail: event.detail,
        p_release: APP_RELEASE,
        p_ua: ua,
      });
      if (error) {
        if (
          error.message.includes("log_client_event") ||
          error.code === "42883" ||
          error.code === "PGRST202"
        ) {
          queue.length = 0;
          return;
        }
        queue.unshift(event);
        return;
      }
    }
  } catch {
    // Keep the queue; the next screen or reconnect will retry.
  } finally {
    flushing = false;
  }
}
