"use client";

import { AuthProvider } from "@/context/AuthContext";
import { AppDataProvider } from "@/context/AppDataContext";
import { ThemeProvider } from "@/context/ThemeContext";
import IosAudioSession from "@/components/pwa/IosAudioSession";
import PullToRefresh from "@/components/pwa/PullToRefresh";
import RouteStatusChip from "@/components/pwa/RouteStatusChip";

export default function AppProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
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
