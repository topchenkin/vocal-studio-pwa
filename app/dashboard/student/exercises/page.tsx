"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import HubPills from "@/components/student/HubPills";
import ExerciseLibrary from "@/components/exercises/ExerciseLibrary";
import NotesSection from "@/components/student/NotesSection";
import MyAudioLibrary from "@/components/student/MyAudioLibrary";
import { useAuth } from "@/context/AuthContext";

type Section = "practice" | "homework" | "audio";

function isSection(value: string | null): value is Section {
  return value === "practice" || value === "homework" || value === "audio";
}

function ExercisesHub() {
  const { isAuthenticated, isAdmin, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initial = searchParams.get("section");
  const [section, setSection] = useState<Section>(
    isSection(initial) ? initial : "practice"
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
    router.replace(`/dashboard/student/exercises?section=${next}`, {
      scroll: false,
    });
  };

  return (
    <DashboardLayout
      title="Обучение"
      subtitle="Распевки, задания преподавателя и ваши записи"
      bottomInset
      student
    >
      <div className="mt-5">
        <HubPills
          label="Обучение"
          value={section}
          onChange={select}
          items={[
            { id: "practice", label: "Распевки" },
            { id: "homework", label: "Домашка" },
            { id: "audio", label: "Записи" },
          ]}
        />
        {section === "homework" ? (
          <NotesSection />
        ) : section === "audio" ? (
          <MyAudioLibrary />
        ) : (
          <ExerciseLibrary />
        )}
      </div>
    </DashboardLayout>
  );
}

export default function StudentExercisesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-studio-bg">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-studio-accent border-t-transparent" />
        </div>
      }
    >
      <ExercisesHub />
    </Suspense>
  );
}
