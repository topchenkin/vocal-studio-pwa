"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, LogIn, UserPlus } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";

type AuthMode = "login" | "register";

interface AuthModalProps {
  open: boolean;
  initialMode: AuthMode;
  onClose: () => void;
}

export default function AuthModal({
  open,
  initialMode,
  onClose,
}: AuthModalProps) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setError("");
    setMessage("");
  }, [initialMode, open]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!email.trim() || password.length < 6) {
      setError("Введите email и пароль не короче 6 символов");
      return;
    }
    if (mode === "register" && !fullName.trim()) {
      setError("Укажите имя");
      return;
    }

    setSubmitting(true);
    const result =
      mode === "register"
        ? await signUp(email.trim(), password, fullName.trim())
        : await signIn(email.trim(), password);
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    if (result.needsEmailConfirmation) {
      setMessage("Проверьте почту и подтвердите регистрацию.");
      return;
    }

    onClose();
  };

  const switchMode = () => {
    setMode((current) => (current === "login" ? "register" : "login"));
    setError("");
    setMessage("");
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === "login" ? "Вход" : "Регистрация"}
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <p className="text-sm leading-relaxed text-studio-muted">
          {mode === "login"
            ? "Войдите в личный кабинет Unique Vocal Studio."
            : "Создайте аккаунт платформы. Статус активного ученика назначает администратор."}
        </p>

        {mode === "register" && (
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-studio-muted">
              Имя
            </span>
            <input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              autoComplete="name"
              className="w-full rounded-xl bg-studio-surface px-4 py-3 text-sm ring-1 ring-studio-border transition focus:outline-none focus:ring-studio-accent"
              placeholder="Ваше имя"
            />
          </label>
        )}

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-studio-muted">
            Email
          </span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            className="w-full rounded-xl bg-studio-surface px-4 py-3 text-sm ring-1 ring-studio-border transition focus:outline-none focus:ring-studio-accent"
            placeholder="you@example.com"
          />
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
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              className="w-full rounded-xl bg-studio-surface px-4 py-3 pr-11 text-sm ring-1 ring-studio-border transition focus:outline-none focus:ring-studio-accent"
              placeholder="Минимум 6 символов"
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
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

        {error && <p className="text-sm text-red-400">{error}</p>}
        {message && <p className="text-sm text-emerald-400">{message}</p>}

        <Button type="submit" size="lg" fullWidth disabled={submitting}>
          {mode === "login" ? (
            <LogIn className="h-5 w-5" />
          ) : (
            <UserPlus className="h-5 w-5" />
          )}
          {submitting
            ? "Подождите..."
            : mode === "login"
              ? "Войти"
              : "Создать аккаунт"}
        </Button>

        <button
          type="button"
          onClick={switchMode}
          className="w-full text-center text-sm text-studio-accent transition hover:text-studio-accent-light"
        >
          {mode === "login"
            ? "Нет аккаунта? Зарегистрироваться"
            : "Уже есть аккаунт? Войти"}
        </button>
      </form>
    </Modal>
  );
}
