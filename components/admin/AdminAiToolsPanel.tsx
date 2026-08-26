"use client";

import { AudioLines, Layers, Mic, Music2, Repeat, Shield, Stars, WandSparkles } from "lucide-react";
import dynamic from "next/dynamic";
import PitchAnalyzer from "@/components/ai/PitchAnalyzer";
import VocalRemover from "@/components/ai/VocalRemover";
import PitchShiftStudio from "@/components/ai/PitchShiftStudio";
import MultitrackMixer from "@/components/ai/MultitrackMixer";
import AiToolsAccessSettings from "@/components/admin/AiToolsAccessSettings";
import type { AiToolId } from "@/lib/ai-tools-access";

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

export type AdminAiSubTab = "access" | AiToolId;

const SUB_TABS: Array<{
  id: AdminAiSubTab;
  label: string;
  icon: typeof Mic;
}> = [
  { id: "access", label: "Доступ", icon: Shield },
  { id: "tuner", label: "Нейроанализатор нот", icon: Mic },
  { id: "remover", label: "Удаление вокала", icon: WandSparkles },
  { id: "timbre", label: "Вокальный архетип", icon: Stars },
  { id: "mixer", label: "Сведение дорожек", icon: Layers },
  { id: "pitchshift", label: "Изменение тональности", icon: Music2 },
  { id: "vocalfx", label: "Обработка голоса", icon: AudioLines },
  { id: "chordloop", label: "Генератор аккордов", icon: Repeat },
];

export function isAdminAiSubTab(value: string | null): value is AdminAiSubTab {
  return Boolean(value && SUB_TABS.some((item) => item.id === value));
}

export function AdminAiSubNav({
  active,
  onChange,
}: {
  active: AdminAiSubTab;
  onChange: (id: AdminAiSubTab) => void;
}) {
  return (
    <div className="mt-2 grid grid-cols-2 gap-1 rounded-2xl bg-studio-surface p-1.5 ring-1 ring-studio-border sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {SUB_TABS.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2.5 text-center text-[11px] font-medium leading-tight transition sm:text-xs ${
              active === item.id
                ? "bg-studio-accent/20 text-studio-accent-light"
                : "text-studio-muted hover:text-studio-text"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="max-w-full break-words">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function AdminAiToolBody({ active }: { active: AdminAiSubTab }) {
  return (
    <>
      {active === "access" && <AiToolsAccessSettings />}
      {active === "tuner" && <PitchAnalyzer />}
      {active === "remover" && <VocalRemover />}
      {active === "timbre" && <TimbreMatcher />}
      {active === "mixer" && <MultitrackMixer />}
      {active === "pitchshift" && <PitchShiftStudio />}
      {active === "vocalfx" && <VocalFxBox />}
      {active === "chordloop" && <ChordLoopGenerator />}
    </>
  );
}
