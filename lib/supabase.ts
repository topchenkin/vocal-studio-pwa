import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types";
import {
  getBrowserSupabaseUrl,
  pickSupabaseOrigin,
  setActiveSupabaseOrigin,
  SUPABASE_PROJECT_URL,
  SUPABASE_PROXY_URL,
} from "@/lib/supabase-origin";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const FETCH_TIMEOUT_MS = 12_000;

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
  if (input instanceof Request) return new Request(next, input);
  if (input instanceof URL) return new URL(next);
  return next;
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

async function fetchWithFallback(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  try {
    return await fetchOnce(input, init, FETCH_TIMEOUT_MS);
  } catch (error) {
    const url = requestUrl(input);
    if (
      SUPABASE_PROXY_URL &&
      SUPABASE_PROJECT_URL &&
      url.startsWith(SUPABASE_PROXY_URL)
    ) {
      setActiveSupabaseOrigin(SUPABASE_PROJECT_URL);
      supabase = makeClient(SUPABASE_PROJECT_URL);
      return fetchOnce(
        retarget(input, SUPABASE_PROXY_URL, SUPABASE_PROJECT_URL),
        init,
        FETCH_TIMEOUT_MS
      );
    }
    if (
      SUPABASE_PROXY_URL &&
      SUPABASE_PROJECT_URL &&
      url.startsWith(SUPABASE_PROJECT_URL)
    ) {
      setActiveSupabaseOrigin(SUPABASE_PROXY_URL);
      supabase = makeClient(SUPABASE_PROXY_URL);
      return fetchOnce(
        retarget(input, SUPABASE_PROJECT_URL, SUPABASE_PROXY_URL),
        init,
        FETCH_TIMEOUT_MS
      );
    }
    throw error;
  }
}

function makeClient(url: string): SupabaseClient<Database> {
  return createClient<Database>(url, supabaseAnonKey || "public-anon-placeholder", {
    auth: authOptions,
    global: { fetch: fetchWithFallback },
  });
}

export let supabase = makeClient(getBrowserSupabaseUrl());

export const supabaseReady: Promise<void> =
  typeof window === "undefined"
    ? Promise.resolve()
    : pickSupabaseOrigin().then((url) => {
        setActiveSupabaseOrigin(url);
        supabase = makeClient(url);
      });
