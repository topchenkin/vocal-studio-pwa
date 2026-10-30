import type { StudentProfile } from "@/types";

/** Official page of Yandex Telemost: app download for desktop and links to the mobile stores. */
export const TELEMOST_URL = "https://telemost.yandex.ru/";

export const ONLINE_LESSON_URL_MAX = 500;

export function isOnlineStudent(
  profile: Pick<StudentProfile, "lesson_format"> | null | undefined
): boolean {
  return profile?.lesson_format === "online";
}

/**
 * Admin input -> value for `profiles.online_lesson_url`.
 * Returns `""` for an empty field (stored as null) and `null` when the value is not a valid https link.
 */
export function normalizeOnlineLessonUrl(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return "";
  if (value.length > ONLINE_LESSON_URL_MAX || /\s/.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

/** Link that is safe to put in an `href` (https only), or null. */
export function safeOnlineLessonUrl(raw: string | null | undefined): string | null {
  const normalized = normalizeOnlineLessonUrl(raw);
  return normalized ? normalized : null;
}
