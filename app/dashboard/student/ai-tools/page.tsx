"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Layers, Mic, Music2, Sparkles, Stars, WandSparkles } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import StudentNav from "@/components/student/StudentNav";
import PitchAnalyzer from "@/components/ai/PitchAnalyzer";
import VocalRemover from "@/components/ai/VocalRemover";
import PitchShiftStudio from "@/components/ai/PitchShiftStudio";
import MultitrackMixer from "@/components/ai/MultitrackMixer";
import AiMusicComposer from "@/components/ai/AiMusicComposer";
import dynamic from "next/dynamic";
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

const TimbreMatcher = dynamic(() => import("@/components/ai/TimbreMatcher"), {
  ssr: false,
});

const TABS: Array<{
  id: ToolTab;
  label: string;
  icon: typeof Mic;
}> = [
  { id: "tuner", label: "Нейроанализатор нот", icon: Mic },
  { id: "remover", label: "Удаление вокала", icon: WandSparkles },
  { id: "timbre", label: "Вокальный архетип", icon: Stars },
  { id: "mixer", label: "Сведение дорожек", icon: Layers },
  { id: "pitchshift", label: "Изменение тональности", icon: Music2 },
  { id: "musicgen", label: "ИИ-композитор", icon: Sparkles },
];

export default function AiToolsPage() {
  const { isAuthenticated, isAdmin, loading, tier } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<ToolTab>("tuner");
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
      title="Нейросети Premium"
      subtitle="Анализ нот, тональность, минусовка, архетип, сведение и ИИ-композитор"
      bottomInset
    >
      <StudentNav />

      <div className="mb-5 grid grid-cols-2 gap-1 rounded-2xl bg-studio-surface p-1.5 ring-1 ring-studio-border sm:grid-cols-3 lg:grid-cols-6">
        {visibleTabs.map((item) => {
          const Icon = item.icon;
          const lock = aiToolLockLabel(item.id, access);
          const isLocked = locked(item.id);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2.5 text-center text-[11px] font-medium leading-tight transition sm:text-xs ${
                activeTab === item.id
                  ? "bg-studio-accent/20 text-studio-accent-light"
                  : "text-studio-muted hover:text-studio-text"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="max-w-full break-words">
                {access[item.id]?.title || item.label}
              </span>
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
      {activeTab === "pitchshift" && (
        <PitchShiftStudio locked={locked("pitchshift")} />
      )}
      {activeTab === "musicgen" && (
        <AiMusicComposer locked={locked("musicgen")} />
      )}
    </DashboardLayout>
  );
}
