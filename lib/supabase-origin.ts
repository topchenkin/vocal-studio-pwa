/**
 * Browser talks to Supabase through two equal paths and keeps the winner:
 *   https://<ref>.supabase.co          — works with VPN / from abroad
 *   https://sb.uniquevocal.ru          — Moscow proxy, works in RU without VPN
 *
 * Do not "detect VPN". Race both; the first response is the detection.
 * Preference lives in memory only — sessionStorage sticky-direct is what
 * made a phone fail after turning VPN off.
 */

export const SUPABASE_PROJECT_URL = (
  process.env.NEXT_PUBLIC_SUPABASE_URL || ""
).replace(/\/$/, "");

export const SUPABASE_PROXY_URL = (
  process.env.NEXT_PUBLIC_SUPABASE_PROXY_URL ||
  "https://sb.uniquevocal.ru"
).replace(/\/$/, "");

type Route = "proxy" | "direct";

let chosen: Route | null = null;

function browserOrigin() {
  return (
    SUPABASE_PROXY_URL ||
    SUPABASE_PROJECT_URL ||
    "https://placeholder.supabase.co"
  );
}

export function supabaseOriginsMatch(): boolean {
  return Boolean(
    SUPABASE_PROXY_URL &&
      SUPABASE_PROJECT_URL &&
      SUPABASE_PROXY_URL === SUPABASE_PROJECT_URL
  );
}

export function getBrowserSupabaseUrl(): string {
  return browserOrigin();
}

export function getChosenRoute(): Route | null {
  return chosen;
}

export function isProxyUnreachable(): boolean {
  return chosen === "direct";
}

export function markProxyUnreachable() {
  chosen = "direct";
}

export function markProxyReachable() {
  chosen = "proxy";
}

export function clearChosenRoute() {
  chosen = null;
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem("uvs-sb-origin");
  } catch {
    /* private mode */
  }
}

/** @deprecated use clearChosenRoute */
export function clearOriginPreference() {
  clearChosenRoute();
}

export function markPathUncertain() {
  clearChosenRoute();
}

export function markPathCertain() {
  /* route is set by markProxy* */
}

export function isPathUncertain(): boolean {
  return chosen == null;
}

function rewriteTo(url: string, dest: string): string {
  if (SUPABASE_PROJECT_URL && url.startsWith(SUPABASE_PROJECT_URL)) {
    return `${dest}${url.slice(SUPABASE_PROJECT_URL.length)}`;
  }
  if (SUPABASE_PROXY_URL && url.startsWith(SUPABASE_PROXY_URL)) {
    return `${dest}${url.slice(SUPABASE_PROXY_URL.length)}`;
  }
  return url;
}

export function rewriteSupabaseAssetUrl(url: string | null | undefined): string {
  if (!url) return "";
  const dest =
    chosen === "direct"
      ? SUPABASE_PROJECT_URL || SUPABASE_PROXY_URL
      : SUPABASE_PROXY_URL || SUPABASE_PROJECT_URL;
  return dest ? rewriteTo(url, dest) : url;
}

export function mapRealtimeUrl(url: string): string {
  if (chosen !== "direct" || !SUPABASE_PROXY_URL || !SUPABASE_PROJECT_URL) {
    return url;
  }
  const from = toWs(SUPABASE_PROXY_URL);
  const to = toWs(SUPABASE_PROJECT_URL);
  if (from && url.startsWith(from)) return `${to}${url.slice(from.length)}`;
  if (url.startsWith(SUPABASE_PROXY_URL)) {
    return `${SUPABASE_PROJECT_URL}${url.slice(SUPABASE_PROXY_URL.length)}`;
  }
  return url;
}

function toWs(httpUrl: string): string {
  if (httpUrl.startsWith("https:")) return `wss:${httpUrl.slice(6)}`;
  if (httpUrl.startsWith("http:")) return `ws:${httpUrl.slice(5)}`;
  return httpUrl;
}

export function projectAuthStorageKey(): string {
  try {
    const host = new URL(
      SUPABASE_PROJECT_URL || "https://placeholder.supabase.co"
    ).hostname;
    return `sb-${host.split(".")[0]}-auth-token`;
  } catch {
    return "sb-uvs-auth-token";
  }
}

/** Keep sessions when the client URL was sb.uniquevocal.ru (`sb-sb-auth-token`). */
export function migrateAuthStorage(storageKey: string) {
  if (typeof window === "undefined") return;
  try {
    const legacy = ["sb-sb-auth-token", "supabase.auth.token"];
    if (!localStorage.getItem(storageKey)) {
      for (const key of legacy) {
        const value = localStorage.getItem(key);
        if (value) {
          localStorage.setItem(storageKey, value);
          break;
        }
      }
    }
  } catch {
    /* private mode */
  }
}
