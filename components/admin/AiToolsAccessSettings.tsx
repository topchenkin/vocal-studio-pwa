"use client";

import { useCallback, useEffect, useState } from "react";
import { Save, Shield } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import {
  AI_TOOL_IDS,
  defaultAiToolAccessMap,
  type AiToolAccessMap,
  type AiToolId,
} from "@/lib/ai-tools-access";
import type { AppSubscriptionTier } from "@/types";

const TIER_OPTIONS: AppSubscriptionTier[] = [
  "none",
  "standard",
  "premium",
  "vip",
];

const TOOL_ORDER: AiToolId[] = AI_TOOL_IDS;

function tierLabel(tier: AppSubscriptionTier) {
  if (tier === "none") return "любой (без подписки)";
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

export default function AiToolsAccessSettings() {
  const { user } = useAuth();
  const [access, setAccess] = useState<AiToolAccessMap>(defaultAiToolAccessMap);
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
      setError(
        loadError.message.includes("ai_tool_access") ||
          loadError.code === "42P01" ||
          /relation .* does not exist/i.test(loadError.message)
          ? "Таблица ai_tool_access ещё не создана. Выполните обновлённый supabase-schema.sql в Supabase."
          : loadError.message
      );
      setLoading(false);
      return;
    }

    const next = defaultAiToolAccessMap();
    for (const row of data ?? []) {
      const id = row.tool_id as AiToolId;
      if (!TOOL_ORDER.includes(id)) continue;
      next[id] = {
        min_tier: row.min_tier,
        enabled: row.enabled,
        title: row.title || next[id].title,
      };
    }
    setAccess(next);
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

  const save = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);

    const rows = TOOL_ORDER.map((tool_id) => ({
      tool_id,
      min_tier: access[tool_id].min_tier,
      enabled: access[tool_id].enabled,
      title: access[tool_id].title,
      updated_at: new Date().toISOString(),
      updated_by: user?.id ?? null,
    }));

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
            Доступ к ИИ-инструментам
          </h2>
          <p className="mt-1 text-sm text-studio-muted">
            Включите инструменты и задайте минимальный тариф для учеников.
            Администратор видит всё всегда.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-studio-accent border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-3">
          {TOOL_ORDER.map((tool) => {
            const cfg = access[tool];
            return (
              <div
                key={tool}
                className="grid gap-3 rounded-xl bg-studio-bg/60 p-4 ring-1 ring-studio-border/80 sm:grid-cols-[1fr_auto_auto] sm:items-center"
              >
                <div>
                  <p className="font-medium text-studio-text">{cfg.title}</p>
                  <p className="text-xs text-studio-muted">{tool}</p>
                </div>

                <label className="flex items-center gap-2 text-sm text-studio-text">
                  <input
                    type="checkbox"
                    checked={cfg.enabled}
                    onChange={(event) =>
                      updateTool(tool, { enabled: event.target.checked })
                    }
                    className="h-4 w-4 rounded border-studio-border"
                  />
                  Включён
                </label>

                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-studio-muted">
                    Мин. тариф
                  </span>
                  <select
                    value={cfg.min_tier}
                    disabled={!cfg.enabled}
                    onChange={(event) =>
                      updateTool(tool, {
                        min_tier: event.target.value as AppSubscriptionTier,
                      })
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
          })}
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
