"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Button from "@/components/ui/Button";
import { supabase } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (password.length < 6) {
      setError("Пароль не короче 6 символов");
      return;
    }
    if (password !== confirm) {
      setError("Пароли не совпадают");
      return;
    }
    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (updateError) {
      setError(
        updateError.message.includes("session")
          ? "Ссылка устарела. Запросите новую из окна входа."
          : updateError.message
      );
      return;
    }
    setMessage("Пароль обновлён. Можно входить в кабинет.");
    window.setTimeout(() => router.replace("/"), 1200);
  };

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none fixed inset-0 bg-hero-glow" />
      <div className="relative mx-auto max-w-md px-4 pb-20 pt-5 sm:px-6">
        <Header />
        <form
          className="mt-10 space-y-4 rounded-3xl bg-studio-card/70 p-5 ring-1 ring-studio-border sm:p-8"
          onSubmit={(event) => void handleSubmit(event)}
        >
          <h1 className="font-display text-2xl font-semibold">Новый пароль</h1>
          <p className="text-sm text-studio-muted">
            Придумайте пароль для входа в кабинет Unique Vocal.
          </p>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-studio-muted">
              Пароль
            </span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              className="min-h-11 w-full rounded-xl bg-studio-surface px-4 py-3 text-sm ring-1 ring-studio-border focus:outline-none focus:ring-studio-accent"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-studio-muted">
              Ещё раз
            </span>
            <input
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              autoComplete="new-password"
              className="min-h-11 w-full rounded-xl bg-studio-surface px-4 py-3 text-sm ring-1 ring-studio-border focus:outline-none focus:ring-studio-accent"
            />
          </label>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          {message ? <p className="text-sm text-emerald-400">{message}</p> : null}
          <Button type="submit" size="lg" fullWidth disabled={submitting}>
            {submitting ? "Сохраняем..." : "Сохранить пароль"}
          </Button>
        </form>
      </div>
    </main>
  );
}
