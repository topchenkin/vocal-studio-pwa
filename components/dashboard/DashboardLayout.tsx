"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import Header from "@/components/Header";
import { cn } from "@/lib/utils";

export default function DashboardLayout({
  children,
  title,
  subtitle,
  compact,
  bottomInset,
}: {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  compact?: boolean;
  bottomInset?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative",
        compact ? "flex flex-col overflow-hidden" : "min-h-screen",
        compact && bottomInset
          ? "h-[calc(100dvh-4.5rem-env(safe-area-inset-bottom))]"
          : compact
            ? "h-[100dvh]"
            : bottomInset
              ? "pb-[calc(4.5rem+env(safe-area-inset-bottom))]"
              : ""
      )}
    >
      <div className="pointer-events-none fixed inset-0 bg-hero-glow" aria-hidden />
      <div
        className="pointer-events-none fixed -right-32 top-1/3 h-80 w-80 rounded-full bg-studio-accent/5 blur-3xl"
        aria-hidden
      />

      <div
        className={cn(
          "relative mx-auto flex w-full max-w-6xl flex-col px-4 sm:px-6",
          compact ? "min-h-0 flex-1 pb-3 pt-3" : "pb-10 pt-6"
        )}
      >
        <Header />

        <div className={cn(compact ? "mt-4 shrink-0" : "mt-8")}>
          <Link
            href="/"
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-studio-muted transition-colors hover:text-studio-text"
          >
            <ArrowLeft className="h-4 w-4" />
            На главную
          </Link>

          <h1
            className={cn(
              "font-display font-semibold",
              compact ? "text-xl" : "text-3xl sm:text-4xl"
            )}
          >
            {title}
          </h1>
          {subtitle && (
            <p className="mt-2 text-studio-muted">{subtitle}</p>
          )}
        </div>

        <div className={cn(compact ? "mt-3 flex min-h-0 flex-1 flex-col" : "mt-8")}>
          {children}
        </div>
      </div>
    </div>
  );
}
