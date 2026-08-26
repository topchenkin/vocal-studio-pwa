"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Smartphone } from "lucide-react";
import BottomSheet from "@/components/ui/BottomSheet";
import { startPayment, waitForPayment } from "@/lib/payment-client";
import { paymentProviderLabel } from "@/lib/payment-config";
import type { AppSubscriptionTier } from "@/types";

export type SubscriptionMonths = 1 | 3 | 6 | 12;

type PaymentPurpose =
  | { type: "debt"; amount: number }
  | {
      type: "abonement";
      amount: number;
      lessonsCount?: number;
    }
  | {
      type: "lesson";
      amount: number;
      lessonId: string;
    }
  | {
      type: "subscription";
      amount: number;
      tier: Exclude<AppSubscriptionTier, "none">;
      months: SubscriptionMonths;
    }
  | {
      type: "duo_subscription";
      amount: number;
      tier: Exclude<AppSubscriptionTier, "none">;
      months: SubscriptionMonths;
    }
  | { type: "test_payment"; amount: number };

function SbpLogo() {
  return (
    <div className="flex items-center gap-2">
      <span className="grid h-10 w-10 rotate-45 grid-cols-2 gap-0.5">
        <i className="rounded-sm bg-cyan-400" />
        <i className="rounded-sm bg-fuchsia-500" />
        <i className="rounded-sm bg-emerald-400" />
        <i className="rounded-sm bg-purple-500" />
      </span>
      <span className="text-lg font-bold">СБП</span>
    </div>
  );
}

function purposeLabel(purpose: PaymentPurpose) {
  if (purpose.type === "debt") return "Оплата задолженности за урок";
  if (purpose.type === "abonement") return "Оплата абонемента";
  if (purpose.type === "lesson") return "Оплата занятия";
  if (purpose.type === "test_payment") return "Тестовая оплата · 1 ₽";
  return `Подписка ${purpose.tier}${
    purpose.type === "duo_subscription" ? " Duo" : ""
  } · ${purpose.months} мес.`;
}

export default function SbpPaymentSheet({
  open,
  purpose,
  onClose,
  onSuccess,
}: {
  open: boolean;
  purpose: PaymentPurpose;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const onCloseRef = useRef(onClose);
  const onSuccessRef = useRef(onSuccess);
  onCloseRef.current = onClose;
  onSuccessRef.current = onSuccess;
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<"init" | "waiting" | "paid" | "error">(
    "init"
  );
  const pollRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) {
      pollRef.current?.abort();
      pollRef.current = null;
      setPhase("init");
      setError("");
      return;
    }

    setError("");
    setPhase("init");
    const ac = new AbortController();
    pollRef.current = ac;

    void startPayment(purpose)
      .then(async (payload) => {
        if (ac.signal.aborted) return;
        setPhase("waiting");
        const invoiceNo = Number(payload.invoiceNo);
        if (!invoiceNo) {
          throw new Error("Счёт создан без номера");
        }
        const result = await waitForPayment(invoiceNo, { signal: ac.signal });
        if (ac.signal.aborted) return;
        if (result.status === "confirmed" || result.paid) {
          setPhase("paid");
          window.dispatchEvent(new Event("uvs-profile-updated"));
          onSuccessRef.current?.();
          window.setTimeout(() => onCloseRef.current(), 1200);
          return;
        }
        if (result.status === "failed") {
          setPhase("error");
          setError("Оплата не прошла. Можно попробовать ещё раз.");
          return;
        }
        setPhase("waiting");
      })
      .catch((caught: unknown) => {
        if (ac.signal.aborted) return;
        setPhase("error");
        setError(
          caught instanceof Error ? caught.message : "Не удалось открыть оплату"
        );
      });

    return () => {
      ac.abort();
    };
  }, [open, purpose]);

  return (
    <BottomSheet open={open} onClose={phase === "init" ? () => {} : onClose}>
      <div className="pr-10">
        <SbpLogo />
        <h2 className="mt-5 font-display text-3xl font-semibold">
          Оплата по СБП
        </h2>
        <p className="mt-1 text-sm text-studio-muted">{purposeLabel(purpose)}</p>
      </div>

      <p className="mt-6 text-center font-display text-3xl font-semibold">
        {purpose.amount.toLocaleString("ru-RU")} ₽
      </p>

      {phase === "paid" ? (
        <div className="flex flex-col items-center py-10 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-400" />
          <p className="mt-4 text-sm text-studio-accent-light">
            Оплата прошла, обновляем расписание…
          </p>
        </div>
      ) : phase === "waiting" && !error ? (
        <div className="flex flex-col items-center py-10 text-center">
          <Loader2 className="h-10 w-10 animate-spin text-studio-accent" />
          <p className="mt-4 text-sm text-studio-muted">
            Страница {paymentProviderLabel()} открыта. Как только оплата пройдёт,
            статус обновится сам.
          </p>
        </div>
      ) : phase === "init" && !error ? (
        <div className="flex flex-col items-center py-10 text-center">
          <Loader2 className="h-10 w-10 animate-spin text-studio-accent" />
          <p className="mt-4 text-sm text-studio-muted">
            Открываем страницу оплаты {paymentProviderLabel()}…
          </p>
        </div>
      ) : (
        <>
          {error && (
            <p className="mt-6 text-center text-sm text-red-400">{error}</p>
          )}
          <button
            type="button"
            onClick={() => {
              setError("");
              setPhase("init");
              const ac = new AbortController();
              pollRef.current?.abort();
              pollRef.current = ac;
              void startPayment(purpose)
                .then(async (payload) => {
                  if (ac.signal.aborted) return;
                  setPhase("waiting");
                  const invoiceNo = Number(payload.invoiceNo);
                  if (!invoiceNo) throw new Error("Счёт создан без номера");
                  const result = await waitForPayment(invoiceNo, {
                    signal: ac.signal,
                  });
                  if (ac.signal.aborted) return;
                  if (result.status === "confirmed" || result.paid) {
                    setPhase("paid");
                    window.dispatchEvent(new Event("uvs-profile-updated"));
                    onSuccessRef.current?.();
                    window.setTimeout(() => onCloseRef.current(), 1200);
                    return;
                  }
                  if (result.status === "failed") {
                    setPhase("error");
                    setError("Оплата не прошла. Можно попробовать ещё раз.");
                  }
                })
                .catch((caught: unknown) => {
                  if (ac.signal.aborted) return;
                  setPhase("error");
                  setError(
                    caught instanceof Error
                      ? caught.message
                      : "Не удалось открыть оплату"
                  );
                });
            }}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-studio-accent px-6 py-3 text-sm font-semibold text-white"
          >
            <Smartphone className="h-4 w-4" />
            Перейти к оплате
          </button>
          <button
            type="button"
            onClick={onClose}
            className="mt-3 w-full rounded-xl px-6 py-3 text-sm text-studio-muted"
          >
            Отмена
          </button>
        </>
      )}
    </BottomSheet>
  );
}

export type { PaymentPurpose };
