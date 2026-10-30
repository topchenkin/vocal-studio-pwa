"use client";

import { useState } from "react";
import { WalletCards } from "lucide-react";
import Button from "@/components/ui/Button";
import SbpPaymentSheet, {
  type PaymentPurpose,
} from "@/components/payment/SbpPaymentSheet";
import { useAuth } from "@/context/AuthContext";

/** Unpaid-lesson reminder with the payment button, shown above the schedule. */
export default function DebtNotice() {
  const { profile, refreshProfile } = useAuth();
  const [payment, setPayment] = useState<PaymentPurpose | null>(null);
  const debt = Number(profile?.debt_amount) || 0;
  if (debt <= 0) return null;

  return (
    <>
      <div className="rounded-2xl bg-red-500/10 p-4 ring-1 ring-red-500/30">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/15">
            <WalletCards className="h-5 w-5 text-red-400" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-red-300">
              Неоплаченные занятия: {debt.toLocaleString("ru-RU")} ₽
            </p>
            <p className="mt-1 text-sm text-red-300/80">
              Оплатить можно через Систему быстрых платежей.
            </p>
          </div>
        </div>
        <Button
          className="mt-4 bg-red-500 shadow-none hover:bg-red-400"
          fullWidth
          onClick={() => setPayment({ type: "debt", amount: debt })}
        >
          Оплатить по СБП
        </Button>
      </div>
      {payment ? (
        <SbpPaymentSheet
          open
          purpose={payment}
          onClose={() => setPayment(null)}
          onSuccess={() => {
            void refreshProfile();
          }}
        />
      ) : null}
    </>
  );
}
