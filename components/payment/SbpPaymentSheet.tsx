"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Copy, CreditCard, Link2, Loader2, Send } from "lucide-react";
import BottomSheet from "@/components/ui/BottomSheet";
import PaymentMarks, { SbpMark } from "@/components/payment/PaymentMarks";
import { ABONEMENT_LESSONS, formatAppTier } from "@/lib/constants";
import {
  fetchPaymentMethods,
  initPayment,
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

type Phase = "choose" | "ready" | "init" | "waiting" | "share" | "paid" | "error";

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

function canNativeShare() {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

async function watchInvoice(
  invoiceNo: number,
  signal: AbortSignal,
  onPaid: () => void,
  onFailed: () => void
) {
  const result = await waitForPayment(invoiceNo, { signal });
  if (signal.aborted) return;
  if (result.status === "confirmed" || result.paid) {
    onPaid();
    return;
  }
  if (result.status === "failed") onFailed();
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
  const [hasIntl, setHasIntl] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [shareNote, setShareNote] = useState("");
  const [sharing, setSharing] = useState(false);
  const pollRef = useRef<AbortController | null>(null);

  const markPaid = useCallback(() => {
    setPhase("paid");
    window.dispatchEvent(new Event("uvs-profile-updated"));
    onSuccessRef.current?.();
    window.setTimeout(() => onCloseRef.current(), 1200);
  }, []);

  useEffect(() => {
    if (!open) {
      pollRef.current?.abort();
      pollRef.current = null;
      setPhase("choose");
      setGateway("rf");
      setError("");
      setShareUrl("");
      setShareNote("");
      setSharing(false);
      return;
    }
    let cancelled = false;
    setGateway("rf");
    setError("");
    setShareUrl("");
    setShareNote("");
    setPhase("init");
    void fetchPaymentMethods().then((methods) => {
      if (cancelled) return;
      setRfProvider(methods.rfProvider);
      setHasIntl(methods.international);
      setPhase(methods.international ? "choose" : "ready");
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
          await watchInvoice(
            invoiceNo,
            ac.signal,
            markPaid,
            () => {
              setPhase("error");
              setError("Оплата не прошла. Можно попробовать ещё раз.");
            }
          );
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
    [markPaid, purpose]
  );

  const prepareShare = useCallback(
    (next: PaymentGateway) => {
      pollRef.current?.abort();
      const ac = new AbortController();
      pollRef.current = ac;
      setGateway(next);
      setError("");
      setShareNote("");
      setPhase("init");

      void initPayment(purpose, next)
        .then(async (payload) => {
          if (ac.signal.aborted) return;
          const url = String(payload.paymentUrl || "");
          if (!url) throw new Error("Счёт создан без ссылки");
          const invoiceNo = Number(payload.invoiceNo);
          if (!invoiceNo) throw new Error("Счёт создан без номера");
          setShareUrl(url);
          setPhase("share");
          await watchInvoice(
            invoiceNo,
            ac.signal,
            markPaid,
            () => {
              setPhase("error");
              setError("Оплата не прошла. Можно попробовать ещё раз.");
            }
          );
        })
        .catch((caught: unknown) => {
          if (ac.signal.aborted) return;
          console.error("[uvs:pay] share link failed", caught);
          setPhase("error");
          setError(
            caught instanceof Error
              ? caught.message
              : "Не удалось создать ссылку на оплату"
          );
        });
    },
    [markPaid, purpose]
  );

  const copyLink = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareNote("Ссылка скопирована");
    } catch {
      setShareNote("Скопируйте ссылку вручную");
    }
  }, [shareUrl]);

  const sendLink = useCallback(async () => {
    if (!shareUrl || sharing) return;
    setSharing(true);
    const title = `Unique Vocal Studio · ${purpose.amount.toLocaleString("ru-RU")} ₽`;
    try {
      if (canNativeShare()) {
        await navigator.share({ title, text: purposeLabel(purpose), url: shareUrl });
        setShareNote("Ссылку отправили");
      } else {
        await copyLink();
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      await copyLink();
    } finally {
      setSharing(false);
    }
  }, [copyLink, purpose, shareUrl, sharing]);

  const intl = gateway === "prodamus";
  const label = paymentProviderLabel(intl ? "prodamus" : rfProvider);
  const title =
    phase === "choose"
      ? "Способ оплаты"
      : phase === "share"
        ? "Ссылка на оплату"
        : phase === "ready"
          ? "Оплата"
          : intl
            ? "Международная карта"
            : "Оплата из РФ";

  const shareButton = (next: PaymentGateway) => (
    <button
      type="button"
      onClick={() => prepareShare(next)}
      className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm text-studio-muted ring-1 ring-studio-border"
    >
      <Link2 className="h-4 w-4 shrink-0" />
      Отправить ссылку
    </button>
  );

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
          {shareButton("rf")}
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl px-6 py-3 text-sm text-studio-muted"
          >
            Отмена
          </button>
        </div>
      ) : phase === "ready" ? (
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
          {shareButton("rf")}
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl px-6 py-3 text-sm text-studio-muted"
          >
            Отмена
          </button>
        </div>
      ) : phase === "share" ? (
        <div className="mt-6 flex flex-col gap-3">
          <p className="text-center text-sm text-studio-muted">
            Отправьте ссылку маме или тому, кто оплатит. Занятия появятся в
            кабинете сразу после оплаты.
          </p>
          <p className="break-all rounded-xl bg-studio-bg/50 px-3 py-2 text-xs text-studio-muted ring-1 ring-studio-border">
            {shareUrl}
          </p>
          {shareNote ? (
            <p className="text-center text-sm text-studio-accent-light">{shareNote}</p>
          ) : null}
          <button
            type="button"
            onClick={() => void sendLink()}
            disabled={sharing}
            className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-studio-accent px-6 py-3 text-sm font-semibold text-white"
          >
            <Send className="h-4 w-4" />
            {canNativeShare() ? "Отправить" : "Скопировать ссылку"}
          </button>
          <button
            type="button"
            onClick={() => void copyLink()}
            className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm text-studio-muted ring-1 ring-studio-border"
          >
            <Copy className="h-4 w-4" />
            Скопировать
          </button>
          <button
            type="button"
            onClick={() => {
              if (shareUrl) window.location.assign(shareUrl);
            }}
            className="w-full rounded-xl px-6 py-3 text-sm text-studio-muted"
          >
            Оплатить самому
          </button>
          <p className="flex items-center justify-center gap-2 text-xs text-studio-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Ждём оплату по этой ссылке…
          </p>
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
            Готовим оплату {label}…
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
          <div className="mt-3">{shareButton(gateway)}</div>
          <button
            type="button"
            onClick={() => {
              setError("");
              setPhase(hasIntl ? "choose" : "ready");
            }}
            className="mt-3 w-full rounded-xl px-6 py-3 text-sm text-studio-muted"
          >
            Назад
          </button>
        </>
      )}
    </BottomSheet>
  );
}

export type { PaymentPurpose };
