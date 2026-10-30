"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LogOut, Moon, Sun } from "lucide-react";
import { CAT_LEVEL_IMAGES } from "@/lib/cat-levels";
import Logo from "@/components/Logo";
import NotificationBell from "@/components/notifications/NotificationBell";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import type { CatLevel } from "@/types";

export default function StudentStatusBar() {
  const { profile, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const level = (profile?.cat_level ?? "beginner") as CatLevel;
  const cat = CAT_LEVEL_IMAGES[level] ?? CAT_LEVEL_IMAGES.beginner;

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onPointer);
    return () => window.removeEventListener("mousedown", onPointer);
  }, [open]);

  return (
    <header className="relative z-30 flex w-full min-w-0 items-center gap-2 pt-[env(safe-area-inset-top)]">
      <Link
        href="/dashboard/student"
        className="flex min-w-0 items-center gap-2"
      >
        <Logo size={32} />
        <span className="truncate font-display text-sm font-semibold sm:text-base">
          <span className="text-studio-gold">Unique</span>{" "}
          <span className="text-studio-accent">Vocal</span>
        </span>
      </Link>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <NotificationBell compact />
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-studio-surface ring-1 ring-studio-border"
            aria-label="Меню ученика"
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cat}
              alt=""
              className="h-9 w-9 bg-transparent object-contain"
            />
          </button>
          {open && (
            <div className="absolute right-0 top-12 z-40 w-52 rounded-2xl bg-studio-card p-1.5 ring-1 ring-studio-border">
              <Link
                href="/dashboard/student/subscription"
                onClick={() => setOpen(false)}
                className="flex min-h-11 items-center rounded-xl px-3 text-sm"
              >
                Подписка
              </Link>
              <button
                type="button"
                onClick={() => {
                  toggleTheme();
                  setOpen(false);
                }}
                className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm"
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
                className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm text-studio-muted"
              >
                <LogOut className="h-4 w-4" />
                Выйти
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
