"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import HubPills from "@/components/student/HubPills";
import UpcomingLessons from "@/components/student/UpcomingLessons";
import OnlineLessonGuide from "@/components/student/OnlineLessonGuide";
import StudentChatSection from "@/components/student/StudentChatSection";
import SubscriptionStatus from "@/components/student/SubscriptionStatus";
import GiftRedeemCard from "@/components/student/GiftRedeemCard";
import StudentActivityStrip from "@/components/student/StudentActivityStrip";
import { useCabinetProgress } from "@/hooks/useCabinetProgress";
import { useAuth } from "@/context/AuthContext";

type Section = "lessons" | "chat";

function isSection(value: string | null): value is Section {
  return value === "lessons" || value === "chat";
}

export default function StudentScheduleClient() {
  const { isAuthenticated, isAdmin, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { progress } = useCabinetProgress();
  const initial = searchParams.get("section");
  const [section, setSection] = useState<Section>(
    isSection(initial) ? initial : "lessons"
  );

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) router.replace("/");
    else if (isAdmin) router.replace("/dashboard/admin");
  }, [isAdmin, isAuthenticated, loading, router]);

  useEffect(() => {
    const next = searchParams.get("section");
    if (isSection(next)) setSection(next);
  }, [searchParams]);

  const select = (next: Section) => {
    setSection(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set("section", next);
    router.replace(`/dashboard/student/schedule?${params.toString()}`, {
      scroll: false,
    });
  };

  if (loading && !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-studio-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-studio-accent border-t-transparent" />
      </div>
    );
  }

  const chat = section === "chat";

  return (
    <DashboardLayout
      title={chat ? "Чат" : "Расписание"}
      subtitle={chat ? "Переписка с преподавателем" : "Занятия и переносы"}
      compact={chat}
      bottomInset
      student
    >
      <div className={chat ? "flex min-h-0 flex-1 flex-col" : "mt-5"}>
        <HubPills
          label="Расписание и чат"
          value={section}
          onChange={select}
          items={[
            { id: "lessons", label: "Расписание" },
            { id: "chat", label: "Чат" },
          ]}
        />
        {chat ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <StudentChatSection />
          </div>
        ) : (
          <div className="space-y-8">
            <StudentActivityStrip progress={progress} variant="lessons" />
            <OnlineLessonGuide />
            <UpcomingLessons />
            <SubscriptionStatus />
            <GiftRedeemCard />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
