"use client";

import { useEffect, useState } from "react";
import { Loader2, Smartphone } from "lucide-react";
import BottomSheet from "@/components/ui/BottomSheet";
import { startRobokassaPayment } from "@/lib/robokassa-client";
import type { AppSubscriptionTier } from "@/types";

type PaymentPurpose =
  | { type: "debt"; amount: number }
  | {
      type: "subscription";
      amount: number;
      tier: Exclude<AppSubscriptionTier, "none">;
    }
  | {
      type: "duo_subscription";
      amount: number;
      tier: Exclude<AppSubscriptionTier, "none">;
    };

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

export default function SbpPaymentSheet({
  open,
  purpose,
  onClose,
}: {
  open: boolean;
  purpose: PaymentPurpose;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    setBusy(true);
    void startRobokassaPayment(purpose)
      .catch((caught: unknown) => {
        setBusy(false);
        setError(
          caught instanceof Error ? caught.message : "Не удалось открыть оплату"
        );
      });
  }, [open, purpose]);

  return (
    <BottomSheet open={open} onClose={busy ? () => {} : onClose}>
      <div className="pr-10">
        <SbpLogo />
        <h2 className="mt-5 font-display text-3xl font-semibold">
          Оплата по СБП
        </h2>
        <p className="mt-1 text-sm text-studio-muted">
          {purpose.type === "debt"
            ? "Оплата задолженности за урок"
            : `Подписка ${purpose.tier}${
                purpose.type === "duo_subscription" ? " Duo" : ""
              }`}
        </p>
      </div>

      <p className="mt-6 text-center font-display text-3xl font-semibold">
        {purpose.amount.toLocaleString("ru-RU")} ₽
      </p>

      {busy && !error ? (
        <div className="flex flex-col items-center py-10 text-center">
          <Loader2 className="h-10 w-10 animate-spin text-studio-accent" />
          <p className="mt-4 text-sm text-studio-muted">
            Открываем страницу Робокассы…
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
              setBusy(true);
              void startRobokassaPayment(purpose).catch((caught: unknown) => {
                setBusy(false);
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
