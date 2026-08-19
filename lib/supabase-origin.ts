/**
 * Optional public origin for the browser (Moscow reverse-proxy).
 * NEXT_PUBLIC_SUPABASE_URL stays the real https://<ref>.supabase.co
 * (needed to rewrite signed storage URLs and as a VPN fallback).
 *
 * Without VPN, Russian ISPs block supabase.co → use the proxy.
 * With VPN, the Moscow proxy is often unreachable → use supabase.co.
 * Do not race the two: Cloudflare is faster from abroad, so a race
 * would pick supabase.co even when the proxy still works, and the
 * old "both failed → proxy" fallback left VPN users on a dead origin.
 */
export const SUPABASE_PROJECT_URL = (
  process.env.NEXT_PUBLIC_SUPABASE_URL || ""
).replace(/\/$/, "");

export const SUPABASE_PROXY_URL = (
  process.env.NEXT_PUBLIC_SUPABASE_PROXY_URL || ""
).replace(/\/$/, "");

const SKIP_PROXY_KEY = "uvs-sb-skip-proxy";
const SKIP_PROXY_MS = 2 * 60 * 1000;

let activeOrigin =
  SUPABASE_PROXY_URL ||
  SUPABASE_PROJECT_URL ||
  "https://placeholder.supabase.co";

export function getBrowserSupabaseUrl(): string {
  return activeOrigin;
}

export function setActiveSupabaseOrigin(url: string) {
  if (url) activeOrigin = url.replace(/\/$/, "");
}

export function rewriteSupabaseAssetUrl(url: string | null | undefined): string {
  if (!url) return "";
  const dest = activeOrigin;
  if (SUPABASE_PROJECT_URL && url.startsWith(SUPABASE_PROJECT_URL)) {
    return `${dest}${url.slice(SUPABASE_PROJECT_URL.length)}`;
  }
  if (SUPABASE_PROXY_URL && url.startsWith(SUPABASE_PROXY_URL)) {
    return `${dest}${url.slice(SUPABASE_PROXY_URL.length)}`;
  }
  return url;
}

export function shouldSkipProxy(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const until = Number(sessionStorage.getItem(SKIP_PROXY_KEY) || 0);
    return Number.isFinite(until) && Date.now() < until;
  } catch {
    return false;
  }
}

export function markProxyDown() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SKIP_PROXY_KEY, String(Date.now() + SKIP_PROXY_MS));
  } catch {
    /* ignore quota */
  }
}

export function markProxyUp() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(SKIP_PROXY_KEY);
  } catch {
    /* ignore */
  }
}

function probe(url: string, ms: number): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, {
    method: "GET",
    cache: "no-store",
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) return false;
      return (await res.text()).trim() === "ok";
    })
    .catch(() => false)
    .finally(() => clearTimeout(timer));
}

/**
 * Try Moscow first (works in RU without VPN). If it is down, use
 * supabase.co (works through a foreign VPN). Never keep a dead proxy.
 */
export async function pickSupabaseOrigin(): Promise<string> {
  if (typeof window === "undefined") return activeOrigin;
  if (!SUPABASE_PROXY_URL) return SUPABASE_PROJECT_URL || activeOrigin;
  if (!SUPABASE_PROJECT_URL) return SUPABASE_PROXY_URL;

  if (shouldSkipProxy()) {
    activeOrigin = SUPABASE_PROJECT_URL;
    return SUPABASE_PROJECT_URL;
  }

  const proxyOk = await probe(`${SUPABASE_PROXY_URL}/__health`, 2000);
  if (proxyOk) {
    markProxyUp();
    activeOrigin = SUPABASE_PROXY_URL;
    return SUPABASE_PROXY_URL;
  }

  markProxyDown();
  activeOrigin = SUPABASE_PROJECT_URL;
  return SUPABASE_PROJECT_URL;
}
