"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import StudentHomeHub from "@/components/student/StudentHomeHub";
import { useCabinetProgress } from "@/hooks/useCabinetProgress";
import { useStudentRetention } from "@/hooks/useStudentRetention";
import SingTodayCard from "@/components/student/SingTodayCard";
import VoicePathStrip from "@/components/student/VoicePathStrip";
import OnlineLessonGuide from "@/components/student/OnlineLessonGuide";
import { consumeRequestedCabinetTab } from "@/components/dashboard/CabinetTabLink";
import Button from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import { syncPendingIntroQuiz } from "@/lib/intro-quiz-sync";

function legacyHub(tab: string | null): string | null {
  if (tab === "chat") return "/dashboard/student/schedule?section=chat";
  if (tab === "lessons") return "/dashboard/student/schedule?section=lessons";
  if (tab === "notes") return "/dashboard/student/exercises?section=homework";
  if (tab === "audio") return "/dashboard/student/exercises?section=audio";
  return null;
}

export default function StudentDashboardClient() {
  const {
    isAuthenticated,
    isAdmin,
    user,
    profile,
    profileError,
    refreshProfile,
    loading,
    backendError,
  } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [retrying, setRetrying] = useState(false);
  const { progress } = useCabinetProgress();
  const { board, reload: reloadRetention } = useStudentRetention();

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) {
      router.replace("/");
      return;
    }
    if (isAdmin) {
      router.replace("/dashboard/admin");
    }
  }, [isAuthenticated, isAdmin, loading, router]);

  const profileId = profile?.id;
  useEffect(() => {
    if (!profileId || isAdmin) return;
    void syncPendingIntroQuiz(profileId);
  }, [profileId, isAdmin]);

  useEffect(() => {
    const fromUrl = searchParams.get("tab");
    const tab = fromUrl || consumeRequestedCabinetTab();
    const next = legacyHub(tab);
    if (!next) return;
    if (tab === "chat") {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("tab");
      params.set("section", "chat");
      router.replace(`/dashboard/student/schedule?${params.toString()}`);
      return;
    }
    router.replace(next);
  }, [searchParams, router]);

  if ((loading && !user) || isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-studio-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-studio-accent border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-studio-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-studio-accent border-t-transparent" />
      </div>
    );
  }

  if (!profile) {
    return (
      <DashboardLayout
        title="Профиль ученика"
        subtitle="Не удалось загрузить данные кабинета"
        bottomInset
        student
      >
        <div className="rounded-2xl bg-studio-card p-5 ring-1 ring-studio-border">
          <p className="font-medium text-studio-text">
            {backendError ?? profileError ?? "Профиль ученика отсутствует"}
          </p>
          {!backendError && (
            <p className="mt-2 text-sm text-studio-muted">
              После выполнения обновлённого supabase-schema.sql профиль будет
              создан автоматически из auth.users.
            </p>
          )}
          <Button
            className="mt-4 min-h-11"
            disabled={retrying}
            onClick={() => {
              setRetrying(true);
              void refreshProfile().finally(() => setRetrying(false));
            }}
          >
            {retrying ? "Подключаем…" : "Повторить подключение"}
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const firstName = String(
    user.user_metadata?.full_name ?? user.email ?? "ученик"
  ).split(" ")[0];

  return (
    <DashboardLayout
      title={`Привет, ${firstName}!`}
      subtitle="Голос растёт, когда вы возвращаетесь."
      bottomInset
      student
    >
      <div className="mt-5 space-y-8">
        <SingTodayCard board={board} onClosed={reloadRetention} />
        <VoicePathStrip board={board} />
        <OnlineLessonGuide />
        <StudentHomeHub progress={progress} board={board} />
      </div>
    </DashboardLayout>
  );
}
