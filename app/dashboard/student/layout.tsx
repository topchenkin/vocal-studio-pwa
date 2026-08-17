"use client";

import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import StudentBottomNav from "@/components/student/StudentBottomNav";

export default function StudentProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, isAdmin, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) router.replace("/");
    else if (isAdmin) router.replace("/dashboard/admin");
  }, [isAdmin, isAuthenticated, loading, router]);

  if (loading || !isAuthenticated || isAdmin) {
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
