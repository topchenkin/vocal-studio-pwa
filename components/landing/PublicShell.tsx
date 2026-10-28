import type { ReactNode } from "react";
import Header from "@/components/Header";
import SiteFooter from "@/components/legal/SiteFooter";
import { PublicAuthProvider } from "@/components/landing/PublicAuth";

/** Frame for inner marketing pages (/online, /ekaterinburg). */
export default function PublicShell({ children }: { children: ReactNode }) {
  return (
    <PublicAuthProvider>
      <main className="relative min-h-screen overflow-hidden">
        <div className="pointer-events-none fixed inset-0 bg-hero-glow" />
        <div className="relative mx-auto w-full max-w-6xl px-4 pb-16 pt-5 sm:px-6">
          <Header />
          {children}
          <SiteFooter />
        </div>
      </main>
    </PublicAuthProvider>
  );
}
