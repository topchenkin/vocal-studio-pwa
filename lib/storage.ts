const isBrowser = typeof window !== "undefined";

export function loadFromStorage<T>(key: string, fallback: T): T {
  if (!isBrowser) return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveToStorage<T>(key: string, value: T): void {
  if (!isBrowser) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota errors in MVP
  }
}

export const STORAGE_KEYS = {
  currentUser: "uvs_current_user",
  users: "uvs_users",
  notifications: "uvs_notifications",
  lessons: "uvs_lessons",
  chat: "uvs_chat",
  notes: "uvs_notes",
  initialized: "uvs_initialized",
} as const;

export function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function formatPrice(value: number): string {
  return new Intl.NumberFormat("ru-RU").format(value);
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatDateShort(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
  });
}

export function formatTime(isoOrTime: string): string {
  if (isoOrTime.includes("T")) {
    return new Date(isoOrTime).toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return isoOrTime;
}
