"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home,
  StickyNote,
  MessageCircle,
} from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import Tabs from "@/components/ui/Tabs";
import SubscriptionStatus from "@/components/student/SubscriptionStatus";
import UpcomingLessons from "@/components/student/UpcomingLessons";
import NotesSection from "@/components/student/NotesSection";
import StudentChatSection from "@/components/student/StudentChatSection";
import StudentNav from "@/components/student/StudentNav";
import { useAuth } from "@/context/AuthContext";

const TABS = [
  { id: "home", label: "Главная", icon: <Home className="h-4 w-4" /> },
  { id: "notes", label: "Заметки", icon: <StickyNote className="h-4 w-4" /> },
  { id: "chat", label: "Чат", icon: <MessageCircle className="h-4 w-4" /> },
];

export default function StudentDashboardClient() {
  const {
    isAuthenticated,
    isAdmin,
    user,
    profile,
    profileError,
    refreshProfile,
    loading,
  } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState("home");

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
    const tab = searchParams.get("tab");
    if (tab && TABS.some((t) => t.id === tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const changeTab = (id: string) => {
    setActiveTab(id);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", id);
    router.replace(`/dashboard/student?${params.toString()}`, { scroll: false });
  };

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
      >
        <StudentNav />
        <div className="rounded-2xl bg-red-500/10 p-5 ring-1 ring-red-500/30">
          <p className="font-medium text-red-300">
            {profileError ?? "Профиль ученика отсутствует"}
          </p>
          <p className="mt-2 text-sm text-studio-muted">
            После выполнения обновлённого supabase-schema.sql профиль будет
            создан автоматически из auth.users.
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

  return (
    <DashboardLayout
      title={
        isChat
          ? "Чат"
          : `Привет, ${String(
              user.user_metadata.full_name ?? user.email ?? "ученик"
            ).split(" ")[0]}!`
      }
      subtitle={isChat ? undefined : "Личный кабинет ученика"}
      compact={isChat}
    >
      <StudentNav />
      <div
        className={
          isChat
            ? "sticky top-0 z-20 shrink-0 bg-studio-bg/95 pb-3 pt-1 backdrop-blur"
            : ""
        }
      >
        <Tabs tabs={TABS} active={activeTab} onChange={changeTab} />
      </div>

      <AnimatePresence mode="wait">
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
              <UpcomingLessons />
            </div>
          )}
          {activeTab === "notes" && <NotesSection />}
          {activeTab === "chat" && <StudentChatSection />}
        </motion.div>
      </AnimatePresence>
    </DashboardLayout>
  );
}
