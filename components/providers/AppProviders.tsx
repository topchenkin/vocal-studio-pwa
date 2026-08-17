"use client";

import { AuthProvider } from "@/context/AuthContext";
import { AppDataProvider } from "@/context/AppDataContext";
import { ThemeProvider } from "@/context/ThemeContext";
import BackendStatusBanner from "@/components/pwa/BackendStatusBanner";

export default function AppProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BackendStatusBanner />
        <AppDataProvider>{children}</AppDataProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
