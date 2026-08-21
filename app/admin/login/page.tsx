"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RetiredAdminLoginPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/");
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-studio-bg">
      <div
        className="h-9 w-9 animate-spin rounded-full border-2 border-studio-accent border-t-transparent"
        aria-label="Перенаправление"
      />
    </div>
  );
}
