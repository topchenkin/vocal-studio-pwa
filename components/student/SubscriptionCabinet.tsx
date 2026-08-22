"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Crown, FileText, WalletCards } from "lucide-react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import SbpPaymentSheet, {
  type PaymentPurpose,
  type SubscriptionMonths,
} from "@/components/payment/SbpPaymentSheet";
import SubscriptionSelector from "@/components/SubscriptionSelector";
import DuoSubscriptionCard from "@/components/student/DuoSubscriptionCard";
import PaymentHistory from "@/components/student/PaymentHistory";
import { useAuth } from "@/context/AuthContext";
import {
  APP_TIER_PRICES,
  PLANS,
  SUBSCRIPTION_MONTH_OPTIONS,
  TIER_RANK,
  subscriptionTotal,
  type SubscriptionMonthOption,
} from "@/lib/constants";
import { formatPrice } from "@/lib/storage";
import type { AppSubscriptionTier } from "@/types";

const TIER_LABEL: Record<AppSubscriptionTier, string> = {
  none: "Нет активного тарифа",
  standard: "Standard",
  premium: "Premium",
  vip: "VIP",
};

function formatExpiry(iso: string | null | undefined) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function isSubscriptionActive(
  tier: AppSubscriptionTier,
  expiresAt: string | null | undefined
) {
  if (tier === "none") return false;
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() > Date.now();
}

