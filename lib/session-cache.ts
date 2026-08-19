import type { User } from "@supabase/supabase-js";
import { projectAuthStorageKey } from "@/lib/supabase-origin";
import type { StudentProfile } from "@/types";

const PROFILE_KEY = "uvs-profile-cache";

function sessionFromStorage(raw: unknown): { user?: User } | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = Array.isArray(raw) ? raw[0] : raw;
  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as Record<string, unknown>;
  if (record.user && typeof record.user === "object") {
    return record as { user: User };
  }
  const inner = record.currentSession;
  if (inner && typeof inner === "object" && "user" in inner) {
    return inner as { user: User };
  }
  return null;
}

export function readCachedUser(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(projectAuthStorageKey());
    if (!raw) return null;
    const session = sessionFromStorage(JSON.parse(raw));
    const user = session?.user;
    return user?.id ? user : null;
  } catch {
    return null;
  }
}

export function readCachedProfile(): StudentProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const profile = JSON.parse(raw) as StudentProfile;
    const user = readCachedUser();
    if (!user || !profile?.id || profile.id !== user.id) return null;
    return profile;
  } catch {
    return null;
  }
}

export function writeCachedProfile(profile: StudentProfile | null) {
  if (typeof window === "undefined") return;
  try {
    if (!profile) localStorage.removeItem(PROFILE_KEY);
    else localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    /* private mode */
  }
}

export function hasCachedSession() {
  return Boolean(readCachedUser());
}
