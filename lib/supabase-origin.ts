/**
 * Optional public origin for the browser (VPN reverse-proxy).
 * NEXT_PUBLIC_SUPABASE_URL stays the real https://<ref>.supabase.co
 * (needed to rewrite signed storage URLs).
 */
export const SUPABASE_PROJECT_URL = (
  process.env.NEXT_PUBLIC_SUPABASE_URL || ""
).replace(/\/$/, "");

export const SUPABASE_PROXY_URL = (
  process.env.NEXT_PUBLIC_SUPABASE_PROXY_URL || ""
).replace(/\/$/, "");

export function getBrowserSupabaseUrl(): string {
  return (
    SUPABASE_PROXY_URL ||
    SUPABASE_PROJECT_URL ||
    "https://placeholder.supabase.co"
  );
}

export function rewriteSupabaseAssetUrl(url: string | null | undefined): string {
  if (!url || !SUPABASE_PROJECT_URL || !SUPABASE_PROXY_URL) return url || "";
  if (!url.startsWith(SUPABASE_PROJECT_URL)) return url;
  return `${SUPABASE_PROXY_URL}${url.slice(SUPABASE_PROJECT_URL.length)}`;
}
