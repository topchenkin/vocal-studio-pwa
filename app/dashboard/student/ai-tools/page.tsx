"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Layers, Mic, Stars, WandSparkles } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import StudentNav from "@/components/student/StudentNav";
import PitchAnalyzer from "@/components/ai/PitchAnalyzer";
import VocalRemover from "@/components/ai/VocalRemover";
import TimbreMatcher from "@/components/ai/TimbreMatcher";
import MultitrackMixer from "@/components/ai/MultitrackMixer";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import {
  aiToolLockLabel,
  canAccessAiTool,
  defaultAiToolAccessMap,
  fetchAiToolAccess,
  type AiToolAccessMap,
  type AiToolId,
} from "@/lib/ai-tools-access";

type ToolTab = AiToolId;

const TABS: Array<{
  id: ToolTab;
  label: string;
  icon: typeof Mic;
}> = [
  { id: "tuner", label: "ИИ-Тюнер нот", icon: Mic },
  { id: "remover", label: "Удаление вокала", icon: WandSparkles },
  { id: "timbre", label: "Похожий тембр", icon: Stars },
  { id: "mixer", label: "Сведение дорожек", icon: Layers },
];

export default function AiToolsPage() {
  const { isAuthenticated, isAdmin, loading, tier } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<ToolTab>("tuner");
  const [mounted, setMounted] = useState(false);
  const [access, setAccess] = useState<AiToolAccessMap>(defaultAiToolAccessMap);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  if (loading || !mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-studio-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-studio-accent border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const locked = (tool: AiToolId) =>
    !canAccessAiTool(tool, tier, isAdmin, access);

  const visibleTabs = TABS.filter(
    (item) => isAdmin || access[item.id]?.enabled !== false
  );

  const activeTab = visibleTabs.some((item) => item.id === tab)
    ? tab
    : (visibleTabs[0]?.id ?? "tuner");

  return (
    <DashboardLayout
      title="AI-вокал"
      subtitle="Тюнер, минусовка, похожий тембр и сведение дорожек"
    >
      <StudentNav />

      <div className="mb-5 flex gap-1 overflow-x-auto rounded-2xl bg-studio-surface p-1.5 ring-1 ring-studio-border">
        {visibleTabs.map((item) => {
          const Icon = item.icon;
          const lock = aiToolLockLabel(item.id, access);
          const isLocked = locked(item.id);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`flex min-w-max flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                activeTab === item.id
                  ? "bg-studio-accent/20 text-studio-accent-light"
                  : "text-studio-muted hover:text-studio-text"
              }`}
            >
              <Icon className="h-4 w-4" />
              {access[item.id]?.title || item.label}
              {isLocked && lock && (
                <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-300">
                  {lock}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {activeTab === "tuner" && <PitchAnalyzer locked={locked("tuner")} />}
      {activeTab === "remover" && (
        <VocalRemover locked={locked("remover")} />
      )}
      {activeTab === "timbre" && (
        <TimbreMatcher locked={locked("timbre")} />
      )}
      {activeTab === "mixer" && (
        <MultitrackMixer locked={locked("mixer")} />
      )}
    </DashboardLayout>
  );
}
