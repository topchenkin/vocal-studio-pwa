"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Cat, Crown, Sparkles, WalletCards } from "lucide-react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import SbpPaymentSheet, {
  type PaymentPurpose,
} from "@/components/payment/SbpPaymentSheet";
import { useAuth } from "@/context/AuthContext";
import DuoSubscriptionCard from "@/components/student/DuoSubscriptionCard";
import PaymentHistory from "@/components/student/PaymentHistory";
import type { CatLevel } from "@/types";

const catLevels: Record<
  CatLevel,
  { title: string; progress: number; next: string }
> = {
  beginner: {
    title: "Мурчащий котик",
    progress: 25,
    next: "Певчий котик",
  },
  basic: { title: "Певчий котик", progress: 50, next: "Джазовый кот" },
  pro: { title: "Джазовый кот", progress: 75, next: "Кот-звезда" },
  star: { title: "Кот-звезда", progress: 100, next: "Максимальный уровень" },
};

export default function SubscriptionStatus() {
  const { profile, tier } = useAuth();
  const [payment, setPayment] = useState<PaymentPurpose | null>(null);

  if (!profile) return null;

  const cat = catLevels[profile.cat_level] ?? catLevels.beginner;
  const tierName =
    tier === "none"
      ? "Без подписки"
      : `${tier.charAt(0).toUpperCase()}${tier.slice(1)}`;

  return (
    <>
      <div className="space-y-4">
        <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-studio-card via-studio-surface to-studio-accent/10 p-5 ring-1 ring-studio-border">
          <div className="flex items-start justify-between gap-3">
            <motion.div
              initial={{ rotate: -4, scale: 0.9 }}
              animate={{ rotate: [0, 3, 0], scale: 1 }}
              transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 2 }}
              className="flex items-center gap-3"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-studio-accent/15 ring-1 ring-studio-accent/30 shadow-glow">
                <Cat className="h-8 w-8 text-studio-accent-light" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-studio-muted">
                  Ваш уровень
                </p>
                <h2 className="font-display text-2xl font-semibold">
                  {cat.title}
                </h2>
              </div>
            </motion.div>
            <Badge variant={tier === "vip" ? "gold" : "default"}>
              <Crown className="mr-1 h-3 w-3" />
              {tierName}
            </Badge>
          </div>

          <div className="mt-6">
            <div className="mb-2 flex justify-between text-xs">
              <span className="text-studio-muted">Прогресс уровня</span>
              <span className="text-studio-accent-light">{cat.progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-studio-bg">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${cat.progress}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="h-full rounded-full bg-gradient-to-r from-studio-accent to-studio-gold"
              />
            </div>
            <p className="mt-2 text-[11px] text-studio-muted">
              Следующий уровень: {cat.next}
            </p>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-studio-bg/50 p-4">
              <p className="text-xs text-studio-muted">Остаток уроков</p>
              <p className="mt-1 font-display text-3xl font-semibold">
                {profile.lessons_balance}
              </p>
            </div>
            <div className="rounded-2xl bg-studio-bg/50 p-4">
              <p className="text-xs text-studio-muted">Оплата занятий</p>
              <p className="mt-2 text-sm font-medium">
                {profile.lesson_pay_type === "abonement"
                  ? "Абонемент"
                  : "Разовая"}
              </p>
              <p className="mt-1 text-xs text-studio-accent-light">
                {(
                  profile.lesson_pay_type === "abonement"
                    ? profile.custom_abonement_price
                    : profile.custom_lesson_price
                ) > 0
                  ? `${(
                      profile.lesson_pay_type === "abonement"
                        ? profile.custom_abonement_price
                        : profile.custom_lesson_price
                    ).toLocaleString("ru-RU")} ₽`
                  : "Стоимость уточняется"}
              </p>
            </div>
          </div>

          {tier === "none" && (
            <Button
              className="mt-4"
              fullWidth
              onClick={() =>
                setPayment({
                  type: "subscription",
                  tier: "standard",
                  amount: 990,
                })
              }
            >
              <Sparkles className="h-4 w-4" />
              Подключить Standard
            </Button>
          )}
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
        />
      )}
    </>
  );
}
