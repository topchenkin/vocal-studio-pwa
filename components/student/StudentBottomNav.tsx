"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { LayoutGroup } from "framer-motion";
import { CalendarDays, CreditCard, MessageCircle, Music2 } from "lucide-react";
import CabinetTabLink from "@/components/dashboard/CabinetTabLink";
import SlidingTabUnderline from "@/components/ui/SlidingTabUnderline";

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
    <LayoutGroup id="student-bottom-nav">
      <nav
        data-student-bottom-nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-studio-border bg-studio-bg pb-[env(safe-area-inset-bottom)]"
        aria-label="Быстрый доступ"
      >
        <div className="mx-auto grid max-w-6xl grid-cols-4 px-2 pt-1">
          {items.map((item) => {
            const Icon = item.icon;
            const active =
              "page" in item && item.page
                ? onSubscription
                : onCabinet && tab === item.id;
            const className = `relative flex min-h-11 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition ${
              active
                ? "text-studio-accent-light"
                : "text-studio-muted hover:text-studio-text"
            }`;
            const body = (
              <>
                <Icon
                  className={`relative z-[1] h-5 w-5 ${active ? "stroke-[2.25]" : ""}`}
                />
                <span className="relative z-[1]">{item.label}</span>
                <SlidingTabUnderline
                  layoutId="student-bottom-line"
                  active={active}
                />
              </>
            );

            if ("page" in item && item.page) {
              return (
                <Link key={item.id} href={item.href} className={className}>
                  {body}
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
                {body}
              </CabinetTabLink>
            );
          })}
        </div>
      </nav>
    </LayoutGroup>
  );
}
