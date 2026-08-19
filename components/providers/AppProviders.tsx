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

