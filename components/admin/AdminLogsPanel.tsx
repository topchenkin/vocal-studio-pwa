"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CircleAlert, LogIn } from "lucide-react";
import Spinner from "@/components/ui/Spinner";
import { useAuth } from "@/context/AuthContext";
import { adminStudentName } from "@/lib/admin-student-name";
import { realtimeTopic } from "@/lib/client-instance";
import { formatStudioDateTime, formatStudioTimeRange } from "@/lib/studio-tz";
import { supabase } from "@/lib/supabase";

type LogKind = "login" | "error";
type Filter = "all" | LogKind;

type LogRow = {
  id: string;
  user_id: string;
  created_at: string;
  kind: string;
  name: string;
  path: string;
  detail: Record<string, string | number | boolean | null> | null;
  release: string;
  ua: string;
  profiles: {
    full_name: string | null;
    email: string | null;
    admin_display_name: string | null;
    role?: string | null;
  } | null;
};

const DEMO: LogRow[] = [
  {
    id: "demo-login",
    user_id: "demo-student-anna",
    created_at: new Date().toISOString(),
    kind: "login",
    name: "sign_in",
    path: "/",
    detail: { last_at: new Date(Date.now() + 42 * 60 * 1000).toISOString() },
    release: "149",
    ua: "Chrome",
    profiles: {
      full_name: "Анна Волкова",
      email: "anna@example.com",
      admin_display_name: null,
    },
  },
  {
    id: "demo-error",
    user_id: "demo-student-max",
    created_at: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
    kind: "error",
    name: "mic",
    path: "/dashboard/student/pro-test",
    detail: { code: "NotAllowedError" },
    release: "147",
    ua: "Safari",
    profiles: {
      full_name: "Максим Орлов",
      email: "max@example.com",
      admin_display_name: null,
    },
  },
];

function eventTitle(row: LogRow) {
  if (row.kind === "login") return "Вход в кабинет";
  switch (row.name) {
    case "mic":
      return "Микрофон";
    case "payment_init":
      return "Оплата";
    case "sign_in":
      return "Не удалось войти";
    case "fetch_fail":
    case "backend_unreachable":
      return "Нет связи";
    case "boot":
      return "Загрузка приложения";
    case "resource":
      return "Файл не загрузился";
    default:
      return "Ошибка в приложении";
  }
}

function eventDetail(row: LogRow) {
  const detail = row.detail || {};
  const message = detail.message || detail.code || detail.status || detail.host;
  if (message == null || message === "") return "";
  return String(message);
}

function hideLoginRow(row: LogRow) {
  if (row.kind !== "login") return false;
  if (row.profiles?.role === "admin") return true;
  return (row.profiles?.email || "").trim().toLowerCase() === "yangta4@gmail.com";
}

function loginWhen(row: LogRow) {
  const last = row.detail?.last_at;
  return formatStudioTimeRange(
    row.created_at,
    typeof last === "string" ? last : undefined
  );
}

export default function AdminLogsPanel() {
  const { isMockAdmin } = useAuth();
  const searchParams = useSearchParams();
  const studentFromUrl = searchParams.get("student") || "";
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async () => {
    if (isMockAdmin) {
      setRows(DEMO);
      setLoading(false);
      setError("");
      return;
    }
    const { data, error: loadError } = await supabase
      .from("client_events")
      .select(
        "id, user_id, created_at, kind, name, path, detail, release, ua, profiles!user_id(full_name, email, admin_display_name, role)"
      )
      .in("kind", ["login", "error"])
      .order("created_at", { ascending: false })
      .limit(150);

    if (loadError) {
      setError("Не удалось загрузить логи.");
      console.error("[uvs:admin] client_events", loadError.message);
      setLoading(false);
      return;
    }
    setError("");
    setRows(((data as unknown as LogRow[]) ?? []).filter((row) => !hideLoginRow(row)));
    setLoading(false);
  }, [isMockAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (isMockAdmin) return;
    const channel = supabase
      .channel(realtimeTopic("admin-client-events"))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "client_events" },
        () => {
          void load();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isMockAdmin, load]);

  const visible = useMemo(() => {
    return rows.filter((row) => {
      if (filter !== "all" && row.kind !== filter) return false;
      if (studentFromUrl && row.user_id !== studentFromUrl) return false;
      return true;
    });
  }, [filter, rows, studentFromUrl]);

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "Все" },
    { id: "error", label: "Ошибки" },
    { id: "login", label: "Входы" },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-studio-muted">
        Один вход на час по Екатеринбургу: первое и последнее действие. Ошибки
        пишутся отдельно и приходят уведомлением.
      </p>
      <div className="flex flex-wrap gap-2">
        {filters.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={`min-h-10 rounded-xl px-3 text-sm font-medium ring-1 ${
              filter === item.id
                ? "bg-studio-accent/20 text-studio-accent-light ring-studio-accent/40"
                : "text-studio-muted ring-studio-border hover:text-studio-text"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner size="sm" label="Загружаем логи" />
        </div>
      ) : error ? (
        <p className="rounded-2xl bg-red-500/10 p-4 text-sm text-red-200 ring-1 ring-red-500/30">
          {error}
        </p>
      ) : visible.length === 0 ? (
        <p className="rounded-2xl bg-studio-card/60 p-5 text-sm text-studio-muted ring-1 ring-studio-border">
          Пока нет записей.
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((row) => {
            const who = adminStudentName(row.profiles || {}, "Ученик");
            const extra = eventDetail(row);
            const isError = row.kind === "error";
            return (
              <li
                key={row.id}
                className="rounded-2xl bg-studio-card/70 p-4 ring-1 ring-studio-border"
              >
                <div className="flex flex-wrap items-start gap-3">
                  <span
                    className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                      isError
                        ? "bg-red-500/15 text-red-200"
                        : "bg-studio-accent/15 text-studio-accent-light"
                    }`}
                  >
                    {isError ? (
                      <CircleAlert className="h-4 w-4" />
                    ) : (
                      <LogIn className="h-4 w-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-studio-text">
                      {who}
                      <span className="text-studio-muted"> · {eventTitle(row)}</span>
                    </p>
                    <p className="mt-1 text-xs text-studio-muted">
                      {isError
                        ? formatStudioDateTime(row.created_at)
                        : loginWhen(row)}
                      {isError && row.path ? ` · ${row.path}` : ""}
                    </p>
                    {extra ? (
                      <p className="mt-1 break-words text-xs text-studio-muted">
                        {extra}
                      </p>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
