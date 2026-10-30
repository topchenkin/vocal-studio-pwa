"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import UpcomingLessons from "@/components/student/UpcomingLessons";
import OnlineLessonGuide from "@/components/student/OnlineLessonGuide";
import DebtNotice from "@/components/student/DebtNotice";
import { useAuth } from "@/context/AuthContext";

export default function StudentScheduleClient() {
  const { isAuthenticated, isAdmin, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const legacyChat = searchParams.get("section") === "chat";

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) router.replace("/");
    else if (isAdmin) router.replace("/dashboard/admin");
  }, [isAdmin, isAuthenticated, loading, router]);

  // Old links (notifications, push) point to ?section=chat: the chat has its own tab now.
  useEffect(() => {
    if (!legacyChat) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("section");
    const query = params.toString();
    router.replace(`/dashboard/student/chat${query ? `?${query}` : ""}`);
  }, [legacyChat, router, searchParams]);

  if ((loading && !isAuthenticated) || legacyChat) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-studio-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-studio-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <DashboardLayout
      title="Занятия"
      subtitle="Расписание, переносы и оплата"
      bottomInset
      student
    >
      <div className="space-y-4">
        <DebtNotice />
        <OnlineLessonGuide />
        <UpcomingLessons />
      </div>
    </DashboardLayout>
  );
}
