"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Landmark, Loader2, Smartphone } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import BottomSheet from "@/components/ui/BottomSheet";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
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

const banks = [
  { id: "sber", name: "СберБанк", color: "bg-emerald-500/15 text-emerald-400" },
  { id: "tbank", name: "Т-Банк", color: "bg-yellow-500/15 text-yellow-300" },
  { id: "vtb", name: "ВТБ", color: "bg-blue-500/15 text-blue-400" },
];

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
  onSuccess,
}: {
  open: boolean;
  purpose: PaymentPurpose;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const { refreshProfile } = useAuth();
  const [status, setStatus] = useState<"idle" | "processing" | "success">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setStatus("idle");
      setError("");
    }
  }, [open]);

  const qrValue = useMemo(() => {
    const description =
      purpose.type === "debt"
        ? "lesson-debt"
        : `${purpose.type}-${purpose.tier}`;
    return `https://qr.nspk.ru/AS1A0000000000000000000000000000?type=02&bank=100000000001&sum=${Math.round(
      purpose.amount * 100
    )}&cur=RUB&crc=${description}-${Date.now()}`;
  }, [purpose]);

  const pay = async (bankName: string) => {
    setStatus("processing");
    setError("");
    await new Promise((resolve) => window.setTimeout(resolve, 2000));

    const result = await supabase.rpc("complete_sandbox_payment", {
      payment_purpose:
        purpose.type === "debt" ? "lesson_debt" : "app_subscription",
      amount_rub: purpose.amount,
      new_tier: purpose.type === "debt" ? null : purpose.tier,
      is_duo: purpose.type === "duo_subscription",
    });

    if (result.error) {
      setStatus("idle");
      setError(`Не удалось подтвердить оплату через ${bankName}`);
      console.error("Unable to apply payment:", result.error.message);
      return;
    }

    await refreshProfile();
    window.dispatchEvent(new Event("uvs-payment-completed"));
    setStatus("success");
    onSuccess?.();
  };

  return (
    <BottomSheet open={open} onClose={status === "processing" ? () => {} : onClose}>
      {status === "success" ? (
        <div className="py-10 text-center">
          <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-400" />
          <h2 className="mt-4 font-display text-3xl font-semibold">
            Оплата успешно прошла!
          </h2>
          <p className="mt-2 text-sm text-studio-muted">
            Данные профиля и баланс обновлены.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-6 rounded-xl bg-studio-accent px-6 py-3 text-sm font-semibold text-white"
          >
            Готово
          </button>
        </div>
      ) : status === "processing" ? (
        <div className="flex flex-col items-center py-14 text-center">
          <Loader2 className="h-12 w-12 animate-spin text-studio-accent" />
          <h2 className="mt-5 font-display text-2xl font-semibold">
            Проверяем оплату
          </h2>
          <p className="mt-2 text-sm text-studio-muted">
            Банк подтверждает операцию…
          </p>
        </div>
      ) : (
        <>
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

          <div className="mx-auto mt-6 w-fit rounded-3xl bg-white p-4 shadow-glow">
            <QRCodeSVG
              value={qrValue}
              size={190}
              level="M"
              bgColor="#ffffff"
              fgColor="#16131f"
            />
          </div>
          <p className="mt-4 text-center font-display text-3xl font-semibold">
            {purpose.amount.toLocaleString("ru-RU")} ₽
          </p>
          <p className="mt-1 text-center text-xs text-studio-muted">
            Отсканируйте QR камерой или выберите банк
          </p>

          <div className="mt-6 grid gap-2 sm:grid-cols-3">
            {banks.map((bank) => (
              <button
                key={bank.id}
                type="button"
                onClick={() => void pay(bank.name)}
                className="flex items-center gap-3 rounded-2xl bg-studio-surface p-3 text-left ring-1 ring-studio-border transition hover:ring-studio-accent/50 sm:flex-col sm:text-center"
              >
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-xl ${bank.color}`}
                >
                  <Landmark className="h-5 w-5" />
                </span>
                <span className="text-sm font-medium">{bank.name}</span>
                <Smartphone className="ml-auto h-4 w-4 text-studio-muted sm:hidden" />
              </button>
            ))}
          </div>

          {error && <p className="mt-4 text-center text-sm text-red-400">{error}</p>}
          <p className="mt-5 text-center text-[10px] leading-relaxed text-studio-muted">
            Beta-режим оплаты: списание и банковский webhook пока не подключены.
          </p>
        </>
      )}
    </BottomSheet>
  );
}

export type { PaymentPurpose };
