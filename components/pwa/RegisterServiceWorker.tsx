"use client";

import { useEffect } from "react";
import { isIosDevice } from "@/lib/ios";

async function unregisterWorkers() {
  if (!("serviceWorker" in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
  if (typeof caches === "undefined") return;
  const keys = await caches.keys();
  await Promise.all(keys.map((key) => caches.delete(key)));
}

export default function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (isIosDevice()) {
      void unregisterWorkers();
      return;
    }
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      /* ignore */
    });
  }, []);

  return null;
}
