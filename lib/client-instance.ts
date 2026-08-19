/**
 * Per-tab client id. Realtime topics and origin fallback stay isolated
 * across devices, even when the same account is open twice.
 */
const INSTANCE_KEY = "uvs-client-instance";

export function getClientInstanceId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    const existing = sessionStorage.getItem(INSTANCE_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    sessionStorage.setItem(INSTANCE_KEY, id);
    return id;
  } catch {
    return "anon";
  }
}

export function realtimeTopic(base: string): string {
  return `${base}:${getClientInstanceId().slice(0, 8)}`;
}
