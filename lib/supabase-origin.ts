/**
 * Optional public origin for the browser (Moscow reverse-proxy).
 * NEXT_PUBLIC_SUPABASE_URL stays the real https://<ref>.supabase.co
 * (needed to rewrite signed storage URLs and as a VPN fallback).
 *
 * Origin is sticky per tab via sessionStorage (never localStorage):
 *   RU / no VPN → proxy (sb.uniquevocal.ru)
 *   VPN → after the first proxy failure, stay on supabase.co
 * Two devices / two tabs keep independent paths even on the same account.
 * Switch back only when the current origin fails. Do not probe /__health.
 */

export const SUPABASE_PROJECT_URL = (
  process.env.NEXT_PUBLIC_SUPABASE_URL || ""
).replace(/\/$/, "");

export const SUPABASE_PROXY_URL = (
  process.env.NEXT_PUBLIC_SUPABASE_PROXY_URL || ""
).replace(/\/$/, "");

const ORIGIN_KEY = "uvs-sb-origin";

function readStoredOrigin(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(ORIGIN_KEY) === "direct";
  } catch {
    return false;
  }
}

let useDirect = readStoredOrigin();

function persistOrigin() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(ORIGIN_KEY, useDirect ? "direct" : "proxy");
  } catch {
    /* private mode */
  }
}

function browserOrigin() {
  return (
    SUPABASE_PROXY_URL ||
    SUPABASE_PROJECT_URL ||
    "https://placeholder.supabase.co"
  );
}

export function getBrowserSupabaseUrl(): string {
  return browserOrigin();
}

export function isProxyUnreachable(): boolean {
  return useDirect;
}

export function markProxyUnreachable() {
  useDirect = true;
  persistOrigin();
}

export function markProxyReachable() {
  useDirect = false;
  persistOrigin();
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
  const dest = useDirect
    ? SUPABASE_PROJECT_URL || SUPABASE_PROXY_URL
    : SUPABASE_PROXY_URL || SUPABASE_PROJECT_URL;
  return dest ? rewriteTo(url, dest) : url;
}

export function mapRealtimeUrl(url: string): string {
  if (!useDirect || !SUPABASE_PROXY_URL || !SUPABASE_PROJECT_URL) {
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
