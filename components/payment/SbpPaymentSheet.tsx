"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, CreditCard, Loader2 } from "lucide-react";
import BottomSheet from "@/components/ui/BottomSheet";
import PaymentMarks, { SbpMark } from "@/components/payment/PaymentMarks";
import { ABONEMENT_LESSONS, formatAppTier } from "@/lib/constants";
import {
  fetchPaymentMethods,
  startPayment,
  waitForPayment,
} from "@/lib/payment-client";
import {
  paymentProviderLabel,
  type PaymentGateway,
  type RfKassa,
} from "@/lib/payment-config";
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

type Phase = "choose" | "init" | "waiting" | "paid" | "error";

function purposeLabel(purpose: PaymentPurpose) {
  if (purpose.type === "debt") return "Оплата задолженности за урок";
  if (purpose.type === "abonement")
    return `Оплата абонемента · ${purpose.lessonsCount ?? ABONEMENT_LESSONS} урока`;
  if (purpose.type === "lesson") return "Оплата занятия";
  if (purpose.type === "test_payment") return "Тестовая оплата · 1 ₽";
  return `Подписка ${formatAppTier(purpose.tier)}${
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
  const [phase, setPhase] = useState<Phase>("choose");
  const [gateway, setGateway] = useState<PaymentGateway>("rf");
  const [rfProvider, setRfProvider] = useState<RfKassa>("robokassa");
  const pollRef = useRef<AbortController | null>(null);

  const beginRef = useRef<(next: PaymentGateway) => void>(() => {});

  useEffect(() => {
    if (!open) {
      pollRef.current?.abort();
      pollRef.current = null;
      setPhase("choose");
      setGateway("rf");
      setError("");
      return;
    }
    // Offer the choice only when international cards are switched on;
    // otherwise go straight to SBP / RU cards as before.
    let cancelled = false;
    setGateway("rf");
    setError("");
    setPhase("init");
    void fetchPaymentMethods().then((methods) => {
      if (cancelled) return;
      setRfProvider(methods.rfProvider);
      if (methods.international) setPhase("choose");
      else beginRef.current("rf");
    });
    return () => {
      cancelled = true;
      pollRef.current?.abort();
    };
  }, [open]);

  const begin = useCallback(
    (next: PaymentGateway) => {
      pollRef.current?.abort();
      const ac = new AbortController();
      pollRef.current = ac;
      setGateway(next);
      setError("");
      setPhase("init");

      void startPayment(purpose, next)
        .then(async (payload) => {
          if (ac.signal.aborted) return;
          setPhase("waiting");
          const invoiceNo = Number(payload.invoiceNo);
          if (!invoiceNo) throw new Error("Счёт создан без номера");
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
          }
        })
        .catch((caught: unknown) => {
          if (ac.signal.aborted) return;
          console.error("[uvs:pay] start failed", caught);
          setPhase("error");
          setError(
            caught instanceof Error ? caught.message : "Не удалось открыть оплату"
          );
        });
    },
    [purpose]
  );
  beginRef.current = begin;

  const intl = gateway === "prodamus";
  const label = paymentProviderLabel(intl ? "prodamus" : rfProvider);
  const title =
    phase === "choose"
      ? "Способ оплаты"
      : intl
        ? "Международная карта"
        : "Оплата из РФ";

  return (
    <BottomSheet open={open} onClose={phase === "init" ? () => {} : onClose}>
      <div className="pr-10">
        <PaymentMarks />
        <h2 className="mt-5 font-display text-3xl font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-studio-muted">{purposeLabel(purpose)}</p>
      </div>

      <p className="mt-6 text-center font-display text-3xl font-semibold">
        {purpose.amount.toLocaleString("ru-RU")} ₽
      </p>

      {phase === "choose" ? (
        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => begin("rf")}
            className="flex min-h-[3.5rem] w-full items-center gap-3 rounded-xl bg-studio-accent px-5 py-3 text-left text-sm font-semibold text-white"
          >
            <SbpMark className="h-8 w-8 shrink-0" />
            <span>
              Оплатить по СБП или картой РФ
              <span className="block text-xs font-normal text-white/70">
                СБП, МИР, Visa и Mastercard российских банков
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => begin("prodamus")}
            className="flex min-h-[3.5rem] w-full items-center gap-3 rounded-xl border border-studio-border bg-studio-bg/40 px-5 py-3 text-left text-sm font-semibold"
          >
            <CreditCard className="h-5 w-5 shrink-0 text-studio-accent-light" />
            <span>
              Оплатить международной картой
              <span className="block text-xs font-normal text-studio-muted">
                На следующей странице введите Visa/Mastercard в поле «Номер
                карты». СБП и SberPay не нажимайте — это оплата из РФ
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl px-6 py-3 text-sm text-studio-muted"
          >
            Отмена
          </button>
        </div>
      ) : phase === "paid" ? (
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
            {intl
              ? "Введите зарубежную карту в поле «Номер карты» и нажмите «Оплатить». СБП и SberPay на этой странице не используйте."
              : `Страница ${label} открыта. Как только оплата пройдёт, статус обновится сам.`}
          </p>
        </div>
      ) : phase === "init" && !error ? (
        <div className="flex flex-col items-center py-10 text-center">
          <Loader2 className="h-10 w-10 animate-spin text-studio-accent" />
          <p className="mt-4 text-sm text-studio-muted">
            Открываем страницу оплаты {label}…
          </p>
        </div>
      ) : (
        <>
          {error && (
            <p className="mt-6 text-center text-sm text-red-400">{error}</p>
          )}
          <button
            type="button"
            onClick={() => begin(gateway)}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-studio-accent px-6 py-3 text-sm font-semibold text-white"
          >
            Перейти к оплате
          </button>
          <button
            type="button"
            onClick={() => {
              setError("");
              setPhase("choose");
            }}
            className="mt-3 w-full rounded-xl px-6 py-3 text-sm text-studio-muted"
          >
            Выбрать другой способ
          </button>
        </>
      )}
    </BottomSheet>
  );
}

export type { PaymentPurpose };
