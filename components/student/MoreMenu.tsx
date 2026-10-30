"use client";

import Link from "next/link";
import {
  ChevronRight,
  ClipboardList,
  Crown,
  FlaskConical,
  LogOut,
  Moon,
  Sun,
  TrendingUp,
} from "lucide-react";
import CatLevelText from "@/components/ui/CatLevelText";
import GiftRedeemCard from "@/components/student/GiftRedeemCard";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { CAT_LEVEL_IMAGES, CAT_LEVEL_LABELS } from "@/lib/cat-levels";
import { formatAppTier } from "@/lib/constants";
import type { CatLevel } from "@/types";

const LINKS = [
  {
    href: "/dashboard/student/subscription",
    title: "Подписка и оплата",
    text: "Тариф, оплата и история платежей",
    icon: Crown,
  },
  {
    href: "/dashboard/student/ai-tools",
    title: "Лаборатория",
    text: "Анализатор нот, сведение, обработка голоса",
    icon: FlaskConical,
  },
  {
    href: "/dashboard/student/pro-test",
    title: "Проф. тест",
    text: "Короткий зачёт на уровень котика",
    icon: ClipboardList,
  },
  {
    href: "/dashboard/student/progress",
    title: "Мой прогресс",
    text: "Рекорды, статистика и история тестов",
    icon: TrendingUp,
  },
] as const;

export default function MoreMenu() {
  const { profile, user, tier, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const level = (profile?.cat_level ?? "beginner") as CatLevel;
  const name = String(
    profile?.full_name || user?.user_metadata?.full_name || "Ученик"
  );
  const tierName = tier === "none" ? "Без подписки" : formatAppTier(tier);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 rounded-3xl bg-studio-card p-4 ring-1 ring-studio-border">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={CAT_LEVEL_IMAGES[level]}
          alt=""
          className="h-16 w-16 shrink-0 bg-transparent object-contain"
        />
        <div className="min-w-0">
          <p className="truncate font-display text-xl font-semibold">{name}</p>
          <p className="truncate text-sm text-studio-muted">{user?.email}</p>
          <p className="mt-1 text-sm text-studio-accent-light">
            <CatLevelText label={CAT_LEVEL_LABELS[level]} /> · {tierName}
          </p>
        </div>
      </div>

      <nav
        aria-label="Дополнительные разделы"
        className="divide-y divide-studio-border overflow-hidden rounded-3xl bg-studio-card ring-1 ring-studio-border"
      >
        {LINKS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex min-h-16 items-center gap-3 px-4 py-3 transition hover:bg-studio-surface"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-studio-accent/15 text-studio-accent-light">
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{item.title}</span>
                <span className="block text-sm text-studio-muted">
                  {item.text}
                </span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-studio-muted" />
            </Link>
          );
        })}
      </nav>

      <GiftRedeemCard />

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={toggleTheme}
          className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-studio-card px-4 text-sm ring-1 ring-studio-border transition hover:ring-studio-accent/40"
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
          {theme === "dark" ? "Светлая тема" : "Тёмная тема"}
        </button>
        <button
          type="button"
          onClick={() => void signOut()}
          className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-studio-card px-4 text-sm text-studio-muted ring-1 ring-studio-border transition hover:text-studio-text"
        >
          <LogOut className="h-4 w-4" />
          Выйти
        </button>
      </div>
    </div>
  );
}
