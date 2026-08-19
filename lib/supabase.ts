import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types";
import {
  getBrowserSupabaseUrl,
  SUPABASE_PROJECT_URL,
  SUPABASE_PROXY_URL,
} from "@/lib/supabase-origin";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PROXY_TIMEOUT_MS = 2_500;
const FETCH_TIMEOUT_MS = 12_000;
const PROXY_BAD_STATUS = new Set([502, 503, 504, 521, 522, 523, 524]);

if (!supabaseUrl || !supabaseAnonKey) {
  if (process.env.NODE_ENV !== "production") {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }
  console.warn(
    "[unique-vocal] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Login will not work until they are set at build time."
  );
}

const authOptions = {
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: true,
} as const;

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function retarget(
  input: RequestInfo | URL,
  from: string,
  to: string
): RequestInfo | URL {
  const url = requestUrl(input);
  if (!from || !url.startsWith(from)) return input;
  const next = `${to}${url.slice(from.length)}`;
  if (typeof input === "string") return next;
  if (input instanceof URL) return new URL(next);
  return new Request(next, input);
}

function callerAborted(init?: RequestInit): boolean {
  return Boolean(init?.signal?.aborted);
}

async function fetchOnce(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  init?.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
    init?.signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * Keep a single supabase-js client (auth storage key is the origin).
 * Proxy first; on network / gateway failure retry the same path on
 * supabase.co. Do not persist the choice — VPN off must use the proxy again.
 */
async function fetchWithFallback(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const url = requestUrl(input);
  const canFallback =
    Boolean(SUPABASE_PROXY_URL) &&
    Boolean(SUPABASE_PROJECT_URL) &&
    url.startsWith(SUPABASE_PROXY_URL);

  try {
    const response = await fetchOnce(
      input,
      init,
      canFallback ? PROXY_TIMEOUT_MS : FETCH_TIMEOUT_MS
    );
    if (canFallback && PROXY_BAD_STATUS.has(response.status)) {
      return fetchOnce(
        retarget(input, SUPABASE_PROXY_URL, SUPABASE_PROJECT_URL),
        init,
        FETCH_TIMEOUT_MS
      );
    }
    return response;
  } catch (error) {
    if (!canFallback || callerAborted(init)) throw error;
    return fetchOnce(
      retarget(input, SUPABASE_PROXY_URL, SUPABASE_PROJECT_URL),
      init,
      FETCH_TIMEOUT_MS
    );
  }
}

function makeClient(url: string): SupabaseClient<Database> {
  return createClient<Database>(url, supabaseAnonKey || "public-anon-placeholder", {
    auth: authOptions,
    global: { fetch: fetchWithFallback },
  });
}

export const supabase = makeClient(getBrowserSupabaseUrl());
