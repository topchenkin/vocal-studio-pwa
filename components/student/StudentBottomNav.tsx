"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import {
  BookOpen,
  CalendarDays,
  Ellipsis,
  Home,
  MessageCircle,
  Mic,
} from "lucide-react";

const items = [
  {
    href: "/dashboard/student",
    label: "Главная",
    icon: Home,
    exact: true,
    also: ["/dashboard/student/progress"],
  },
  {
    href: "/dashboard/student/schedule",
    label: "Занятия",
    icon: CalendarDays,
  },
  {
    href: "/dashboard/student/exercises",
    label: "Практика",
    icon: Mic,
  },
  {
    href: "/dashboard/student/courses",
    label: "Курсы",
    icon: BookOpen,
  },
  {
    href: "/dashboard/student/chat",
    label: "Чат",
    icon: MessageCircle,
  },
  {
    href: "/dashboard/student/more",
    label: "Ещё",
    icon: Ellipsis,
    also: [
      "/dashboard/student/subscription",
      "/dashboard/student/ai-tools",
      "/dashboard/student/pro-test",
    ],
  },
] as const;

export default function StudentBottomNav() {
  const pathname = usePathname();
  const reduce = useReducedMotion();

  return (
    <LayoutGroup id="student-bottom-nav">
      <nav
        data-student-bottom-nav
        className="fixed inset-x-0 bottom-0 z-50 border-t border-studio-border bg-studio-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
        aria-label="Разделы кабинета"
      >
        <div className="mx-auto grid max-w-6xl grid-cols-6 px-0.5 pt-1 sm:px-1">
          {items.map((item) => {
            const Icon = item.icon;
            const extra = "also" in item ? item.also : [];
            const active =
              ("exact" in item && item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href)) ||
              extra.some((href) => pathname.startsWith(href));
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-h-11 flex-col items-center justify-center gap-0.5 px-0.5 py-2 text-[10px] font-medium sm:text-xs ${
                  active ? "text-studio-accent-light" : "text-studio-muted"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="student-bottom-glow"
                    className="absolute inset-x-2 top-1 h-8 rounded-full bg-studio-accent/20"
                    transition={
                      reduce
                        ? { duration: 0 }
                        : { type: "spring", stiffness: 420, damping: 34 }
                    }
                  />
                )}
                <Icon
                  className={`relative z-[1] h-5 w-5 ${active ? "stroke-[2.25]" : ""}`}
                />
                <span className="relative z-[1]">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </LayoutGroup>
  );
}
