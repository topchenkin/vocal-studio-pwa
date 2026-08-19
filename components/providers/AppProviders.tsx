"use client";

import { AuthProvider } from "@/context/AuthContext";
import { AppDataProvider } from "@/context/AppDataContext";
import { ThemeProvider } from "@/context/ThemeContext";
import BackendStatusBanner from "@/components/pwa/BackendStatusBanner";
import IosAudioSession from "@/components/pwa/IosAudioSession";

export default function AppProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BackendStatusBanner />
        <IosAudioSession />
        <AppDataProvider>{children}</AppDataProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
