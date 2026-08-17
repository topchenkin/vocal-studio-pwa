"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import SubscriptionStatus from "@/components/student/SubscriptionStatus";
import UpcomingLessons from "@/components/student/UpcomingLessons";
import NotesSection from "@/components/student/NotesSection";
import StudentChatSection from "@/components/student/StudentChatSection";
import MyAudioLibrary from "@/components/student/MyAudioLibrary";
import StudentNav from "@/components/student/StudentNav";
import {
  CABINET_TAB_EVENT,
  consumeRequestedCabinetTab,
} from "@/components/dashboard/CabinetTabLink";
import { useAuth } from "@/context/AuthContext";

const TABS = ["home", "notes", "chat", "lessons", "audio"] as const;
type TabId = (typeof TABS)[number];

function isTab(value: string | null): value is TabId {
  return Boolean(value && TABS.includes(value as TabId));
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
  const [activeTab, setActiveTab] = useState<TabId>("home");

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

  useEffect(() => {
    const fromUrl = searchParams.get("tab");
    const requested = consumeRequestedCabinetTab();
    const tab = isTab(fromUrl) ? fromUrl : requested;
    if (isTab(tab)) {
      setActiveTab(tab === "notes" ? "home" : tab);
      if (!isTab(fromUrl)) {
        router.replace(`/dashboard/student?tab=${tab}`, { scroll: false });
      }
    } else {
      setActiveTab("home");
    }
  }, [searchParams, router]);

  useEffect(() => {
    const onTab = (event: Event) => {
      const tab = (event as CustomEvent<string>).detail;
      if (!isTab(tab)) return;
      setActiveTab(tab === "notes" ? "home" : tab);
      router.replace(`/dashboard/student?tab=${tab}`, { scroll: false });
    };
    window.addEventListener(CABINET_TAB_EVENT, onTab);
    return () => window.removeEventListener(CABINET_TAB_EVENT, onTab);
  }, [router]);

  if (loading || !user || isAdmin) {
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
      >
        <StudentNav />
        <div className="rounded-2xl bg-red-500/10 p-5 ring-1 ring-red-500/30">
          <p className="font-medium text-red-300">
            {backendError ?? profileError ?? "Профиль ученика отсутствует"}
          </p>
          <p className="mt-2 text-sm text-studio-muted">
            {backendError
              ? "Кабинет не может загрузиться, пока браузер не достучится до supabase.co."
              : "После выполнения обновлённого supabase-schema.sql профиль будет создан автоматически из auth.users."}
          </p>
          <button
            type="button"
            onClick={() => void refreshProfile()}
            className="mt-4 rounded-xl bg-studio-accent px-4 py-2.5 text-sm font-medium text-white"
          >
            Повторить загрузку
          </button>
        </div>
      </DashboardLayout>
    );
  }

  const isChat = activeTab === "chat";
  const firstName = String(
    user.user_metadata?.full_name ?? user.email ?? "ученик"
  ).split(" ")[0];

  const title =
    activeTab === "chat"
      ? "Чат"
      : activeTab === "lessons"
        ? "Занятия"
        : activeTab === "audio"
          ? "Мои аудио"
          : `Привет, ${firstName}!`;

  const subtitle =
    activeTab === "home" ? "Личный кабинет ученика" : undefined;

  return (
    <DashboardLayout
      title={title}
      subtitle={subtitle}
      compact={isChat}
      bottomInset
    >
      <StudentNav />
      <AnimatePresence>
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
          className={isChat ? "mt-3 flex min-h-0 flex-1 flex-col" : "mt-6"}
        >
          {activeTab === "home" && (
            <div className="space-y-8">
              <SubscriptionStatus />
              <section>
                <h3 className="font-display text-lg font-semibold">
                  Домашние задания
                </h3>
                <p className="mb-3 text-xs text-studio-muted">
                  Задания от преподавателя после урока
                </p>
                <NotesSection />
              </section>
            </div>
          )}
          {activeTab === "lessons" && <UpcomingLessons />}
          {activeTab === "audio" && <MyAudioLibrary />}
          {activeTab === "chat" && <StudentChatSection />}
        </motion.div>
      </AnimatePresence>
    </DashboardLayout>
  );
}
