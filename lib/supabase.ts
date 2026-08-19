import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types";
import { isIosDevice } from "@/lib/ios";
import {
  clearChosenRoute,
  getBrowserSupabaseUrl,
  getChosenRoute,
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

/** Happy-eyeballs budget: first success wins. iOS TLS+CORS is slower than 1s. */
const RACE_MS = 1_000;
const IOS_RACE_MS = 3_000;
/** Real API calls (login, profile). Never reuse the race budget here. */
const REQUEST_MS = 15_000;
const WS_CONNECT_MS = 8_000;

function raceBudget() {
  return isIosDevice() ? IOS_RACE_MS : RACE_MS;
}

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
let netTimer: ReturnType<typeof setTimeout> | null = null;
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
  if (!origin) return false;
  const path =
    origin === SUPABASE_PROXY_URL ? "/__health" : "/auth/v1/health";
  try {
    const response = await fetchOnce(
      `${origin}${path}`,
      { method: "GET", cache: "no-store" },
      raceBudget()
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
    notifyRouteRecovered();
  } catch {
    /* keep reconnecting; the next request races again */
  }
  reconnectRealtime();
}

export function resyncSupabaseTransport() {
  void recoverSupabaseRoute();
}

export function installNetworkGuards() {
  if (guardsInstalled || typeof window === "undefined") return;
  guardsInstalled = true;
  void chooseRoute().catch(() => {
    /* both paths down; the next request races again */
  });
  window.addEventListener("offline", () => {
    if (netTimer) {
      clearTimeout(netTimer);
      netTimer = null;
    }
    clearChosenRoute();
    notifyReconnecting();
  });
  window.addEventListener("online", () => {
    if (netTimer) clearTimeout(netTimer);
    netTimer = setTimeout(() => {
      netTimer = null;
      void recoverSupabaseRoute();
    }, 1_500);
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
  timeoutMs: number,
  callerSignal?: AbortSignal
): Promise<Response> {
  const response = await fetchOnce(target, init, timeoutMs, callerSignal);
  if (isBadGateway(response)) {
    throw new Error(`upstream ${response.status}`);
  }
  return response;
}

async function fetchOneThenOther(
  firstUrl: string,
  secondUrl: string,
  firstRoute: "direct" | "proxy",
  init: RequestInit,
  callerSignal?: AbortSignal
): Promise<Response> {
  try {
    const response = await fetchKnown(
      firstUrl,
      init,
      REQUEST_MS,
      callerSignal
    );
    rememberRoute(firstRoute);
    return response;
  } catch (error) {
    if (callerAborted(callerSignal)) throw error;
    const response = await fetchKnown(
      secondUrl,
      init,
      REQUEST_MS,
      callerSignal
    );
    rememberRoute(firstRoute === "direct" ? "proxy" : "direct");
    return response;
  }
}

/**
 * Happy Eyeballs: GET races both origins. Mutations go to the last winner
 * only (never double-POST), then fail over once. The 1s/3s budget is only
 * for choosing a path — login and profile use a full request timeout.
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
    return fetchOnce(url, requestInit, REQUEST_MS, callerSignal);
  }

  if (callerAborted(callerSignal)) {
    throw callerSignal?.reason ?? new DOMException("Aborted", "AbortError");
  }

  if (isIdempotent(method) && !getChosenRoute()) {
    const proxyAbort = new AbortController();
    const directAbort = new AbortController();
    bindCallerAbort(proxyAbort, callerSignal);
    bindCallerAbort(directAbort, callerSignal);
    try {
      const winner = await raceFirst(
        fetchKnown(url, requestInit, raceBudget(), proxyAbort.signal).then(
          (response) => ({
            response,
            route: "proxy" as const,
          })
        ),
        fetchKnown(
          directUrl,
          requestInit,
          raceBudget(),
          directAbort.signal
        ).then((response) => ({
          response,
          route: "direct" as const,
        }))
      );
      if (winner.route === "direct") proxyAbort.abort();
      else directAbort.abort();
      rememberRoute(winner.route);
      return winner.response;
    } catch {
      proxyAbort.abort();
      directAbort.abort();
      return fetchOneThenOther(
        url,
        directUrl,
        "proxy",
        requestInit,
        callerSignal
      );
    }
  }

  const dest =
    getChosenRoute() ??
    (await chooseRoute().catch(() => "proxy" as const));
  const firstUrl = dest === "direct" ? directUrl : url;
  const secondUrl = dest === "direct" ? url : directUrl;
  return fetchOneThenOther(
    firstUrl,
    secondUrl,
    dest,
    requestInit,
    callerSignal
  );
}

function FallbackWebSocket(
  url: string | URL,
  protocols?: string | string[]
) {
  const ws = new WebSocket(mapRealtimeUrl(String(url)), protocols);
  const timer = setTimeout(() => {
    if (ws.readyState === WebSocket.CONNECTING) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
  }, WS_CONNECT_MS);
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
