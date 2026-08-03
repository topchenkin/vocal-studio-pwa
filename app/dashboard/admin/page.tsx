import { Suspense } from "react";
import AdminDashboardClient from "./AdminDashboardClient";

export default function AdminDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-studio-bg">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-studio-accent border-t-transparent" />
        </div>
      }
    >
      <AdminDashboardClient />
    </Suspense>
  );
}
