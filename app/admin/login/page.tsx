"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  KeyRound,
  LogIn,
  Mail,
  ShieldCheck,
} from "lucide-react";
import BrandWordmark from "@/components/BrandWordmark";
import Logo from "@/components/Logo";
import Button from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { mapBackendError } from "@/lib/supabase-errors";
import { ADMIN_EMAIL } from "@/lib/admin";

export default function AdminLoginPage() {
  const { signIn, signOut, enableMockAdmin } = useAuth();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sendingLink, setSendingLink] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const testMode = process.env.NODE_ENV === "development";

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(
      () => setCooldown((current) => Math.max(0, current - 1)),
      1000
    );
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const verifyAdminAndOpenDashboard = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || user.email?.toLowerCase() !== ADMIN_EMAIL) {
      await signOut();
      return "Этот аккаунт не является аккаунтом администратора";
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || profile?.role !== "admin") {
      await signOut();
      return "Для аккаунта не назначена роль admin";
    }

    router.replace("/dashboard/admin");
    return null;
  };

  const handlePasswordLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!password) {
      setError("Введите установленный пароль");
      return;
    }

    setSubmitting(true);
    const result = await signIn(ADMIN_EMAIL, password);

    if (result.error) {
      setSubmitting(false);
      setError(
        "Пароль ещё не установлен или введён неверно. Для первого входа используйте кнопку ниже."
      );
      return;
    }

    const adminError = await verifyAdminAndOpenDashboard();
    setSubmitting(false);
    if (adminError) setError(adminError);
  };

  const sendFirstLoginLink = async () => {
    if (testMode) {
      enableMockAdmin();
      router.replace("/dashboard/admin");
      return;
    }

    setSendingLink(true);
    setError("");
    setMessage("");

    const redirectTo = `${window.location.origin}/admin/setup`;
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: ADMIN_EMAIL,
        options: {
          emailRedirectTo: redirectTo,
          shouldCreateUser: true,
        },
      });

      setSendingLink(false);

      if (otpError) {
        const rateLimited = otpError.message
          .toLowerCase()
          .includes("rate limit");
        setError(
          rateLimited
            ? "Лимит отправки писем Supabase исчерпан. Используйте последнее полученное письмо или повторите запрос позже."
            : mapBackendError(
                otpError,
                `Не удалось отправить ссылку: ${otpError.message}`
              )
        );
        if (rateLimited) setCooldown(60);
        return;
      }
    } catch (otpThrown) {
      setSendingLink(false);
      setError(mapBackendError(otpThrown));
      return;
    }

    setCooldown(60);
    setMessage(
      `Ссылка отправлена на ${ADMIN_EMAIL}. Откройте письмо на этом устройстве и установите пароль.`
    );
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none fixed inset-0 bg-hero-glow" />
      <div className="pointer-events-none fixed -right-32 top-20 h-80 w-80 rounded-full bg-studio-accent/10 blur-3xl" />

      <div className="relative w-full max-w-md">
        <Link
          href="/"
          className="mb-5 inline-flex items-center gap-1.5 text-sm text-studio-muted transition hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          На главную
        </Link>

        <section className="rounded-3xl bg-studio-card p-6 ring-1 ring-studio-border shadow-card sm:p-8">
          <div className="flex items-center gap-3">
            <Logo size={48} />
            <BrandWordmark size="lg" subtitle="Панель управления" />
          </div>

          <div className="mt-8 flex h-12 w-12 items-center justify-center rounded-2xl bg-studio-accent/10 ring-1 ring-studio-accent/30">
            <ShieldCheck className="h-6 w-6 text-studio-accent" />
          </div>
          <h1 className="mt-4 font-display text-3xl font-semibold">
            Вход администратора
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-studio-muted">
            Первый вход выполняется по защищённой ссылке из письма. После этого
            задайте постоянный пароль.
          </p>

          <form className="mt-6 space-y-4" onSubmit={handlePasswordLogin}>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-studio-muted">
                Логин администратора
              </span>
              <span className="flex items-center gap-2 rounded-xl bg-studio-surface px-4 py-3 text-sm text-studio-muted ring-1 ring-studio-border">
                <Mail className="h-4 w-4" />
                {ADMIN_EMAIL}
              </span>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-studio-muted">
                Пароль
              </span>
              <span className="relative block">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  placeholder="Введите пароль после первого входа"
                  className="w-full rounded-xl bg-studio-surface px-4 py-3 pr-11 text-sm ring-1 ring-studio-border focus:outline-none focus:ring-studio-accent"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-studio-muted hover:text-white"
                  aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </span>
            </label>

            {error && (
              <p className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-400 ring-1 ring-red-500/20">
                {error}
              </p>
            )}
            {message && (
              <p className="rounded-xl bg-emerald-500/10 px-3 py-2 text-sm leading-relaxed text-emerald-400 ring-1 ring-emerald-500/20">
                {message}
              </p>
            )}

            <Button type="submit" size="lg" fullWidth disabled={submitting}>
              <LogIn className="h-5 w-5" />
              {submitting ? "Проверяем доступ..." : "Войти по паролю"}
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-studio-border" />
            <span className="text-[10px] uppercase tracking-wider text-studio-muted">
              Первый вход
            </span>
            <span className="h-px flex-1 bg-studio-border" />
          </div>

          <Button
            variant="secondary"
            size="lg"
            fullWidth
            disabled={sendingLink || cooldown > 0}
            onClick={() => void sendFirstLoginLink()}
          >
            {sendingLink ? (
              <KeyRound className="h-5 w-5 animate-pulse" />
            ) : (
              <Mail className="h-5 w-5" />
            )}
            {sendingLink
              ? "Отправляем ссылку..."
              : cooldown > 0
                ? `Повторить через ${cooldown} сек.`
                : testMode
                  ? "Тестовый вход без пароля"
                  : "Первый вход без пароля"}
          </Button>
          <p className="mt-3 text-center text-xs leading-relaxed text-studio-muted">
            {testMode
              ? "Dev-режим: вход создаёт локальную тестовую сессию и не отправляет письмо."
              : "Если письмо уже приходило, откройте последнюю ссылку — запрашивать новую не нужно."}
          </p>
        </section>
      </div>
    </main>
  );
}
