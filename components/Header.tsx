"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu,
  X,
  LayoutDashboard,
  LogOut,
  Moon,
  Sun,
} from "lucide-react";
import { useState } from "react";
import BrandWordmark from "@/components/BrandWordmark";
import Logo from "@/components/Logo";
import NotificationBell from "@/components/notifications/NotificationBell";
import { useAuth } from "@/context/AuthContext";
import { APP_NAME } from "@/lib/constants";
import { LEGAL } from "@/lib/legal";
import { useTheme } from "@/context/ThemeContext";

interface HeaderProps {
  showNav?: boolean;
}

export default function Header({ showNav = true }: HeaderProps) {
  const { isAuthenticated, isAdmin, isStudent, signOut } = useAuth();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const dashboardHref = isAdmin
    ? "/dashboard/admin"
    : isAuthenticated
      ? "/dashboard/student"
      : "/";

  return (
    <header className="relative z-30 flex w-full min-w-0 items-center justify-between overflow-visible pt-[env(safe-area-inset-top)] animate-fade-in opacity-0 [animation-fill-mode:forwards]">
      <Link href="/" className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden pr-2 sm:gap-3 sm:flex-none">
        <Logo size={48} />
        <BrandWordmark className="min-w-0" subtitle="Студия вокала" />
      </Link>

      <div className="flex items-center gap-1 sm:gap-2">
        {isAuthenticated && <NotificationBell />}
        <button
          type="button"
          onClick={toggleTheme}
          className="flex h-11 w-11 items-center justify-center rounded-lg bg-studio-surface text-studio-muted ring-1 ring-studio-border transition hover:text-studio-text"
          aria-label={
            theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"
          }
          title={
            theme === "dark" ? "Светлая тема" : "Тёмная тема"
          }
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </button>

        {showNav && (
          <>
            {isAuthenticated && pathname === "/" && (
              <Link
                href={dashboardHref}
                className="hidden items-center gap-1.5 rounded-lg bg-studio-surface px-3 py-2 text-sm text-studio-muted ring-1 ring-studio-border transition-colors hover:text-studio-text sm:flex"
              >
                <LayoutDashboard className="h-4 w-4" />
                Кабинет
              </Link>
            )}
            {isAuthenticated && (
              <button
                type="button"
                onClick={() => void signOut()}
                className="hidden h-11 w-11 items-center justify-center rounded-lg text-studio-muted transition-colors hover:bg-studio-card hover:text-studio-text sm:flex"
                aria-label="Выйти"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-studio-muted transition-colors hover:bg-studio-card hover:text-studio-text sm:hidden"
              aria-label="Меню"
            >
              {menuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </button>
          </>
        )}
      </div>

      {menuOpen && showNav && (
        <div className="absolute left-0 right-0 top-16 z-30 mx-4 rounded-xl bg-studio-card p-3 ring-1 ring-studio-border shadow-card sm:hidden">
          {isAuthenticated && (
            <Link
              href={dashboardHref}
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-studio-muted hover:bg-studio-surface hover:text-studio-text"
            >
              <LayoutDashboard className="h-4 w-4" />
              {isAdmin ? "Админ-панель" : "Личный кабинет"}
            </Link>
          )}
          {!isAuthenticated && (
            <nav className="flex flex-col">
              <p className="px-3 py-2 text-xs text-studio-muted">
                {APP_NAME} — запишитесь на урок
              </p>
              {[
                { href: LEGAL.uslugiPath, label: "Услуги и цены" },
                { href: LEGAL.offerPath, label: "Оферта и возврат" },
                { href: LEGAL.privacyPath, label: "Конфиденциальность" },
                { href: LEGAL.contactsPath, label: "Контакты" },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className="flex min-h-11 items-center rounded-lg px-3 py-2.5 text-sm text-studio-muted hover:bg-studio-surface hover:text-studio-text"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          )}
          {isStudent && (
            <Link
              href="/dashboard/student/exercises"
              onClick={() => setMenuOpen(false)}
              className="flex rounded-lg px-3 py-2.5 text-sm text-studio-muted hover:bg-studio-surface hover:text-studio-text"
            >
              Обучение
            </Link>
          )}
          {isAuthenticated && (
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                void signOut();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-studio-muted hover:bg-studio-surface hover:text-studio-text"
            >
              <LogOut className="h-4 w-4" />
              Выйти
            </button>
          )}
        </div>
      )}
    </header>
  );
}
