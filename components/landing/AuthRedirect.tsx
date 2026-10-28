"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

/**
 * Existing students and admin never see the marketing page: once the session is known
 * they are sent to the cabinet. The landing itself stays in the static HTML for search bots.
 */
export default function AuthRedirect() {
  const { isGuest, isAdmin, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || isGuest) return;
    router.replace(isAdmin ? "/dashboard/admin" : "/dashboard/student");
  }, [isAdmin, isGuest, loading, router]);

  if (isGuest) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-studio-bg">
      <div className="h-9 w-9 animate-spin rounded-full border-2 border-studio-accent border-t-transparent" />
    </div>
  );
}
