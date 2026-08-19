/**
 * Optional public origin for the browser (Moscow reverse-proxy).
 * NEXT_PUBLIC_SUPABASE_URL stays the real https://<ref>.supabase.co
 * (needed to rewrite signed storage URLs and as a VPN fallback).
 *
 * Without VPN, Russian ISPs block supabase.co → use the proxy.
 * With VPN, the Moscow proxy is often unreachable → use supabase.co.
 */
export const SUPABASE_PROJECT_URL = (
  process.env.NEXT_PUBLIC_SUPABASE_URL || ""
).replace(/\/$/, "");

export const SUPABASE_PROXY_URL = (
  process.env.NEXT_PUBLIC_SUPABASE_PROXY_URL || ""
).replace(/\/$/, "");

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

function probe(
  url: string,
  ms: number,
  isOk: (res: Response) => Promise<boolean> | boolean
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, {
    method: "GET",
    cache: "no-store",
    signal: controller.signal,
  })
    .then((res) => isOk(res))
    .catch(() => false)
    .finally(() => clearTimeout(timer));
}

function isJsonResponse(res: Response): boolean {
  return (res.headers.get("content-type") || "").includes("json");
}

/**
 * Prefer whichever origin answers first with a real API/health body.
 * Moscow proxy wins on a Russian ISP; supabase.co wins when a VPN makes
 * the proxy unreachable.
 */
export async function pickSupabaseOrigin(): Promise<string> {
  if (typeof window === "undefined") return activeOrigin;
  if (!SUPABASE_PROXY_URL) return SUPABASE_PROJECT_URL || activeOrigin;
  if (!SUPABASE_PROJECT_URL) return SUPABASE_PROXY_URL;

  const proxyOk = probe(`${SUPABASE_PROXY_URL}/__health`, 2500, async (res) => {
    if (!res.ok) return false;
    return (await res.text()).trim() === "ok";
  });
  const directOk = probe(
    `${SUPABASE_PROJECT_URL}/auth/v1/health`,
    2500,
    isJsonResponse
  );

  return new Promise((resolve) => {
    let pending = 2;
    let settled = false;
    const finish = (url: string | null) => {
      pending -= 1;
      if (settled) return;
      if (url) {
        settled = true;
        activeOrigin = url;
        resolve(url);
        return;
      }
      if (pending === 0) {
        settled = true;
        activeOrigin = SUPABASE_PROXY_URL;
        resolve(SUPABASE_PROXY_URL);
      }
    };
    void proxyOk.then((ok) => finish(ok ? SUPABASE_PROXY_URL : null));
    void directOk.then((ok) => finish(ok ? SUPABASE_PROJECT_URL : null));
  });
}