export default function SubscriptionCabinet() {
  const { profile, tier, refreshProfile } = useAuth();
  const [selectedId, setSelectedId] = useState(
    () => PLANS.find((p) => p.badge === "Популярный")?.id ?? PLANS[0]!.id
  );
  const [months, setMonths] = useState<SubscriptionMonthOption>(3);
  const [payment, setPayment] = useState<PaymentPurpose | null>(null);
  const [payNotice, setPayNotice] = useState<"ok" | "fail" | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const fromQuery = new URLSearchParams(window.location.search).get("pay");
    const fromReturn = sessionStorage.getItem("uvs_pay_notice");
    if (fromReturn === "ok" || fromReturn === "fail") {
      sessionStorage.removeItem("uvs_pay_notice");
    }
    const pay =
      fromQuery === "ok" || fromQuery === "fail"
        ? fromQuery
        : fromReturn === "ok" || fromReturn === "fail"
          ? fromReturn
          : null;
    if (pay) {
      setPayNotice(pay);
      void refreshProfile();
    }
  }, [refreshProfile]);

  useEffect(() => {
    if (!profile) return;
    if (tier !== "none" && PLANS.some((p) => p.id === tier)) {
      setSelectedId(tier);
    }
  }, [profile, tier]);

  const selected = useMemo(
    () => PLANS.find((p) => p.id === selectedId) ?? PLANS[0]!,
    [selectedId]
  );
  const selectedTier = selected.id as Exclude<AppSubscriptionTier, "none">;
  const duoMember = profile?.app_sub_variant === "duo_member";
  const active = isSubscriptionActive(tier, profile?.app_sub_expires_at);
  const expiryLabel = formatExpiry(profile?.app_sub_expires_at);

  const visiblePlans = useMemo(() => {
    if (!active || tier === "none") return PLANS;
    return PLANS.filter(
      (plan) =>
        TIER_RANK[plan.id as keyof typeof TIER_RANK] >= TIER_RANK[tier]
    );
  }, [active, tier]);

  useEffect(() => {
    if (!visiblePlans.some((plan) => plan.id === selectedId)) {
      setSelectedId(visiblePlans[0]?.id ?? PLANS[0]!.id);
    }
  }, [selectedId, visiblePlans]);

  const total = subscriptionTotal(selected.pricePerMonth, months);
  const isRenewal = active && selectedTier === tier;

  const checkout = () => {
    if (duoMember) return;
    setPayment({
      type: "subscription",
      tier: selectedTier,
      months: months as SubscriptionMonths,
      amount: total,
    });
  };

  if (!profile) return null;

  return (
    <>
      <div className="space-y-8">
        {payNotice === "ok" && (
          <p className="rounded-2xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300 ring-1 ring-emerald-500/30">
            Платёж принят. Если тариф ещё не обновился, обновите страницу через
            несколько секунд.
          </p>
        )}
        {payNotice === "fail" && (
          <p className="rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-300 ring-1 ring-red-500/30">
            Оплата не завершена. Можно выбрать тариф и попробовать снова.
          </p>
        )}

        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-studio-card via-studio-surface to-studio-gold/10 px-6 py-8 ring-1 ring-studio-gold/25 sm:px-8">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-studio-gold">
            Текущий план
          </p>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
            <div>
              <h2 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
                {TIER_LABEL[tier]}
              </h2>
              <p className="mt-2 flex items-center gap-2 text-sm text-studio-muted">
                <CalendarDays className="h-4 w-4 text-studio-gold" />
                {active && expiryLabel
                  ? `Действует до ${expiryLabel}`
                  : active
                    ? "Срок не указан — продлите подписку ниже"
                    : expiryLabel
                      ? `Истекла ${expiryLabel}`
                      : "Подписка не оформлена"}
              </p>
              {active && (
                <p className="mt-1 text-xs text-studio-muted">
                  {formatPrice(APP_TIER_PRICES[tier as keyof typeof APP_TIER_PRICES] ?? 0)}{" "}
                  ₽ / мес · без автопродления
                </p>
              )}
            </div>
            <Badge
              variant={
                tier === "vip" ? "gold" : tier === "none" ? "muted" : "default"
              }
            >
              <Crown className="mr-1 h-3 w-3" />
              {profile.app_sub_variant === "individual" ? "Individual" : "Duo"}
            </Badge>
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-studio-bg/40 px-5 py-4 ring-1 ring-studio-border/80">
              <p className="text-xs text-studio-muted">Остаток уроков</p>
              <p className="mt-1 font-display text-3xl font-semibold">
                {profile.lessons_balance}
              </p>
            </div>
            <div className="rounded-2xl bg-studio-bg/40 px-5 py-4 ring-1 ring-studio-border/80">
              <p className="text-xs text-studio-muted">Оплата занятий</p>
              <p className="mt-1 text-sm font-medium">
                {profile.lesson_pay_type === "abonement"
                  ? "Абонемент"
                  : "Разовая"}
              </p>
              <p className="mt-1 text-xs text-studio-gold">
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
        </section>

        {profile.debt_amount > 0 && (
          <section className="rounded-3xl bg-red-500/10 p-5 ring-1 ring-red-500/30">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/15">
                <WalletCards className="h-5 w-5 text-red-400" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-red-300">
                  Неоплаченный урок:{" "}
                  {profile.debt_amount.toLocaleString("ru-RU")} ₽
                </p>
                <p className="mt-1 text-xs text-red-300/70">
                  Погасите задолженность целиком через СБП / ЮKassa.
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
              Оплатить задолженность
            </Button>
          </section>
        )}

        {profile.lesson_pay_type === "abonement" &&
          profile.custom_abonement_price > 0 && (
            <section className="rounded-3xl bg-studio-surface p-5 ring-1 ring-studio-border">
              <p className="font-medium">Абонемент на занятия</p>
              <p className="mt-1 text-sm text-studio-muted">
                Оплата пакета уроков через ЮKassa (СБП). После оплаты баланс
                уроков пополнится.
              </p>
              <Button
                className="mt-4"
                fullWidth
                variant="secondary"
                onClick={() =>
                  setPayment({
                    type: "abonement",
                    amount: profile.custom_abonement_price,
                    lessonsCount: 8,
                  })
                }
              >
                Оплатить абонемент ·{" "}
                {profile.custom_abonement_price.toLocaleString("ru-RU")} ₽
              </Button>
            </section>
          )}

        <section className="space-y-4">
          <div>
            <h3 className="font-display text-xl font-semibold">
              {active ? "Продление и апгрейд" : "Оформить подписку"}
            </h3>
            <p className="mt-1 text-sm text-studio-muted">
              {active
                ? "Можно продлить текущий тариф или перейти на более высокий. Понижение недоступно. Оплата 1 / 3 / 6 / 12 месяцев сразу, без автопродления."
                : "Выберите тариф и срок 1, 3, 6 или 12 месяцев. Оплата через СБП на странице ЮKassa."}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {SUBSCRIPTION_MONTH_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setMonths(option)}
                className={`rounded-xl px-4 py-2.5 text-sm ring-1 transition ${
                  months === option
                    ? "bg-studio-gold/15 text-studio-gold ring-studio-gold/50"
                    : "bg-studio-surface text-studio-muted ring-studio-border hover:ring-studio-gold/30"
                }`}
              >
                {option} мес.
              </button>
            ))}
          </div>

          <SubscriptionSelector
            selectedId={selectedId}
            onSelect={setSelectedId}
            plans={visiblePlans}
          />

          {duoMember ? (
            <p className="text-sm text-studio-muted">
              Тариф Duo меняет владелец подписки. Напишите в чат студии, если
              нужен другой план.
            </p>
          ) : (
            <Button fullWidth size="lg" onClick={checkout}>
              {isRenewal ? "Продлить" : active ? "Апгрейд" : "Оформить"} ·{" "}
              {formatPrice(total)} ₽
              <span className="ml-1 text-sm font-normal opacity-80">
                ({months} мес.)
              </span>
            </Button>
          )}

          <button
            type="button"
            onClick={() => setPayment({ type: "test_payment", amount: 1 })}
            className="w-full rounded-xl px-4 py-3 text-sm text-studio-muted ring-1 ring-studio-border transition hover:bg-studio-surface hover:text-studio-text hover:ring-studio-gold/30"
          >
            Тестовая оплата · 1 ₽
          </button>
          <p className="text-center text-xs text-studio-muted">
            Реальная оплата через ЮKassa (СБП) для проверки. Тариф и срок не
            меняются.
          </p>
        </section>

        <DuoSubscriptionCard profile={profile} />

        <PaymentHistory limit={12} showEmpty />

        <section className="rounded-3xl bg-studio-card/60 px-5 py-5 ring-1 ring-studio-border">
          <div className="flex items-start gap-3">
            <FileText className="mt-0.5 h-5 w-5 text-studio-gold" />
            <div>
              <p className="text-sm font-medium">Документы и поддержка</p>
              <p className="mt-1 text-sm leading-relaxed text-studio-muted">
                Чек приходит после оплаты через ЮKassa. Карты в кабинете не
                сохраняем, автосписаний нет — за 3 дня до конца срока придёт
                напоминание.
              </p>
            </div>
          </div>
        </section>
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
