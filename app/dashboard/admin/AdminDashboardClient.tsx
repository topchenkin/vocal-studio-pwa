"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  Calendar,
  Bell,
  AlertTriangle,
  Sparkles,
  LibraryBig,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import Tabs from "@/components/ui/Tabs";
import StudentsTable from "@/components/admin/StudentsTable";
import ScheduleGrid from "@/components/admin/ScheduleGrid";
import AdminChat from "@/components/admin/AdminChat";
import NotificationForm from "@/components/admin/NotificationForm";
import PitchAnalyzer from "@/components/ai/PitchAnalyzer";
import VocalRemover from "@/components/ai/VocalRemover";
import MultitrackMixer from "@/components/ai/MultitrackMixer";
import dynamic from "next/dynamic";
import ContentManager from "@/components/admin/ContentManager";
import AiToolsAccessSettings from "@/components/admin/AiToolsAccessSettings";
import PitchShiftStudio from "@/components/ai/PitchShiftStudio";
import MyAudioLibrary from "@/components/student/MyAudioLibrary";
import {
  CABINET_TAB_EVENT,
  consumeRequestedCabinetTab,
} from "@/components/dashboard/CabinetTabLink";

const TimbreMatcher = dynamic(() => import("@/components/ai/TimbreMatcher"), {
  ssr: false,
});

const TABS = [
  { id: "students", label: "Ученики", icon: <Users className="h-4 w-4" /> },
  {
    id: "schedule",
    label: "Расписание",
    icon: <Calendar className="h-4 w-4" />,
  },
  {
    id: "notifications",
    label: "Уведомления",
    icon: <Bell className="h-4 w-4" />,
  },
  {
    id: "content",
    label: "Контент",
    icon: <LibraryBig className="h-4 w-4" />,
  },
  {
    id: "ai-tools",
    label: "ИИ-инструменты",
    icon: <Sparkles className="h-4 w-4" />,
  },
];

const QUICK_TABS = ["chat", "audio"] as const;

function isAdminTab(value: string | null): boolean {
  return Boolean(
    value &&
      (TABS.some((item) => item.id === value) ||
        QUICK_TABS.includes(value as (typeof QUICK_TABS)[number]))
  );
}

export default function AdminDashboardClient() {
  const [activeTab, setActiveTab] = useState("students");
  const { isMockAdmin } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const fromUrl = searchParams.get("tab");
    const requested = consumeRequestedCabinetTab();
    const tab = isAdminTab(fromUrl) ? fromUrl : requested;
    if (isAdminTab(tab) && tab) {
      setActiveTab(tab);
      if (!isAdminTab(fromUrl)) {
        router.replace(`/dashboard/admin?tab=${tab}`, { scroll: false });
      }
    }
  }, [searchParams, router]);

  useEffect(() => {
    const onTab = (event: Event) => {
      const tab = (event as CustomEvent<string>).detail;
      if (!isAdminTab(tab)) return;
      setActiveTab(tab);
      router.replace(`/dashboard/admin?tab=${tab}`, { scroll: false });
    };
    window.addEventListener(CABINET_TAB_EVENT, onTab);
    return () => window.removeEventListener(CABINET_TAB_EVENT, onTab);
  }, [router]);

  const changeTab = (id: string) => {
    setActiveTab(id);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", id);
    router.replace(`/dashboard/admin?${params.toString()}`, { scroll: false });
  };

  const isChat = activeTab === "chat";
  const title =
    activeTab === "chat"
      ? "Чат"
      : activeTab === "audio"
        ? "Мои аудио"
        : "Панель администратора";
  const subtitle =
    isChat || activeTab === "audio"
      ? undefined
      : "Unique Vocal Studio — управление";

  return (
    <DashboardLayout
      title={title}
      subtitle={subtitle}
      compact={isChat}
      bottomInset
    >
      {isMockAdmin && (
        <div className="mb-4 flex shrink-0 gap-3 rounded-2xl bg-amber-500/10 p-4 text-sm text-amber-200 ring-1 ring-amber-500/30">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <p>
            Тестовый вход не создаёт Supabase-сессию, поэтому здесь показаны
            демо-данные. Для просмотра реальных учеников войдите через
            администраторский аккаунт.
          </p>
        </div>
      )}
      <div
        className={
          isChat
            ? "sticky top-0 z-20 shrink-0 bg-studio-bg/95 pb-3 backdrop-blur"
            : "shrink-0"
        }
      >
        <Tabs tabs={TABS} active={activeTab} onChange={changeTab} />
      </div>

      {isChat ? (
        <div className="mt-3 flex min-h-0 flex-1 flex-col">
          <AdminChat />
        </div>
      ) : (
        <AnimatePresence>
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="mt-6"
          >
            {activeTab === "students" && <StudentsTable />}
            {activeTab === "schedule" && <ScheduleGrid />}
            {activeTab === "notifications" && <NotificationForm />}
            {activeTab === "content" && <ContentManager />}
            {activeTab === "audio" && <MyAudioLibrary />}
            {activeTab === "ai-tools" && (
              <div className="space-y-5">
                <AiToolsAccessSettings />
                <div className="grid gap-5 lg:grid-cols-2">
                  <PitchAnalyzer />
                  <VocalRemover />
                  <TimbreMatcher />
                  <MultitrackMixer />
                </div>
                <PitchShiftStudio />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      )}
    </DashboardLayout>
  );
}
