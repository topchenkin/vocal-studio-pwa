import type { ReactNode } from "react";
import Header from "@/components/Header";
import SiteFooter from "@/components/legal/SiteFooter";
import { PublicAuthProvider } from "@/components/landing/PublicAuth";

/** Frame for inner marketing pages (/online, /ekaterinburg). */
export default function PublicShell({ children }: { children: ReactNode }) {
  return (
    <PublicAuthProvider>
      {/* overflow-x-clip (not hidden): hidden turns <main> into a scroll container and breaks sticky. */}
      <main className="relative min-h-screen overflow-x-hidden supports-[overflow:clip]:overflow-x-clip">
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
