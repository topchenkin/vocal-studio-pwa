"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Home, Sparkles } from "lucide-react";

const items = [
  { href: "/dashboard/student", label: "Кабинет", icon: Home },
  {
    href: "/dashboard/student/exercises",
    label: "Упражнения",
    icon: BookOpen,
  },
  { href: "/dashboard/student/ai-tools", label: "AI-вокал", icon: Sparkles },
];

export default function StudentNav() {
  const pathname = usePathname();

  return (
    <nav className="mb-4 flex shrink-0 gap-1 overflow-x-auto rounded-2xl bg-studio-surface p-1.5 ring-1 ring-studio-border">
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
            className={`flex min-w-max flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              active
                ? "bg-studio-accent/20 text-studio-accent-light"
                : "text-studio-muted hover:text-studio-text"
            }`}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
