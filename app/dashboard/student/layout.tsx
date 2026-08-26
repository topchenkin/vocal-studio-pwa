"use client";

import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import StudentBottomNav from "@/components/student/StudentBottomNav";
import { awardCatXp } from "@/lib/cat-xp";

export default function StudentProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, isAdmin, loading, user, refreshProfile } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) router.replace("/");
    else if (isAdmin) router.replace("/dashboard/admin");
  }, [isAdmin, isAuthenticated, loading, router]);

  useEffect(() => {
    if (loading || !isAuthenticated || isAdmin) return;
    let cancelled = false;
    void awardCatXp("checkin").then((result) => {
      if (cancelled || !result) return;
      void refreshProfile();
    });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, isAuthenticated, loading, refreshProfile]);

  if (loading && !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-studio-bg">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-studio-accent border-t-transparent" />
      </div>
    );
  }

  if (!loading && (!isAuthenticated || isAdmin)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-studio-bg">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-studio-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      {children}
      <Suspense fallback={null}>
        <StudentBottomNav />
      </Suspense>
    </>
  );
}
