"use client";

import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import AdminBottomNav from "@/components/admin/AdminBottomNav";

export default function AdminProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAdmin, loading, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isAdmin) {
      router.replace("/");
    }
  }, [isAdmin, loading, router]);

  if (loading && !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-studio-bg">
        <div
          className="h-9 w-9 animate-spin rounded-full border-2 border-studio-accent border-t-transparent"
          aria-label="Проверка прав доступа"
        />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-studio-bg">
        <div
          className="h-9 w-9 animate-spin rounded-full border-2 border-studio-accent border-t-transparent"
          aria-label="Проверка прав доступа"
        />
      </div>
    );
  }

  return (
    <>
      {children}
      <Suspense fallback={null}>
        <AdminBottomNav />
      </Suspense>
    </>
  );
}
