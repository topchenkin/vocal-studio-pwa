"use client";

import { useEffect } from "react";

const PENDING_NAV_CACHE = "uvs-pending-nav";
const PENDING_NAV_KEY = "/pending-nav";
const PENDING_NAV_STORAGE = "uvs-pending-nav";

function sameAppUrl(url: string) {
  try {
    const target = new URL(url, window.location.origin);
    if (target.origin !== window.location.origin) return null;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return null;
  }
}

function navigateTo(url: string) {
  const next = sameAppUrl(url);
  if (!next) return;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next !== current) {
    window.location.assign(new URL(next, window.location.origin).href);
  }
}

function rememberPending(url: string) {
  try {
    sessionStorage.setItem(PENDING_NAV_STORAGE, url);
  } catch {
    // ignore
  }
}

function takeStoredPending() {
  try {
    return sessionStorage.getItem(PENDING_NAV_STORAGE);
  } catch {
    return null;
  }
}

function clearStoredPending() {
  try {
    sessionStorage.removeItem(PENDING_NAV_STORAGE);
  } catch {
    // ignore
  }
}

/**
 * Deep-link from Web Push via postMessage + Cache + sessionStorage.
 * Hard navigation is required so ?tab=chat applies in the App Router.
 * sessionStorage survives iOS cold-start when SW opens start_url first.
 */
export default function PushNavigationListener() {
  useEffect(() => {
    const applyPending = (url: string) => {
      rememberPending(url);
      navigateTo(url);
      const landed = sameAppUrl(url);
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (landed && landed === current) {
        clearStoredPending();
      }
    };

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: string } | null;
      if (data?.type !== "UVS_NAVIGATE" || !data.url) return;
      applyPending(data.url);
    };

    const consumePendingNav = async () => {
      try {
        const cache = await caches.open(PENDING_NAV_CACHE);
        const response = await cache.match(PENDING_NAV_KEY);
        if (response) {
          const url = await response.text();
          await cache.delete(PENDING_NAV_KEY);
          if (url) {
            applyPending(url);
            return;
          }
        }
      } catch {
        // ignore
      }

      const stored = takeStoredPending();
      if (stored) applyPending(stored);
    };

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", onMessage);
    }
    void consumePendingNav();

    const onVisible = () => {
      if (document.visibilityState === "visible") void consumePendingNav();
    };
    document.addEventListener("visibilitychange", onVisible);
    const onPageShow = () => void consumePendingNav();
    window.addEventListener("pageshow", onPageShow);

    // iOS sometimes opens the app a beat after SW writes the cache.
    const timers = [400, 1200, 2500].map((ms) =>
      window.setTimeout(() => void consumePendingNav(), ms)
    );

    return () => {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", onMessage);
      }
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  return null;
}
