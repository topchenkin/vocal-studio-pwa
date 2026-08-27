"use client";

import { useEffect } from "react";
import { APP_RELEASE } from "@/lib/app-release";

export default function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (sessionStorage.getItem("uvs-sw-hold") === "1") return;
    if (document.documentElement.getAttribute("data-uvs-busting") === "1") {
      return;
    }
    const stamped = localStorage.getItem("uvs-sw-bust");
    if (stamped && stamped !== APP_RELEASE) return;

    void navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .catch(() => {
        /* ignore */
      });
  }, []);

  return null;
}
