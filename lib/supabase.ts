import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types";
import {
  getBrowserSupabaseUrl,
  isProxyUnreachable,
  mapRealtimeUrl,
  markProxyReachable,
  markProxyUnreachable,
  migrateAuthStorage,
  projectAuthStorageKey,
  startProxyHealthWatch,
  SUPABASE_PROJECT_URL,
  SUPABASE_PROXY_URL,
} from "@/lib/supabase-origin";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PROXY_TIMEOUT_MS = 1_500;
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

const AUTH_STORAGE_KEY = projectAuthStorageKey();
migrateAuthStorage(AUTH_STORAGE_KEY);

const authOptions = {
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: true,
  storageKey: AUTH_STORAGE_KEY,
} as const;

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function isStreamBody(body: BodyInit | null | undefined): boolean {
  return Boolean(
    body &&
      typeof body === "object" &&
      "getReader" in body &&
      typeof (body as ReadableStream).getReader === "function"
  );
}

type NormalizedRequest = {
  url: string;
  init: RequestInit;
  callerSignal?: AbortSignal;
};

async function normalizeRequest(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<NormalizedRequest> {
  const callerSignal =
    init?.signal ?? (input instanceof Request ? input.signal : undefined);
  const headers = new Headers(
    input instanceof Request ? input.headers : init?.headers
  );
  const method =
    (input instanceof Request ? input.method : init?.method) || "GET";
  let body: BodyInit | null | undefined = init?.body;
  if (
    body == null &&
    input instanceof Request &&
    method !== "GET" &&
    method !== "HEAD"
  ) {
    body = await input.clone().arrayBuffer();
  } else if (isStreamBody(body)) {
    body = await new Response(body).arrayBuffer();
  }

  const rest = { ...(init || {}) };
  delete rest.signal;
  delete rest.headers;
  delete rest.body;
  delete rest.method;

  return {
    url: requestUrl(input),
    callerSignal,
    init: {
      ...rest,
      method,
      headers,
      body: body ?? null,
    },
  };
}

function retargetUrl(url: string, from: string, to: string): string {
  if (!from || !url.startsWith(from)) return url;
  return `${to}${url.slice(from.length)}`;
}

function callerAborted(signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted);
}

async function fetchOnce(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  callerSignal?: AbortSignal
): Promise<Response> {
  if (callerSignal?.aborted) {
    throw callerSignal.reason ?? new DOMException("Aborted", "AbortError");
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  callerSignal?.addEventListener("abort", onAbort, { once: true });
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
    callerSignal?.removeEventListener("abort", onAbort);
  }
}

/**
 * Keep a single supabase-js client (auth storage key is the project ref).
 * Proxy first; on network / gateway failure remember that for ~15s and retry
 * the same path on supabase.co. Do not persist in sessionStorage — VPN off
 * must use the proxy again.
 */
async function fetchWithFallback(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const { url, init: requestInit, callerSignal } = await normalizeRequest(
    input,
    init
  );
  const canFallback =
    Boolean(SUPABASE_PROXY_URL) &&
    Boolean(SUPABASE_PROJECT_URL) &&
    url.startsWith(SUPABASE_PROXY_URL);
  const directUrl = canFallback
    ? retargetUrl(url, SUPABASE_PROXY_URL, SUPABASE_PROJECT_URL)
    : url;

  if (canFallback && isProxyUnreachable()) {
    return fetchOnce(directUrl, requestInit, FETCH_TIMEOUT_MS, callerSignal);
  }

  try {
    const response = await fetchOnce(
      url,
      requestInit,
      canFallback ? PROXY_TIMEOUT_MS : FETCH_TIMEOUT_MS,
      callerSignal
    );
    if (canFallback && PROXY_BAD_STATUS.has(response.status)) {
      markProxyUnreachable();
      return fetchOnce(
        directUrl,
        requestInit,
        FETCH_TIMEOUT_MS,
        callerSignal
      );
    }
    if (canFallback) markProxyReachable();
    return response;
  } catch (error) {
    if (!canFallback || callerAborted(callerSignal)) throw error;
    markProxyUnreachable();
    return fetchOnce(directUrl, requestInit, FETCH_TIMEOUT_MS, callerSignal);
  }
}

function FallbackWebSocket(
  url: string | URL,
  protocols?: string | string[]
) {
  return new WebSocket(mapRealtimeUrl(String(url)), protocols);
}

function makeClient(url: string): SupabaseClient<Database> {
  return createClient<Database>(url, supabaseAnonKey || "public-anon-placeholder", {
    auth: authOptions,
    global: { fetch: fetchWithFallback },
    realtime: {
      transport: FallbackWebSocket as unknown as typeof WebSocket,
    },
  });
}

if (typeof window !== "undefined") {
  startProxyHealthWatch();
}

export const supabase = makeClient(getBrowserSupabaseUrl());
