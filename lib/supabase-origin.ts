/**
 * Optional public origin for the browser (Moscow reverse-proxy).
 * NEXT_PUBLIC_SUPABASE_URL stays the real https://<ref>.supabase.co
 * (needed to rewrite signed storage URLs and as a per-request VPN fallback).
 *
 * Without VPN, Russian ISPs block supabase.co → browser talks to the proxy.
 * With VPN, the Moscow proxy is often unreachable → each failed fetch is
 * retried against supabase.co. One client, no sessionStorage, no boot probe.
 */

export const SUPABASE_PROJECT_URL = (
  process.env.NEXT_PUBLIC_SUPABASE_URL || ""
).replace(/\/$/, "");

export const SUPABASE_PROXY_URL = (
  process.env.NEXT_PUBLIC_SUPABASE_PROXY_URL || ""
).replace(/\/$/, "");

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

export function rewriteSupabaseAssetUrl(url: string | null | undefined): string {
  if (!url) return "";
  const dest = browserOrigin();
  if (SUPABASE_PROJECT_URL && url.startsWith(SUPABASE_PROJECT_URL)) {
    return `${dest}${url.slice(SUPABASE_PROJECT_URL.length)}`;
  }
  if (SUPABASE_PROXY_URL && url.startsWith(SUPABASE_PROXY_URL)) {
    return `${dest}${url.slice(SUPABASE_PROXY_URL.length)}`;
  }
  return url;
}
