"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, ClipboardList, CreditCard, Home, Sparkles } from "lucide-react";

const items = [
  { href: "/dashboard/student", label: "Кабинет", icon: Home },
  {
    href: "/dashboard/student/exercises",
    label: "Упражнения",
    icon: BookOpen,
  },
  {
    href: "/dashboard/student/ai-tools",
    label: "Нейросети",
    icon: Sparkles,
  },
  {
    href: "/dashboard/student/pro-test",
    label: "Проф. тест",
    icon: ClipboardList,
  },
  {
    href: "/dashboard/student/subscription",
    label: "Подписка",
    icon: CreditCard,
  },
];

export default function StudentNav() {
  const pathname = usePathname();

  return (
    <nav className="mb-4 grid shrink-0 grid-cols-5 gap-1 rounded-2xl bg-studio-surface p-1.5 ring-1 ring-studio-border">
      {items.map((item) => {
        const Icon = item.icon;
        const active =
          item.href === "/dashboard/student"
            ? pathname === item.href
            : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-0.5 py-2 text-center text-[9px] font-medium leading-tight transition sm:gap-1.5 sm:px-1 sm:text-xs ${
              active
                ? "bg-studio-accent/20 text-studio-accent-light"
                : "text-studio-muted hover:text-studio-text"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="max-w-full break-words">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
