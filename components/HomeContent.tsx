"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import LandingPage from "@/components/landing/LandingPage";
import { useAuth } from "@/context/AuthContext";

export default function HomeContent() {
  const { isGuest, isAdmin, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || isGuest) return;
    router.replace(isAdmin ? "/dashboard/admin" : "/dashboard/student");
  }, [isAdmin, isGuest, loading, router]);

  if (!loading && isGuest) return <LandingPage />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-studio-bg">
      <div className="h-9 w-9 animate-spin rounded-full border-2 border-studio-accent border-t-transparent" />
    </div>
  );
}
