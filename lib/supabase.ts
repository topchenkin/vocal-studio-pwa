import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types";
import {
  clearOriginPreference,
  getBrowserSupabaseUrl,
  isProxyUnreachable,
  mapRealtimeUrl,
  markProxyReachable,
  markProxyUnreachable,
  migrateAuthStorage,
  projectAuthStorageKey,
  SUPABASE_PROJECT_URL,
  SUPABASE_PROXY_URL,
} from "@/lib/supabase-origin";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PROXY_TIMEOUT_MS = 4_000;
const DIRECT_TIMEOUT_MS = 6_000;
const HEDGE_MS = 350;
const REALTIME_CONNECT_MS = 2_500;
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

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      return;
    }
    const id = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(id);
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * iOS Safari often ignores AbortController while a TLS handshake is stuck
 * (VPN on/off). Reject on a timer even if fetch() never settles.
 */
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
  const onAbort = () => controller.abort();
  callerSignal?.addEventListener("abort", onAbort, { once: true });

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<Response>((resolve, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        reject(new Error("timeout"));
      }, timeoutMs);
      fetch(url, { ...init, signal: controller.signal }).then(
        (response) => {
          if (timeoutId) clearTimeout(timeoutId);
          resolve(response);
        },
        (error) => {
          if (timeoutId) clearTimeout(timeoutId);
          reject(error);
        }
      );
    });
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    callerSignal?.removeEventListener("abort", onAbort);
  }
}

function isBadGateway(response: Response): boolean {
  return PROXY_BAD_STATUS.has(response.status);
}

let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function reconnectRealtime() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    try {
      supabase.realtime.disconnect();
    } catch {
      /* ignore */
    }
    try {
      supabase.realtime.connect();
    } catch {
      /* ignore */
    }
  }, 80);
}

function stickToDirect(snapshotDirect: boolean) {
  if (snapshotDirect !== isProxyUnreachable()) return;
  if (isProxyUnreachable()) return;
  markProxyUnreachable();
  reconnectRealtime();
}

function stickToProxy(snapshotDirect: boolean) {
  if (snapshotDirect !== isProxyUnreachable()) return;
  if (!isProxyUnreachable()) return;
  markProxyReachable();
  reconnectRealtime();
}

type OriginAttempt = { response: Response; fromPrimary: boolean };

function firstSettledOk(
  primary: Promise<OriginAttempt>,
  secondary: Promise<OriginAttempt>
): Promise<OriginAttempt> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let remaining = 2;
    const fail = (error: unknown) => {
      remaining -= 1;
      if (!settled && remaining === 0) reject(error);
    };
    const win = (value: OriginAttempt) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    primary.then(win, fail);
    secondary.then(win, fail);
  });
}

function bindCallerAbort(local: AbortController, caller?: AbortSignal) {
  if (!caller) return;
  if (caller.aborted) {
    local.abort();
    return;
  }
  caller.addEventListener("abort", () => local.abort(), { once: true });
}

/**
 * Prefer the last working origin, but hedge the other after HEDGE_MS so a
 * hung VPN/TLS path cannot freeze the tab. iOS does not abort stuck
 * handshakes; the independent timer in fetchOnce is what unblocks us.
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

  if (!canFallback) {
    return fetchOnce(url, requestInit, DIRECT_TIMEOUT_MS, callerSignal);
  }

  if (callerAborted(callerSignal)) {
    throw callerSignal?.reason ?? new DOMException("Aborted", "AbortError");
  }

  const preferDirect = isProxyUnreachable();
  const primaryUrl = preferDirect ? directUrl : url;
  const secondaryUrl = preferDirect ? url : directUrl;
  const primaryTimeout = preferDirect ? DIRECT_TIMEOUT_MS : PROXY_TIMEOUT_MS;
  const secondaryTimeout = preferDirect ? PROXY_TIMEOUT_MS : DIRECT_TIMEOUT_MS;

  const primaryAbort = new AbortController();
  const secondaryAbort = new AbortController();
  const hedgeAbort = new AbortController();
  bindCallerAbort(primaryAbort, callerSignal);
  bindCallerAbort(secondaryAbort, callerSignal);
  bindCallerAbort(hedgeAbort, callerSignal);

  const asAttempt = async (
    target: string,
    timeoutMs: number,
    signal: AbortSignal,
    fromPrimary: boolean
  ): Promise<OriginAttempt> => {
    const response = await fetchOnce(target, requestInit, timeoutMs, signal);
    if (isBadGateway(response)) {
      throw new Error(`upstream ${response.status}`);
    }
    return { response, fromPrimary };
  };

  const primaryP = asAttempt(
    primaryUrl,
    primaryTimeout,
    primaryAbort.signal,
    true
  );
  const secondaryP = delay(HEDGE_MS, hedgeAbort.signal).then(() =>
    asAttempt(secondaryUrl, secondaryTimeout, secondaryAbort.signal, false)
  );

  try {
    const winner = await firstSettledOk(primaryP, secondaryP);
    if (winner.fromPrimary) {
      hedgeAbort.abort();
      secondaryAbort.abort();
    } else {
      primaryAbort.abort();
      if (preferDirect) stickToProxy(preferDirect);
      else stickToDirect(preferDirect);
    }
    return winner.response;
  } catch (error) {
    hedgeAbort.abort();
    primaryAbort.abort();
    secondaryAbort.abort();
    throw error;
  }
}

function FallbackWebSocket(
  url: string | URL,
  protocols?: string | string[]
) {
  const ws = new WebSocket(mapRealtimeUrl(String(url)), protocols);
  const timer = setTimeout(() => {
    if (ws.readyState !== WebSocket.CONNECTING) return;
    if (isProxyUnreachable()) markProxyReachable();
    else markProxyUnreachable();
    try {
      ws.close();
    } catch {
      /* ignore */
    }
  }, REALTIME_CONNECT_MS);
  ws.addEventListener("open", () => clearTimeout(timer));
  ws.addEventListener("close", () => clearTimeout(timer));
  ws.addEventListener("error", () => clearTimeout(timer));
  return ws;
}

export function resyncSupabaseTransport() {
  clearOriginPreference();
  reconnectRealtime();
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

export const supabase = makeClient(getBrowserSupabaseUrl());
