"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { CalendarDays, MessageCircle, Music2 } from "lucide-react";

const items = [
  {
    id: "schedule",
    href: "/dashboard/admin?tab=schedule",
    label: "Расписание",
    icon: CalendarDays,
  },
  {
    id: "chat",
    href: "/dashboard/admin?tab=chat",
    label: "Чат",
    icon: MessageCircle,
  },
  {
    id: "audio",
    href: "/dashboard/admin?tab=audio",
    label: "Мои аудио",
    icon: Music2,
  },
] as const;

export default function AdminBottomNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab");
  const onCabinet = pathname === "/dashboard/admin";

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-studio-border bg-studio-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
      aria-label="Быстрый доступ"
    >
      <div className="mx-auto grid max-w-6xl grid-cols-3 px-2 pt-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = onCabinet && tab === item.id;
          return (
            <Link
              key={item.id}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition ${
                active
                  ? "text-studio-accent-light"
                  : "text-studio-muted hover:text-studio-text"
              }`}
            >
              <Icon className={`h-5 w-5 ${active ? "stroke-[2.25]" : ""}`} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
