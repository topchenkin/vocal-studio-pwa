import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types";
import {
  clearChosenRoute,
  getBrowserSupabaseUrl,
  getChosenRoute,
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
const RACE_MS = 1_000;
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
let lastReconnectAt = 0;
let lastOriginFlipAt = 0;
let guardsInstalled = false;
let choosePromise: Promise<"direct" | "proxy"> | null = null;

function reconnectRealtime() {
  const now = Date.now();
  if (now - lastReconnectAt < 1_000) return;
  lastReconnectAt = now;
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

function rememberRoute(route: "direct" | "proxy") {
  const previous = getChosenRoute();
  if (route === "direct") markProxyUnreachable();
  else markProxyReachable();
  if (previous && previous !== route) reconnectRealtime();
}

async function probeOrigin(origin: string): Promise<boolean> {
  if (!origin || !supabaseAnonKey) return false;
  try {
    const response = await fetchOnce(
      `${origin}/auth/v1/health`,
      {
        method: "GET",
        headers: {
          apikey: supabaseAnonKey,
          accept: "application/json",
        },
      },
      RACE_MS
    );
    return response.ok || (response.status >= 400 && response.status < 500);
  } catch {
    return false;
  }
}

function raceFirst<T>(left: Promise<T>, right: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let remaining = 2;
    const fail = (error: unknown) => {
      remaining -= 1;
      if (!settled && remaining === 0) reject(error);
    };
    const win = (value: T) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    left.then(win, fail);
    right.then(win, fail);
  });
}

async function chooseRoute(): Promise<"direct" | "proxy"> {
  const existing = getChosenRoute();
  if (existing) return existing;
  if (choosePromise) return choosePromise;
  choosePromise = raceFirst(
    probeOrigin(SUPABASE_PROXY_URL).then((ok) => {
      if (!ok) throw new Error("proxy unreachable");
      return "proxy" as const;
    }),
    probeOrigin(SUPABASE_PROJECT_URL).then((ok) => {
      if (!ok) throw new Error("direct unreachable");
      return "direct" as const;
    })
  )
    .then((route) => {
      rememberRoute(route);
      return route;
    })
    .finally(() => {
      choosePromise = null;
    });
  return choosePromise;
}

function notifyReconnecting() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("uvs-reconnecting"));
}

function notifyRouteRecovered() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("uvs-route-recovered"));
}

export async function recoverSupabaseRoute() {
  clearChosenRoute();
  notifyReconnecting();
  try {
    await chooseRoute();
  } catch {
    /* next request will race again */
  }
  reconnectRealtime();
  notifyRouteRecovered();
}

export function resyncSupabaseTransport() {
  void recoverSupabaseRoute();
}

export function installNetworkGuards() {
  if (guardsInstalled || typeof window === "undefined") return;
  guardsInstalled = true;
  void chooseRoute();
  window.addEventListener("offline", () => {
    clearChosenRoute();
    notifyReconnecting();
  });
  window.addEventListener("online", () => {
    void recoverSupabaseRoute();
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

function isIdempotent(method: string) {
  return method === "GET" || method === "HEAD" || method === "OPTIONS";
}

async function fetchKnown(
  target: string,
  init: RequestInit,
  callerSignal?: AbortSignal
): Promise<Response> {
  const response = await fetchOnce(target, init, RACE_MS, callerSignal);
  if (isBadGateway(response)) {
    throw new Error(`upstream ${response.status}`);
  }
  return response;
}

/**
 * Happy Eyeballs in 1s: GET races both origins at once. Mutations go to the
 * last winner only (never double-POST), then fail over once.
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
  const method = String(requestInit.method || "GET").toUpperCase();

  if (!canFallback) {
    return fetchOnce(url, requestInit, RACE_MS, callerSignal);
  }

  if (callerAborted(callerSignal)) {
    throw callerSignal?.reason ?? new DOMException("Aborted", "AbortError");
  }

  if (isIdempotent(method) && !getChosenRoute()) {
    const proxyAbort = new AbortController();
    const directAbort = new AbortController();
    bindCallerAbort(proxyAbort, callerSignal);
    bindCallerAbort(directAbort, callerSignal);
    const winner = await raceFirst(
      fetchKnown(url, requestInit, proxyAbort.signal).then((response) => ({
        response,
        route: "proxy" as const,
      })),
      fetchKnown(directUrl, requestInit, directAbort.signal).then(
        (response) => ({
          response,
          route: "direct" as const,
        })
      )
    );
    if (winner.route === "direct") proxyAbort.abort();
    else directAbort.abort();
    rememberRoute(winner.route);
    return winner.response;
  }

  const dest = getChosenRoute() ?? (await chooseRoute());
  const firstUrl = dest === "direct" ? directUrl : url;
  const secondUrl = dest === "direct" ? url : directUrl;
  try {
    return await fetchKnown(firstUrl, requestInit, callerSignal);
  } catch (error) {
    if (callerAborted(callerSignal)) throw error;
    const response = await fetchKnown(secondUrl, requestInit, callerSignal);
    rememberRoute(dest === "direct" ? "proxy" : "direct");
    return response;
  }
}

function FallbackWebSocket(
  url: string | URL,
  protocols?: string | string[]
) {
  const ws = new WebSocket(mapRealtimeUrl(String(url)), protocols);
  const timer = setTimeout(() => {
    if (ws.readyState !== WebSocket.CONNECTING) return;
    const now = Date.now();
    if (now - lastOriginFlipAt > 1_000) {
      lastOriginFlipAt = now;
      if (isProxyUnreachable()) markProxyReachable();
      else markProxyUnreachable();
    }
    try {
      ws.close();
    } catch {
      /* ignore */
    }
  }, RACE_MS);
  ws.addEventListener("open", () => clearTimeout(timer));
  ws.addEventListener("close", () => clearTimeout(timer));
  ws.addEventListener("error", () => clearTimeout(timer));
  return ws;
}

function makeClient(url: string): SupabaseClient<Database> {
  return createClient<Database>(url, supabaseAnonKey || "public-anon-placeholder", {
    auth: authOptions,
    global: { fetch: fetchWithFallback },
    realtime: {
      transport: FallbackWebSocket as unknown as typeof WebSocket,
      timeout: 8_000,
      heartbeatIntervalMs: 20_000,
      reconnectAfterMs: (tries: number) => Math.min(800 * 2 ** tries, 8_000),
    },
  });
}

export const supabase = makeClient(getBrowserSupabaseUrl());
