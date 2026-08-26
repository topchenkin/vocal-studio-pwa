"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import StudentNav from "@/components/student/StudentNav";
import PitchAnalyzer from "@/components/ai/PitchAnalyzer";
import VocalProgressSection from "@/components/student/VocalProgressSection";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import {
  canAccessAiTool,
  defaultAiToolAccessMap,
  fetchAiToolAccess,
  type AiToolAccessMap,
} from "@/lib/ai-tools-access";

export default function ProTestPage() {
  const { isAuthenticated, isAdmin, loading, tier } = useAuth();
  const router = useRouter();
  const [access, setAccess] = useState<AiToolAccessMap>(defaultAiToolAccessMap);

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) router.replace("/");
  }, [isAuthenticated, loading, router]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    void fetchAiToolAccess(supabase).then((map) => {
      if (!cancelled) setAccess(map);
    });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  if (loading && !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-studio-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-studio-accent border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-studio-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-studio-accent border-t-transparent" />
      </div>
    );
  }

  const locked = !canAccessAiTool("tuner", tier, isAdmin, access);

  return (
    <DashboardLayout
      title="Профессиональный тест"
      subtitle="Оценка уходит преподавателю. Баллы на уровень котика — после его отметки"
      bottomInset
    >
      <StudentNav />
      <div className="mb-4 flex items-start gap-3 rounded-2xl bg-studio-surface p-4 ring-1 ring-studio-border">
        <ClipboardList className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
        <p className="text-sm text-studio-muted">
          Это не тренировка в анализаторе, а короткий зачёт. Результат
          сохраняется здесь. Когда отправите преподавателю и он засчитает тест
          — котик получит лапки к уровню.
        </p>
      </div>
      <PitchAnalyzer variant="exam" locked={locked} />
      <div className="mt-8">
        <VocalProgressSection />
      </div>
    </DashboardLayout>
  );
}
