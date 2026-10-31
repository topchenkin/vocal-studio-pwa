import type { SupabaseClient } from "@supabase/supabase-js";
import { formatAppTier, TIER_RANK } from "@/lib/constants";
import type {
  AiToolAccess,
  AppSubscriptionTier,
  Database,
} from "@/types";

export const CABINET_FEATURE_IDS = ["chat", "exercises"] as const;
export type CabinetFeatureId = (typeof CABINET_FEATURE_IDS)[number];

export type CabinetAccess = Pick<AiToolAccess, "min_tier" | "enabled" | "title">;
export type CabinetAccessMap = Record<CabinetFeatureId, CabinetAccess>;

export const DEFAULT_CABINET_ACCESS: CabinetAccessMap = {
  chat: {
    min_tier: "none",
    enabled: true,
    title: "Чат с преподавателем",
  },
  exercises: {
    min_tier: "none",
    enabled: true,
    title: "Распевки и упражнения",
  },
};

function isTier(value: string): value is AppSubscriptionTier {
  return (
    value === "none" ||
    value === "standard" ||
    value === "premium" ||
    value === "vip"
  );
}

function isCabinetFeature(value: string): value is CabinetFeatureId {
  return value === "chat" || value === "exercises";
}

export function defaultCabinetAccessMap(): CabinetAccessMap {
  return {
    chat: { ...DEFAULT_CABINET_ACCESS.chat },
    exercises: { ...DEFAULT_CABINET_ACCESS.exercises },
  };
}

export function mergeCabinetAccessRows(
  rows: Array<Partial<AiToolAccess>> | null | undefined
): CabinetAccessMap {
  const map = defaultCabinetAccessMap();
  for (const row of rows ?? []) {
    if (!row.tool_id || !isCabinetFeature(row.tool_id)) continue;
    map[row.tool_id] = {
      min_tier:
        typeof row.min_tier === "string" && isTier(row.min_tier)
          ? row.min_tier
          : map[row.tool_id].min_tier,
      enabled: row.enabled !== false,
      title:
        typeof row.title === "string" && row.title.trim()
          ? row.title.trim()
          : map[row.tool_id].title,
    };
  }
  return map;
}

export async function fetchCabinetAccess(
  client: SupabaseClient<Database>
): Promise<CabinetAccessMap> {
  const { data, error } = await client
    .from("ai_tool_access")
    .select("tool_id, min_tier, enabled, title")
    .in("tool_id", [...CABINET_FEATURE_IDS]);

  if (error) {
    console.warn("[uvs:access] cabinet load failed, using defaults:", error.message);
    return defaultCabinetAccessMap();
  }

  return mergeCabinetAccessRows(data);
}

export function canAccessCabinetFeature(
  feature: CabinetFeatureId,
  tier: AppSubscriptionTier,
  isAdmin = false,
  access: CabinetAccessMap = defaultCabinetAccessMap()
): boolean {
  if (isAdmin) return true;
  const cfg = access[feature] ?? DEFAULT_CABINET_ACCESS[feature];
  if (!cfg.enabled) return false;
  return TIER_RANK[tier] >= TIER_RANK[cfg.min_tier];
}

export function cabinetFeatureDeniedMessage(
  feature: CabinetFeatureId,
  access: CabinetAccessMap = defaultCabinetAccessMap()
): string {
  const cfg = access[feature] ?? DEFAULT_CABINET_ACCESS[feature];
  if (!cfg.enabled) return `${cfg.title} временно закрыт`;
  if (cfg.min_tier === "none") return `${cfg.title} недоступен`;
  return `Доступно с тарифа ${formatAppTier(cfg.min_tier)}`;
}
