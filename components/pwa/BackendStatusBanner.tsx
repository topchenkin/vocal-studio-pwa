"use client";

import { useAuth } from "@/context/AuthContext";

export default function BackendStatusBanner() {
  const { backendError, refreshProfile } = useAuth();
  if (!backendError) return null;

  return (
    <div className="relative z-[60] border-b border-amber-500/40 bg-amber-950/90 px-4 py-3 text-center text-sm text-amber-100">
      <p className="mx-auto max-w-2xl leading-relaxed">{backendError}</p>
      <button
        type="button"
        onClick={() => void refreshProfile()}
        className="mt-2 text-xs font-medium text-amber-200 underline underline-offset-2 hover:text-white"
      >
        Повторить подключение
      </button>
    </div>
  );
}
