"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, EyeOff, KeyRound, LogIn, Mail } from "lucide-react";
import BrandWordmark from "@/components/BrandWordmark";
import Logo from "@/components/Logo";
import Button from "@/components/ui/Button";
import { ADMIN_EMAIL } from "@/lib/admin";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { mapBackendError } from "@/lib/supabase-errors";

const GENERIC_AUTH_ERROR = "Неверный логин или пароль";
const GENERIC_OTP_OK =
  "Если этот адрес подходит для входа, письмо уже в пути. Откройте его на этом устройстве.";

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export default function AdminLoginForm() {
  const { signIn, signOut, enableMockAdmin } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
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
      return GENERIC_AUTH_ERROR;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || profile?.role !== "admin") {
      await signOut();
      return GENERIC_AUTH_ERROR;
    }

    router.replace("/dashboard/admin");
    return null;
  };

  const handlePasswordLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");

    const login = normalizeEmail(email);
    if (!login || !password) {
      setError("Введите почту и пароль");
      return;
    }

    if (login !== ADMIN_EMAIL) {
      setSubmitting(true);
      await new Promise((resolve) => window.setTimeout(resolve, 400));
      setSubmitting(false);
      setError(GENERIC_AUTH_ERROR);
      return;
    }

    setSubmitting(true);
    const result = await signIn(login, password);

    if (result.error) {
      setSubmitting(false);
      setError(GENERIC_AUTH_ERROR);
      return;
    }

    const adminError = await verifyAdminAndOpenDashboard();
    setSubmitting(false);
    if (adminError) setError(adminError);
  };

  const sendFirstLoginLink = async () => {
    const login = normalizeEmail(email);
    if (!login) {
      setError("Сначала укажите почту");
      return;
    }

    if (testMode) {
      if (login !== ADMIN_EMAIL) {
        setError(GENERIC_AUTH_ERROR);
        return;
      }
      enableMockAdmin();
      router.replace("/dashboard/admin");
      return;
    }

    setSendingLink(true);
    setError("");
    setMessage("");

    if (login !== ADMIN_EMAIL) {
      await new Promise((resolve) => window.setTimeout(resolve, 500));
      setSendingLink(false);
      setCooldown(60);
      setMessage(GENERIC_OTP_OK);
      return;
    }

    const redirectTo = `${window.location.origin}/admin/setup`;
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: login,
        options: {
          emailRedirectTo: redirectTo,
          shouldCreateUser: false,
        },
      });

      setSendingLink(false);

      if (otpError) {
        const rateLimited = otpError.message.toLowerCase().includes("rate limit");
        setError(
          rateLimited
            ? "Слишком много попыток. Подождите минуту и повторите."
            : mapBackendError(otpError, GENERIC_AUTH_ERROR)
        );
        if (rateLimited) setCooldown(60);
        return;
      }
    } catch (otpThrown) {
      setSendingLink(false);
      setError(mapBackendError(otpThrown, GENERIC_AUTH_ERROR));
      return;
    }

    setCooldown(60);
    setMessage(GENERIC_OTP_OK);
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

          <h1 className="mt-8 font-display text-3xl font-semibold">Вход</h1>
          <p className="mt-2 text-sm leading-relaxed text-studio-muted">
            Служебная страница. Пароль — после первого входа по письму.
          </p>

          <form className="mt-6 space-y-4" onSubmit={handlePasswordLogin}>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-studio-muted">
                Почта
              </span>
              <span className="relative block">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-studio-muted" />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="username"
                  inputMode="email"
                  placeholder="Почта для входа"
                  className="w-full rounded-xl bg-studio-surface py-3 pl-10 pr-4 text-sm ring-1 ring-studio-border focus:outline-none focus:ring-studio-accent"
                />
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
                  placeholder="Пароль"
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

            {error ? (
              <p className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-400 ring-1 ring-red-500/20">
                {error}
              </p>
            ) : null}
            {message ? (
              <p className="rounded-xl bg-emerald-500/10 px-3 py-2 text-sm leading-relaxed text-emerald-400 ring-1 ring-emerald-500/20">
                {message}
              </p>
            ) : null}

            <Button type="submit" size="lg" fullWidth disabled={submitting}>
              <LogIn className="h-5 w-5" />
              {submitting ? "Проверяем…" : "Войти"}
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-studio-border" />
            <span className="text-[10px] uppercase tracking-wider text-studio-muted">
              Письмо
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
              ? "Отправляем…"
              : cooldown > 0
                ? `Повторить через ${cooldown} сек.`
                : testMode
                  ? "Тестовый вход"
                  : "Войти по ссылке из письма"}
          </Button>
        </section>
      </div>
    </main>
  );
}
