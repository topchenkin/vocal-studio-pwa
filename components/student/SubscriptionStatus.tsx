"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays, Crown, Sparkles, WalletCards } from "lucide-react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import SbpPaymentSheet, {
  type PaymentPurpose,
} from "@/components/payment/SbpPaymentSheet";
import { useAuth } from "@/context/AuthContext";
import DuoSubscriptionCard from "@/components/student/DuoSubscriptionCard";
import PaymentHistory from "@/components/student/PaymentHistory";
import { APP_TIER_PRICES, subscriptionTotal } from "@/lib/constants";
import Link from "next/link";

export default function SubscriptionStatus() {
  const { profile, tier, refreshProfile } = useAuth();
  const [payment, setPayment] = useState<PaymentPurpose | null>(null);

  if (!profile) return null;

  const tierName =
    tier === "none"
      ? "Без подписки"
      : `${tier.charAt(0).toUpperCase()}${tier.slice(1)}`;
  const expiry =
    profile.app_sub_expires_at &&
    !Number.isNaN(new Date(profile.app_sub_expires_at).getTime())
      ? new Date(profile.app_sub_expires_at).toLocaleDateString("ru-RU")
      : null;
  const active =
    tier !== "none" &&
    (!profile.app_sub_expires_at ||
      new Date(profile.app_sub_expires_at).getTime() > Date.now());

  return (
    <>
      <div className="space-y-4">
        <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-studio-card via-studio-surface to-studio-accent/10 p-5 ring-1 ring-studio-border">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-studio-muted">
                Подписка на приложение
              </p>
              <h2 className="mt-1 font-display text-2xl font-semibold">
                {tierName}
              </h2>
            </div>
            <Badge variant={tier === "vip" ? "gold" : "default"}>
              <Crown className="mr-1 h-3 w-3" />
              {tierName}
            </Badge>
          </div>
          <div className="mt-3 flex items-center gap-2 text-sm text-studio-muted">
            <CalendarDays className="h-4 w-4 text-studio-accent-light" />
            {active && expiry
              ? `Подписка до ${expiry}`
              : active
                ? "Срок подписки не указан"
                : expiry
                  ? `Истекла ${expiry}`
                  : "Нет активной подписки"}
          </div>

          {!active && (
            <Button
              className="mt-4"
              fullWidth
              onClick={() =>
                setPayment({
                  type: "subscription",
                  tier: "standard",
                  months: 3,
                  amount: subscriptionTotal(APP_TIER_PRICES.standard, 3),
                })
              }
            >
              <Sparkles className="h-4 w-4" />
              Standard · 3 мес. ·{" "}
              {subscriptionTotal(APP_TIER_PRICES.standard, 3).toLocaleString(
                "ru-RU"
              )}{" "}
              ₽
            </Button>
          )}
          <Link
            href="/dashboard/student/subscription"
            className="mt-3 block text-center text-xs text-studio-accent-light underline-offset-2 hover:underline"
          >
            Все тарифы и сроки оплаты
          </Link>
        </div>

        <DuoSubscriptionCard profile={profile} />

        {profile.debt_amount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl bg-red-500/10 p-4 ring-1 ring-red-500/30"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/15">
                <WalletCards className="h-5 w-5 text-red-400" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-red-300">
                  У вас есть неоплаченный урок:{" "}
                  {profile.debt_amount.toLocaleString("ru-RU")} ₽
                </p>
                <p className="mt-1 text-xs text-red-300/70">
                  Погасите задолженность через Систему быстрых платежей.
                </p>
              </div>
            </div>
            <Button
              className="mt-4 bg-red-500 shadow-none hover:bg-red-400"
              fullWidth
              onClick={() =>
                setPayment({ type: "debt", amount: profile.debt_amount })
              }
            >
              Оплатить по СБП
            </Button>
          </motion.div>
        )}
        <PaymentHistory />
      </div>

      {payment && (
        <SbpPaymentSheet
          open
          purpose={payment}
          onClose={() => setPayment(null)}
          onSuccess={() => {
            void refreshProfile();
          }}
        />
      )}
    </>
  );
}
