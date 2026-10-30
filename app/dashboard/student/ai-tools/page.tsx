"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  AudioLines,
  ChevronRight,
  ClipboardList,
  Layers,
  Lock,
  Mic,
  Music2,
  Repeat,
  Stars,
} from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import PitchAnalyzer from "@/components/ai/PitchAnalyzer";
import PitchShiftStudio from "@/components/ai/PitchShiftStudio";
import MultitrackMixer from "@/components/ai/MultitrackMixer";
import dynamic from "next/dynamic";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { formatAppTier } from "@/lib/constants";
import {
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
const VocalFxBox = dynamic(() => import("@/components/audio/VocalFxBox"), {
  ssr: false,
});
const ChordLoopGenerator = dynamic(
  () => import("@/components/audio/ChordLoopGenerator"),
  { ssr: false }
);

const TABS: Array<{
  id: ToolTab;
  label: string;
  text: string;
  icon: typeof Mic;
}> = [
  {
    id: "tuner",
    label: "Нейроанализатор нот",
    text: "Покажет, насколько точно вы попадаете в ноты",
    icon: Mic,
  },
  {
    id: "timbre",
    label: "Вокальный архетип",
    text: "Подскажет, какой у вас тип голоса",
    icon: Stars,
  },
  {
    id: "mixer",
    label: "Сведение дорожек",
    text: "Запись и сведение дорожек на телефоне",
    icon: Layers,
  },
  {
    id: "pitchshift",
    label: "Изменение тональности",
    text: "Подберёт удобную тональность песни",
    icon: Music2,
  },
  {
    id: "vocalfx",
    label: "Обработка голоса",
    text: "Обработка записанного голоса",
    icon: AudioLines,
  },
  {
    id: "chordloop",
    label: "Генератор аккордов",
    text: "Аккордовая основа для распевки",
    icon: Repeat,
  },
];

export default function AiToolsPage() {
  const { isAuthenticated, isAdmin, loading, tier } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<ToolTab | null>(null);
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

  const active = visibleTabs.find((item) => item.id === tab) ?? null;

  return (
    <DashboardLayout
      title={active ? (access[active.id]?.title || active.label) : "Лаборатория"}
      subtitle={
        active ? undefined : "Инструменты, которые помогают слышать и развивать голос"
      }
      bottomInset
      student
    >
      {active ? (
        <div>
          <button
            type="button"
            onClick={() => setTab(null)}
            className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm text-studio-muted hover:text-studio-text"
          >
            <ArrowLeft className="h-4 w-4" />
            Все инструменты
          </button>

          {active.id === "tuner" && <PitchAnalyzer locked={locked("tuner")} />}
          {active.id === "timbre" && (
            <TimbreMatcher locked={locked("timbre")} />
          )}
          {active.id === "mixer" && (
            <MultitrackMixer locked={locked("mixer")} />
          )}
          {active.id === "pitchshift" && (
            <PitchShiftStudio locked={locked("pitchshift")} />
          )}
          {active.id === "vocalfx" && (
            <VocalFxBox locked={locked("vocalfx")} />
          )}
          {active.id === "chordloop" && (
            <ChordLoopGenerator locked={locked("chordloop")} />
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {visibleTabs.map((item) => {
            const Icon = item.icon;
            const isLocked = locked(item.id);
            const minTier = access[item.id]?.min_tier ?? "none";
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className="flex min-h-[4.5rem] w-full items-center gap-3 rounded-2xl bg-studio-card p-4 text-left ring-1 ring-studio-border transition hover:ring-studio-accent/40"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-studio-accent/15 text-studio-accent-light">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">
                    {access[item.id]?.title || item.label}
                  </span>
                  <span className="block text-sm text-studio-muted">
                    {item.text}
                  </span>
                </span>
                {isLocked ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-studio-gold/15 px-2.5 py-1 text-xs font-medium text-studio-gold">
                    <Lock className="h-3 w-3" />
                    {formatAppTier(minTier)}
                  </span>
                ) : (
                  <ChevronRight className="h-5 w-5 shrink-0 text-studio-muted" />
                )}
              </button>
            );
          })}
          <Link
            href="/dashboard/student/pro-test"
            className="flex min-h-[4.5rem] items-center gap-3 rounded-2xl bg-studio-card p-4 ring-1 ring-studio-border transition hover:ring-studio-accent/40"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-studio-gold/15 text-studio-gold">
              <ClipboardList className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">Проф. тест</span>
              <span className="block text-sm text-studio-muted">
                Короткий зачёт на уровень котика
              </span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-studio-muted" />
          </Link>
        </div>
      )}
    </DashboardLayout>
  );
}
