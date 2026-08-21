"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { CalendarDays, CreditCard, MessageCircle, Music2 } from "lucide-react";
import CabinetTabLink from "@/components/dashboard/CabinetTabLink";

const items = [
  {
    id: "lessons",
    href: "/dashboard/student?tab=lessons",
    label: "Занятия",
    icon: CalendarDays,
  },
  {
    id: "subscription",
    href: "/dashboard/student/subscription",
    label: "Подписка",
    icon: CreditCard,
    page: true,
  },
  {
    id: "chat",
    href: "/dashboard/student?tab=chat",
    label: "Чат",
    icon: MessageCircle,
  },
  {
    id: "audio",
    href: "/dashboard/student?tab=audio",
    label: "Мои аудио",
    icon: Music2,
  },
] as const;

export default function StudentBottomNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab");
  const onCabinet = pathname === "/dashboard/student";
  const onSubscription = pathname.startsWith("/dashboard/student/subscription");

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-studio-border bg-studio-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
      aria-label="Быстрый доступ"
    >
      <div className="mx-auto grid max-w-6xl grid-cols-4 px-2 pt-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active =
            "page" in item && item.page
              ? onSubscription
              : onCabinet && tab === item.id;
          const className = `flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition ${
            active
              ? "text-studio-accent-light"
              : "text-studio-muted hover:text-studio-text"
          }`;

          if ("page" in item && item.page) {
            return (
              <Link key={item.id} href={item.href} className={className}>
                <Icon className={`h-5 w-5 ${active ? "stroke-[2.25]" : ""}`} />
                {item.label}
              </Link>
            );
          }

          return (
            <CabinetTabLink
              key={item.id}
              href={item.href}
              tabId={item.id}
              className={className}
            >
              <Icon className={`h-5 w-5 ${active ? "stroke-[2.25]" : ""}`} />
              {item.label}
            </CabinetTabLink>
          );
        })}
      </div>
    </nav>
  );
}
