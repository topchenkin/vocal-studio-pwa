import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AiToolAccess,
  AiToolId,
  AppSubscriptionTier,
  Database,
} from "@/types";

export type { AiToolId };

const TIER_RANK: Record<AppSubscriptionTier, number> = {
  none: 0,
  standard: 1,
  premium: 2,
  vip: 3,
};

export const AI_TOOL_IDS: AiToolId[] = [
  "tuner",
  "remover",
  "timbre",
  "mixer",
  "pitchshift",
  "songwriter",
  "vocalfx",
  "chordloop",
];

/** Defaults used until DB rows load (and as seed values). */
export const DEFAULT_AI_TOOL_ACCESS: Record<
  AiToolId,
  Pick<AiToolAccess, "min_tier" | "enabled" | "title">
> = {
  tuner: { min_tier: "none", enabled: true, title: "Нейроанализатор нот" },
  remover: { min_tier: "premium", enabled: true, title: "Удаление вокала" },
  timbre: { min_tier: "premium", enabled: true, title: "Вокальный архетип" },
  mixer: { min_tier: "standard", enabled: true, title: "Сведение дорожек" },
  pitchshift: {
    min_tier: "standard",
    enabled: true,
    title: "Изменение тональности",
  },
  songwriter: {
    min_tier: "premium",
    enabled: true,
    title: "Нейросоздание песен",
  },
  vocalfx: {
    min_tier: "none",
    enabled: true,
    title: "Голосовые FX-пресеты",
  },
  chordloop: {
    min_tier: "none",
    enabled: true,
    title: "Генератор аккордовых лупов",
  },
};

export type AiToolAccessMap = Record<
  AiToolId,
  Pick<AiToolAccess, "min_tier" | "enabled" | "title">
>;

export function defaultAiToolAccessMap(): AiToolAccessMap {
  return {
    tuner: { ...DEFAULT_AI_TOOL_ACCESS.tuner },
    remover: { ...DEFAULT_AI_TOOL_ACCESS.remover },
    timbre: { ...DEFAULT_AI_TOOL_ACCESS.timbre },
    mixer: { ...DEFAULT_AI_TOOL_ACCESS.mixer },
    pitchshift: { ...DEFAULT_AI_TOOL_ACCESS.pitchshift },
    songwriter: { ...DEFAULT_AI_TOOL_ACCESS.songwriter },
    vocalfx: { ...DEFAULT_AI_TOOL_ACCESS.vocalfx },
    chordloop: { ...DEFAULT_AI_TOOL_ACCESS.chordloop },
  };
}

function isTier(value: string): value is AppSubscriptionTier {
  return (
    value === "none" ||
    value === "standard" ||
    value === "premium" ||
    value === "vip"
  );
}

function isToolId(value: string): value is AiToolId {
  return (
    value === "tuner" ||
    value === "remover" ||
    value === "timbre" ||
    value === "mixer" ||
    value === "pitchshift" ||
    value === "songwriter" ||
    value === "vocalfx" ||
    value === "chordloop"
  );
}

export function mergeAiToolAccessRows(
  rows: Array<Partial<AiToolAccess>> | null | undefined
): AiToolAccessMap {
  const map = defaultAiToolAccessMap();
  for (const row of rows ?? []) {
    if (!row.tool_id || !isToolId(row.tool_id)) continue;
    const minTier =
      typeof row.min_tier === "string" && isTier(row.min_tier)
        ? row.min_tier
        : map[row.tool_id].min_tier;
    const incomingTitle =
      typeof row.title === "string" && row.title.trim()
        ? row.title.trim()
        : map[row.tool_id].title;
    map[row.tool_id] = {
      min_tier: minTier,
      enabled: row.enabled !== false,
      title:
        row.tool_id === "tuner" || row.tool_id === "timbre"
          ? DEFAULT_AI_TOOL_ACCESS[row.tool_id].title
          : incomingTitle,
    };
  }
  return map;
}

export async function fetchAiToolAccess(
  client: SupabaseClient<Database>
): Promise<AiToolAccessMap> {
  const { data, error } = await client
    .from("ai_tool_access")
    .select("tool_id, min_tier, enabled, title");

  if (error) {
    console.warn("[ai-tool-access] load failed, using defaults:", error.message);
    return defaultAiToolAccessMap();
  }

  return mergeAiToolAccessRows(data);
}

export function canAccessAiTool(
  tool: AiToolId,
  tier: AppSubscriptionTier,
  isAdmin = false,
  access: AiToolAccessMap = defaultAiToolAccessMap()
): boolean {
  if (tool === "remover") return isAdmin;
  if (isAdmin) return true;
  const cfg = access[tool] ?? DEFAULT_AI_TOOL_ACCESS[tool];
  if (!cfg.enabled) return false;
  return TIER_RANK[tier] >= TIER_RANK[cfg.min_tier];
}

export function aiToolLockLabel(
  tool: AiToolId,
  access: AiToolAccessMap = defaultAiToolAccessMap()
): string {
  const cfg = access[tool] ?? DEFAULT_AI_TOOL_ACCESS[tool];
  if (!cfg.enabled) return "выкл";
  if (cfg.min_tier === "none") return "";
  return cfg.min_tier.charAt(0).toUpperCase() + cfg.min_tier.slice(1);
}

export function aiToolDeniedMessage(
  tool: AiToolId,
  access: AiToolAccessMap = defaultAiToolAccessMap()
): string {
  const cfg = access[tool] ?? DEFAULT_AI_TOOL_ACCESS[tool];
  if (tool === "remover") {
    return "Удаление вокала доступно только администратору";
  }
  if (!cfg.enabled) {
    return `${cfg.title} временно отключён`;
  }
  if (cfg.min_tier === "none") {
    return `${cfg.title} недоступен`;
  }
  const label =
    cfg.min_tier.charAt(0).toUpperCase() + cfg.min_tier.slice(1);
  return `${cfg.title} доступен с тарифа ${label}`;
}
