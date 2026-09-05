"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Gift, LogIn, UserPlus } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import { formatGiftCode, normalizeGiftCode } from "@/lib/gift-certificates";
import { supabase } from "@/lib/supabase";

type AuthMode = "login" | "register";

interface AuthModalProps {
  open: boolean;
  initialMode: AuthMode;
  onClose: () => void;
}

const PENDING_GIFT_KEY = "uvs_pending_gift_code";

function storePendingGift(code: string) {
  try {
    sessionStorage.setItem(PENDING_GIFT_KEY, code);
    localStorage.setItem(PENDING_GIFT_KEY, code);
  } catch {
    /* ignore */
  }
}

function clearPendingGift() {
  try {
    sessionStorage.removeItem(PENDING_GIFT_KEY);
    localStorage.removeItem(PENDING_GIFT_KEY);
  } catch {
    /* ignore */
  }
}

export default function AuthModal({
  open,
  initialMode,
  onClose,
}: AuthModalProps) {
  const { signIn, signUp, backendError, refreshProfile } = useAuth();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [giftCode, setGiftCode] = useState("");
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

  const redeemIfNeeded = async (codeRaw: string, name: string) => {
    const code = normalizeGiftCode(codeRaw);
    if (code.length !== 12) return null;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return "Сессия ещё не готова — войдите и активируйте код в кабинете";

    await supabase.rpc("update_own_profile", {
      p_full_name: name.trim(),
    });

    const { error: redeemError } = await supabase.rpc(
      "redeem_gift_certificate",
      {
        p_code: code,
        p_full_name: name.trim(),
      }
    );
    if (redeemError) return redeemError.message;
    await refreshProfile();
    clearPendingGift();
    return null;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!email.trim() || password.length < 6) {
      setError("Введите email и пароль не короче 6 символов");
      return;
    }
    if (mode === "register" && !fullName.trim()) {
      setError("Укажите имя — как на подарочном сертификате");
      return;
    }
    if (mode === "register" && !phone.trim()) {
      setError("Укажите телефон");
      return;
    }
    const code = normalizeGiftCode(giftCode);
    if (mode === "register" && giftCode.trim() && code.length !== 12) {
      setError("Код сертификата — 12 букв и цифр");
      return;
    }

    setSubmitting(true);
    const result =
      mode === "register"
        ? await signUp(
            email.trim(),
            password,
            fullName.trim(),
            phone.trim(),
            code.length === 12 ? code : undefined
          )
        : await signIn(email.trim(), password);
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    if (result.needsEmailConfirmation) {
      if (code.length === 12) storePendingGift(code);
      setMessage(
        "Проверьте почту и подтвердите регистрацию. После входа сертификат активируется сам, если имя совпадает."
      );
      return;
    }

    if (mode === "register" && code.length === 12) {
      setSubmitting(true);
      const redeemError = await redeemIfNeeded(code, fullName.trim());
      setSubmitting(false);
      if (redeemError && !/уже активирован|already/i.test(redeemError)) {
        storePendingGift(code);
        setError(
          `Аккаунт создан, но сертификат не активирован: ${redeemError}`
        );
        return;
      }
      clearPendingGift();
      setMessage("Сертификат активирован. Можно заходить в кабинет.");
    }

    onClose();
  };

  const handleForgot = async () => {
    setError("");
    setMessage("");
    if (!email.trim()) {
      setError("Введите email, чтобы восстановить пароль");
      return;
    }
    setSubmitting(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo: `${window.location.origin}/auth/reset` }
    );
    setSubmitting(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setMessage("Если аккаунт есть, отправили ссылку на почту. Откройте её с этого телефона.");
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
            : "Создайте аккаунт. Если есть подарок — введите код. Имя должно совпасть с сертификатом."}
        </p>

        {mode === "register" && (
          <>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-studio-muted">
                Имя
              </span>
              <input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                autoComplete="name"
                className="w-full rounded-xl bg-studio-surface px-4 py-3 text-sm ring-1 ring-studio-border transition focus:outline-none focus:ring-studio-accent"
                placeholder="Как на сертификате"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-studio-muted">
                Телефон
              </span>
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                autoComplete="tel"
                className="w-full rounded-xl bg-studio-surface px-4 py-3 text-sm ring-1 ring-studio-border transition focus:outline-none focus:ring-studio-accent"
                placeholder="+7 …"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-studio-muted">
                <Gift className="h-3.5 w-3.5 text-studio-gold" />
                Код подарочного сертификата
              </span>
              <input
                value={giftCode}
                onChange={(event) =>
                  setGiftCode(formatGiftCode(event.target.value).slice(0, 14))
                }
                autoComplete="off"
                className="w-full rounded-xl bg-studio-surface px-4 py-3 font-mono text-sm tracking-wider ring-1 ring-studio-border transition focus:outline-none focus:ring-studio-accent"
                placeholder="XXXX-XXXX-XXXX"
              />
              <span className="mt-1 block text-[11px] text-studio-muted">
                Необязательно сейчас — можно активировать позже в кабинете.
              </span>
            </label>
          </>
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
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
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
        {!error && backendError && (
          <p className="text-sm text-red-400">{backendError}</p>
        )}
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

        {mode === "login" ? (
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleForgot()}
            className="w-full text-center text-sm text-studio-muted transition hover:text-studio-text"
          >
            Забыли пароль?
          </button>
        ) : null}

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
