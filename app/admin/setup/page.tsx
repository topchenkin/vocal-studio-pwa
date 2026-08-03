"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Eye, EyeOff, KeyRound, ShieldAlert } from "lucide-react";
import Logo from "@/components/Logo";
import Button from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import { ADMIN_EMAIL } from "@/lib/admin";
import { supabase } from "@/lib/supabase";

export default function AdminPasswordSetupPage() {
  const { user, profile, loading, signOut } = useAuth();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const correctEmail = user?.email?.toLowerCase() === ADMIN_EMAIL;
  const hasAdminRole = profile?.role === "admin";

  useEffect(() => {
    if (loading || !user) return;
    if (!correctEmail) {
      void signOut().then(() => router.replace("/admin/login"));
    }
  }, [correctEmail, loading, router, signOut, user]);

  const setAdminPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Пароль должен содержать минимум 8 символов");
      return;
    }
    if (password !== confirmation) {
      setError("Пароли не совпадают");
      return;
    }
    if (!hasAdminRole) {
      setError("Аккаунту не назначена роль admin. Выполните SQL-миграцию.");
      return;
    }

    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (updateError) {
      setError(`Не удалось установить пароль: ${updateError.message}`);
      return;
    }

    setSuccess(true);
    window.setTimeout(() => router.replace("/dashboard/admin"), 1200);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-studio-bg">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-studio-accent border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md rounded-3xl bg-studio-card p-7 text-center ring-1 ring-studio-border">
          <ShieldAlert className="mx-auto h-10 w-10 text-studio-gold" />
          <h1 className="mt-4 font-display text-2xl font-semibold">
            Ссылка недействительна
          </h1>
          <p className="mt-2 text-sm text-studio-muted">
            Запросите новую ссылку для первого входа.
          </p>
          <Link
            href="/admin/login"
            className="mt-5 inline-flex rounded-xl bg-studio-accent px-4 py-2.5 text-sm font-medium text-white"
          >
            Вернуться ко входу
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none fixed inset-0 bg-hero-glow" />

      <section className="relative w-full max-w-md rounded-3xl bg-studio-card p-6 ring-1 ring-studio-border shadow-card sm:p-8">
        <div className="flex items-center gap-3">
          <Logo size={48} />
          <div>
            <p className="font-display text-xl font-semibold">
              Unique Vocal Studio
            </p>
            <p className="text-xs text-studio-muted">{ADMIN_EMAIL}</p>
          </div>
        </div>

        {success ? (
          <div className="py-10 text-center">
            <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-400" />
            <h1 className="mt-4 font-display text-2xl font-semibold">
              Пароль установлен
            </h1>
            <p className="mt-2 text-sm text-studio-muted">
              Открываем панель администратора…
            </p>
          </div>
        ) : (
          <>
            <div className="mt-8 flex h-12 w-12 items-center justify-center rounded-2xl bg-studio-accent/10">
              <KeyRound className="h-6 w-6 text-studio-accent" />
            </div>
            <h1 className="mt-4 font-display text-3xl font-semibold">
              Установите пароль
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-studio-muted">
              Этот пароль будет использоваться для следующих входов в
              админ-панель.
            </p>

            {!hasAdminRole && (
              <p className="mt-4 rounded-xl bg-studio-gold/10 px-3 py-2 text-sm text-studio-gold ring-1 ring-studio-gold/20">
                Профиль найден, но роль admin не назначена. Повторно выполните
                обновлённый supabase-schema.sql.
              </p>
            )}

            <form className="mt-6 space-y-4" onSubmit={setAdminPassword}>
              <PasswordField
                label="Новый пароль"
                value={password}
                onChange={setPassword}
                visible={showPassword}
                onToggle={() => setShowPassword((current) => !current)}
              />
              <PasswordField
                label="Повторите пароль"
                value={confirmation}
                onChange={setConfirmation}
                visible={showPassword}
                onToggle={() => setShowPassword((current) => !current)}
              />

              {error && <p className="text-sm text-red-400">{error}</p>}

              <Button
                type="submit"
                size="lg"
                fullWidth
                disabled={saving || !hasAdminRole}
              >
                <KeyRound className="h-5 w-5" />
                {saving ? "Сохраняем..." : "Установить пароль"}
              </Button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  visible,
  onToggle,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-studio-muted">
        {label}
      </span>
      <span className="relative block">
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete="new-password"
          className="w-full rounded-xl bg-studio-surface px-4 py-3 pr-11 text-sm ring-1 ring-studio-border focus:outline-none focus:ring-studio-accent"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-studio-muted hover:text-white"
          aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
        >
          {visible ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
      </span>
    </label>
  );
}
