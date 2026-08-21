import { isVocalReportText } from "@/lib/vocal-report-payload";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function defaultChatHref(isAdmin: boolean) {
  return isAdmin
    ? "/dashboard/admin?tab=chat"
    : "/dashboard/student?tab=chat";
}

function looksLikePayload(raw: string) {
  const text = raw.trim();
  return (
    text.startsWith("{") ||
    text.startsWith("[") ||
    text.includes('"overallScore"') ||
    text.includes("/_next/")
  );
}

function parseAppPath(raw: string): { pathname: string; searchParams: URLSearchParams } | null {
  const text = raw.trim();
  if (!text || looksLikePayload(text)) return null;
  try {
    const url = new URL(text, "https://www.uniquevocal.ru");
    const pathname = url.pathname.replace(/\.(txt|json)$/i, "");
    if (!pathname.startsWith("/dashboard")) return null;
    return { pathname, searchParams: url.searchParams };
  } catch {
    return null;
  }
}

/** In-app cabinet path only. Chat / vocal-report items always open the chat tab. */
export function resolveNotificationHref(input: {
  actionUrl?: string | null;
  kind?: string | null;
  message?: string | null;
  isAdmin: boolean;
}): string {
  const fallback = defaultChatHref(input.isAdmin);
  const parsed = parseAppPath(input.actionUrl || "");
  const message = input.message || "";

  if (input.kind === "lesson" && input.isAdmin) {
    const next = new URLSearchParams();
    next.set("tab", "schedule");
    const lesson = parsed?.searchParams.get("lesson");
    const date = parsed?.searchParams.get("date");
    if (lesson && UUID.test(lesson)) next.set("lesson", lesson);
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) next.set("date", date);
    return `/dashboard/admin?${next}`;
  }

  if (input.kind === "payment" && input.isAdmin) {
    return "/dashboard/admin?tab=students";
  }

  const isChat =
    input.kind === "chat" ||
    isVocalReportText(message) ||
    /отчет от ученика/i.test(message);

  if (isChat) {
    const next = new URLSearchParams();
    next.set("tab", "chat");
    const group = parsed?.searchParams.get("group");
    const student = parsed?.searchParams.get("student");
    if (group && UUID.test(group)) next.set("group", group);
    else if (input.isAdmin && student && UUID.test(student)) {
      next.set("student", student);
    }
    return `${input.isAdmin ? "/dashboard/admin" : "/dashboard/student"}?${next}`;
  }

  if (!parsed) return fallback;

  if (input.isAdmin && parsed.pathname.startsWith("/dashboard/admin")) {
    return `${parsed.pathname}${parsed.searchParams.toString() ? `?${parsed.searchParams}` : ""}`;
  }
  if (!input.isAdmin && parsed.pathname.startsWith("/dashboard/student")) {
    return `${parsed.pathname}${parsed.searchParams.toString() ? `?${parsed.searchParams}` : ""}`;
  }

  return fallback;
}
