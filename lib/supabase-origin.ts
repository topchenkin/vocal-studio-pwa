/**
 * Browser talks to same-origin `/sb` (Timeweb). The Node server proxies
 * that path to the real Supabase project so Russian ISPs never have to
 * reach supabase.co. Server-side code keeps using the project URL.
 */

export const SUPABASE_PROJECT_URL = (
  process.env.NEXT_PUBLIC_SUPABASE_URL || ""
).replace(/\/$/, "");

const PROXY_PREFIX = "/sb";

export function shouldProxySupabaseInBrowser(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return false;
  return (
    host === "uniquevocal.ru" ||
    host.endsWith(".uniquevocal.ru") ||
    host.endsWith(".twc1.net")
  );
}

export function getBrowserSupabaseUrl(): string {
  if (shouldProxySupabaseInBrowser()) {
    return `${window.location.origin}${PROXY_PREFIX}`;
  }
  return SUPABASE_PROJECT_URL || "https://placeholder.supabase.co";
}

export function rewriteSupabaseAssetUrl(url: string | null | undefined): string {
  if (!url || !SUPABASE_PROJECT_URL) return url || "";
  if (typeof window === "undefined") return url;
  if (!shouldProxySupabaseInBrowser()) return url;
  return rewriteSupabaseAssetUrlOnOrigin(url, window.location.origin);
}

export function publicAppOriginFromRequest(request: {
  headers: { get(name: string): string | null };
  nextUrl: { origin: string };
}): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configured) return configured;
  const host = request.headers.get("x-forwarded-host");
  const proto = request.headers.get("x-forwarded-proto") || "https";
  if (host) return `${proto}://${host.split(",")[0].trim()}`;
  return request.nextUrl.origin;
}

export function rewriteSupabaseAssetUrlOnOrigin(
  url: string,
  origin: string
): string {
  if (!url || !SUPABASE_PROJECT_URL) return url;
  if (!url.startsWith(SUPABASE_PROJECT_URL)) return url;
  try {
    const host = new URL(origin).hostname;
    if (host === "localhost" || host === "127.0.0.1") return url;
  } catch {
    return url;
  }
  return `${origin.replace(/\/$/, "")}${PROXY_PREFIX}${url.slice(SUPABASE_PROJECT_URL.length)}`;
}
