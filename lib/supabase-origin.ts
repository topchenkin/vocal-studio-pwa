/**
 * Optional public origin for the browser (Moscow reverse-proxy).
 * NEXT_PUBLIC_SUPABASE_URL stays the real https://<ref>.supabase.co
 * (needed to rewrite signed storage URLs and as a per-request VPN fallback).
 *
 * Without VPN, Russian ISPs block supabase.co → browser talks to the proxy.
 * With VPN, the Moscow proxy is often unreachable. Fetch marks it down in
 * memory (not sessionStorage) and retries supabase.co; a background probe
 * brings the proxy back when VPN is switched off.
 */

export const SUPABASE_PROJECT_URL = (
  process.env.NEXT_PUBLIC_SUPABASE_URL || ""
).replace(/\/$/, "");

export const SUPABASE_PROXY_URL = (
  process.env.NEXT_PUBLIC_SUPABASE_PROXY_URL || ""
).replace(/\/$/, "");

const PROXY_DOWN_MS = 15_000;
const PROXY_PROBE_MS = 1_500;

let proxyDownUntil = 0;

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
  return Date.now() < proxyDownUntil;
}

export function markProxyUnreachable() {
  proxyDownUntil = Date.now() + PROXY_DOWN_MS;
}

export function markProxyReachable() {
  proxyDownUntil = 0;
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
  const dest = isProxyUnreachable()
    ? SUPABASE_PROJECT_URL || SUPABASE_PROXY_URL
    : SUPABASE_PROXY_URL || SUPABASE_PROJECT_URL;
  return dest ? rewriteTo(url, dest) : url;
}

export function mapRealtimeUrl(url: string): string {
  if (!isProxyUnreachable() || !SUPABASE_PROXY_URL || !SUPABASE_PROJECT_URL) {
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

async function probeProxy(): Promise<boolean> {
  if (!SUPABASE_PROXY_URL) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROXY_PROBE_MS);
  try {
    const res = await fetch(`${SUPABASE_PROXY_URL}/__health`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return false;
    return (await res.text()).trim() === "ok";
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Recover the Moscow proxy after VPN is turned off, without blocking first paint. */
export function startProxyHealthWatch() {
  if (typeof window === "undefined" || !SUPABASE_PROXY_URL) return;

  const recover = () => {
    if (!isProxyUnreachable()) return;
    void probeProxy().then((ok) => {
      if (ok) markProxyReachable();
    });
  };

  window.setInterval(recover, 8_000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") recover();
  });
  window.addEventListener("online", recover);
}
