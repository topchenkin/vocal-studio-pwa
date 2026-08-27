"use client";

import { useEffect } from "react";
import { AuthProvider } from "@/context/AuthContext";
import { AppDataProvider } from "@/context/AppDataContext";
import { ThemeProvider } from "@/context/ThemeContext";
import IosAudioSession from "@/components/pwa/IosAudioSession";
import PullToRefresh from "@/components/pwa/PullToRefresh";
import RegisterServiceWorker from "@/components/pwa/RegisterServiceWorker";
import RouteStatusChip from "@/components/pwa/RouteStatusChip";

export default function AppProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    document.documentElement.setAttribute("data-uvs-ready", "1");
    document.documentElement.removeAttribute("data-uvs-busting");
    document.getElementById("uvs-boot-fail")?.remove();
    const ver = document.documentElement.getAttribute("data-uvs-ver");
    if (ver) {
      try {
        localStorage.setItem("uvs-sw-bust", ver);
      } catch {
        /* private mode */
      }
    }
    try {
      sessionStorage.removeItem("uvs-sw-hold");
      sessionStorage.removeItem("uvs-boot-reloads");
    } catch {
      /* private mode */
    }
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("_uvs") || url.searchParams.has("_t")) {
        url.searchParams.delete("_uvs");
        url.searchParams.delete("_t");
        window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
      }
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <ThemeProvider>
      <RegisterServiceWorker />
      <AuthProvider>
        <IosAudioSession />
        <AppDataProvider>
          <RouteStatusChip />
          <PullToRefresh>{children}</PullToRefresh>
        </AppDataProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

