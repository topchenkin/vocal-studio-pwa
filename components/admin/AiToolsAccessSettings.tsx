"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Save, Shield } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import {
  AI_TOOL_IDS,
  defaultAiToolAccessMap,
  mergeAiToolAccessRows,
  type AiToolAccessMap,
  type AiToolId,
} from "@/lib/ai-tools-access";
import {
  CABINET_FEATURE_IDS,
  defaultCabinetAccessMap,
  mergeCabinetAccessRows,
  type CabinetAccessMap,
  type CabinetFeatureId,
} from "@/lib/studio-access";
import type { AppSubscriptionTier } from "@/types";

const TIER_OPTIONS: AppSubscriptionTier[] = [
  "none",
  "standard",
  "premium",
  "vip",
];

const TOOL_ORDER: AiToolId[] = AI_TOOL_IDS;

function tierLabel(tier: AppSubscriptionTier) {
  if (tier === "none") return "Без подписки";
  if (tier === "standard") return "Standart";
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

export default function AiToolsAccessSettings() {
  const { user } = useAuth();
  const [access, setAccess] = useState<AiToolAccessMap>(defaultAiToolAccessMap);
  const [cabinet, setCabinet] = useState<CabinetAccessMap>(defaultCabinetAccessMap);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: loadError } = await supabase
      .from("ai_tool_access")
      .select("tool_id, min_tier, enabled, title");

    if (loadError) {
      // Table may not exist yet — keep defaults and show hint
      setAccess(defaultAiToolAccessMap());
      setCabinet(defaultCabinetAccessMap());
      setError(
        loadError.message.includes("ai_tool_access") ||
          loadError.code === "42P01" ||
          /relation .* does not exist/i.test(loadError.message)
          ? "Таблица доступа ещё не создана. Выполните миграцию studio-feature-access."
          : loadError.message
      );
      setLoading(false);
      return;
    }

    setAccess(mergeAiToolAccessRows(data));
    setCabinet(mergeCabinetAccessRows(data));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const updateTool = (
    tool: AiToolId,
    patch: Partial<AiToolAccessMap[AiToolId]>
  ) => {
    setAccess((current) => ({
      ...current,
      [tool]: { ...current[tool], ...patch },
    }));
    setMessage(null);
  };

  const updateCabinet = (
    feature: CabinetFeatureId,
    patch: Partial<CabinetAccessMap[CabinetFeatureId]>
  ) => {
    setCabinet((current) => ({
      ...current,
      [feature]: { ...current[feature], ...patch },
    }));
    setMessage(null);
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);

    const now = new Date().toISOString();
    const rows = [
      ...CABINET_FEATURE_IDS.map((tool_id) => ({
        tool_id,
        min_tier: cabinet[tool_id].min_tier,
        enabled: cabinet[tool_id].enabled,
        title: cabinet[tool_id].title,
        updated_at: now,
        updated_by: user?.id ?? null,
      })),
      ...TOOL_ORDER.map((tool_id) => ({
        tool_id,
        min_tier: access[tool_id].min_tier,
        enabled: access[tool_id].enabled,
        title: access[tool_id].title,
        updated_at: now,
        updated_by: user?.id ?? null,
      })),
    ];

    const { error: saveError } = await supabase
      .from("ai_tool_access")
      .upsert(rows, { onConflict: "tool_id" });

    setSaving(false);

    if (saveError) {
      setError(
        saveError.message.includes("ai_tool_access") ||
          saveError.code === "42P01"
          ? "Не удалось сохранить: выполните обновлённый supabase-schema.sql в Supabase."
          : saveError.message
      );
      return;
    }

    setMessage("Настройки доступа сохранены");
  };

  return (
    <section className="rounded-2xl bg-studio-surface p-5 ring-1 ring-studio-border">
      <div className="mb-4 flex items-start gap-3">
        <div className="rounded-xl bg-studio-accent/15 p-2.5 text-studio-accent-light">
          <Shield className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-studio-text">
            Доступ по подписке
          </h2>
          <p className="mt-1 text-sm text-studio-muted">
            Минимальный тариф для каждого раздела. «Без подписки» открывает
            функцию всем, у кого есть аккаунт. Администратор видит всё всегда.
            Удаление вокала по-прежнему только у администратора. Отдельные
            упражнения в «Контенте» можно ограничить дополнительно.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-studio-accent border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-6">
          <AccessGroup title="Кабинет">
            {CABINET_FEATURE_IDS.map((feature) => (
              <AccessRow
                key={feature}
                title={cabinet[feature].title}
                hint={feature === "chat" ? "Личный чат и группы" : "Раздел «Практика → Распевки»"}
                enabled={cabinet[feature].enabled}
                minTier={cabinet[feature].min_tier}
                onEnabled={(enabled) => updateCabinet(feature, { enabled })}
                onMinTier={(min_tier) => updateCabinet(feature, { min_tier })}
              />
            ))}
          </AccessGroup>

          <AccessGroup title="Нейроинструменты">
            {TOOL_ORDER.map((tool) => (
              <AccessRow
                key={tool}
                title={access[tool].title}
                hint={
                  tool === "remover"
                    ? "Только администратор. Ученикам вкладка скрыта."
                    : undefined
                }
                hintTone={tool === "remover" ? "warn" : undefined}
                enabled={access[tool].enabled}
                minTier={access[tool].min_tier}
                onEnabled={(enabled) => updateTool(tool, { enabled })}
                onMinTier={(min_tier) => updateTool(tool, { min_tier })}
              />
            ))}
          </AccessGroup>
        </div>
      )}

      {(error || message) && (
        <p
          className={`mt-4 text-sm ${
            error ? "text-rose-300" : "text-emerald-300"
          }`}
        >
          {error ?? message}
        </p>
      )}

      <button
        type="button"
        onClick={() => void save()}
        disabled={loading || saving}
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-studio-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-studio-accent/90 disabled:opacity-50"
      >
        <Save className="h-4 w-4" />
        {saving ? "Сохранение…" : "Сохранить доступ"}
      </button>
    </section>
  );
}

function AccessGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-medium uppercase tracking-[0.16em] text-studio-muted">
        {title}
      </h3>
      {children}
    </div>
  );
}

function AccessRow({
  title,
  hint,
  hintTone,
  enabled,
  minTier,
  onEnabled,
  onMinTier,
}: {
  title: string;
  hint?: string;
  hintTone?: "warn";
  enabled: boolean;
  minTier: AppSubscriptionTier;
  onEnabled: (enabled: boolean) => void;
  onMinTier: (tier: AppSubscriptionTier) => void;
}) {
  return (
    <div className="grid gap-3 rounded-xl bg-studio-bg/60 p-4 ring-1 ring-studio-border/80 sm:grid-cols-[1fr_auto_auto] sm:items-center">
      <div>
        <p className="font-medium text-studio-text">{title}</p>
        {hint ? (
          <p
            className={`mt-1 text-xs ${
              hintTone === "warn" ? "text-amber-300" : "text-studio-muted"
            }`}
          >
            {hint}
          </p>
        ) : null}
      </div>

      <label className="flex min-h-10 items-center gap-2 text-sm text-studio-text">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onEnabled(event.target.checked)}
          className="h-4 w-4 rounded border-studio-border"
        />
        Включён
      </label>

      <label className="block text-sm">
        <span className="mb-1 block text-xs text-studio-muted">Мин. тариф</span>
        <select
          value={minTier}
          disabled={!enabled}
          onChange={(event) =>
            onMinTier(event.target.value as AppSubscriptionTier)
          }
          className="w-full min-w-[11rem] rounded-xl bg-studio-surface px-3 py-2 text-sm ring-1 ring-studio-border disabled:opacity-50"
        >
          {TIER_OPTIONS.map((tier) => (
            <option key={tier} value={tier}>
              {tierLabel(tier)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
