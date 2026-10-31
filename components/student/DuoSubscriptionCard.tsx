"use client";

import { useCallback, useEffect, useState } from "react";
import { Link2, UsersRound } from "lucide-react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import SbpPaymentSheet, {
  type PaymentPurpose,
  type SubscriptionMonths,
} from "@/components/payment/SbpPaymentSheet";
import { useAuth } from "@/context/AuthContext";
import {
  APP_TIER_PRICES,
  DUO_TIER_PRICES,
  PLAN_FEATURES,
  PLAN_SUMMARIES,
  SUBSCRIPTION_MONTH_OPTIONS,
  TIER_RANK,
  duoMonthlySaving,
  duoPeriodSaving,
  formatAppTier,
  subscriptionDiscountPercent,
  subscriptionListTotal,
  subscriptionTotal,
  type SubscriptionMonthOption,
} from "@/lib/constants";
import { supabase } from "@/lib/supabase";
import type {
  AppSubscriptionTier,
  DuoSubscription,
  StudentProfile,
} from "@/types";

const duoPlans: Array<{
  tier: Exclude<AppSubscriptionTier, "none">;
  title: string;
  price: number;
  summary: string;
  features: string[];
}> = [
  {
    tier: "standard",
    title: "Standart Duo",
    price: DUO_TIER_PRICES.standard,
    summary: PLAN_SUMMARIES.standard,
    features: [...PLAN_FEATURES.standard],
  },
  {
    tier: "premium",
    title: "Premium Duo",
    price: DUO_TIER_PRICES.premium,
    summary: PLAN_SUMMARIES.premium,
    features: [...PLAN_FEATURES.premium],
  },
  {
    tier: "vip",
    title: "VIP Duo",
    price: DUO_TIER_PRICES.vip,
    summary: PLAN_SUMMARIES.vip,
    features: [...PLAN_FEATURES.vip],
  },
];

function isActive(profile: StudentProfile) {
  if (profile.app_sub_tier === "none") return false;
  if (!profile.app_sub_expires_at) return true;
  return new Date(profile.app_sub_expires_at).getTime() > Date.now();
}

function rub(value: number) {
  return `${value.toLocaleString("ru-RU")}\u00a0₽`;
}

export default function DuoSubscriptionCard({
  profile,
}: {
  profile: StudentProfile;
}) {
  const { refreshProfile } = useAuth();
  const [duo, setDuo] = useState<DuoSubscription | null>(null);
  const [plansOpen, setPlansOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [linking, setLinking] = useState(false);
  const [months, setMonths] = useState<SubscriptionMonthOption>(3);
  const [payment, setPayment] = useState<PaymentPurpose | null>(null);
  const [error, setError] = useState("");

  const loadDuo = useCallback(async () => {
    if (profile.app_sub_variant === "individual") {
      setDuo(null);
      return;
    }
    const { data } = await supabase
      .from("duo_subscriptions")
      .select("*")
      .or(`owner_id.eq.${profile.id},partner_id.eq.${profile.id}`)
      .maybeSingle();
    setDuo(data ?? null);
  }, [profile.app_sub_variant, profile.id]);

  useEffect(() => {
    void loadDuo();
  }, [loadDuo]);

  const linkFriend = async () => {
    if (!email.trim()) return;
    setLinking(true);
    setError("");
    const { error: linkError } = await supabase.rpc("link_duo_partner", {
      partner_email: email.trim(),
    });
    setLinking(false);
    if (linkError) {
      setError(
        linkError.message.includes("not found")
          ? "Аккаунт с таким email не найден"
          : linkError.message.includes("already")
            ? "Этот аккаунт уже участвует в Duo"
            : "Не удалось подключить друга. Для смены партнёра обратитесь к администратору."
      );
      return;
    }
    setLinkOpen(false);
    setEmail("");
    await Promise.all([loadDuo(), refreshProfile()]);
  };

  const isOwner = profile.app_sub_variant === "duo_owner";
  const isMember = profile.app_sub_variant === "duo_member";
  const active = isActive(profile);
  const currentDuoTier = isOwner
    ? (duo?.tier ?? profile.app_sub_tier)
    : "none";
  const currentRank =
    isOwner && active ? TIER_RANK[currentDuoTier] : TIER_RANK.none;

  return (
    <>
      <div className="rounded-2xl bg-studio-surface p-4 ring-1 ring-studio-border">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-studio-accent/15">
            <UsersRound className="h-5 w-5 text-studio-accent-light" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              {isOwner
                ? `${formatAppTier(currentDuoTier)} Duo`
                : isMember
                  ? "Вы подключены к Duo"
                  : "Duo на Standart, Premium и VIP"}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-studio-muted">
              {isMember
                ? "У вас общий доступ к платформе, но личные уроки, Котик и баланс."
                : isOwner && duo?.status === "active"
                  ? "Друг подключён. Сменить его может только администратор."
                  : isOwner
                    ? "Подключите один аккаунт друга по email."
                    : "Один человек платит — два кабинета. Для семьи, пары или друга: у каждого свои уроки, Котик и прогресс. Дешевле двух отдельных подписок примерно на четверть."}
            </p>
            {isOwner && profile.app_sub_expires_at && (
              <p className="mt-1 text-xs text-studio-gold">
                До{" "}
                {new Date(profile.app_sub_expires_at).toLocaleDateString(
                  "ru-RU"
                )}
              </p>
            )}
          </div>
        </div>

        {!isMember && (
          <ul className="mt-4 space-y-2">
            {duoPlans.map((plan) => {
              const save = duoMonthlySaving(plan.tier);
              const twoSolo = APP_TIER_PRICES[plan.tier] * 2;
              return (
                <li
                  key={plan.tier}
                  className="rounded-xl bg-studio-bg/40 px-3 py-2.5 ring-1 ring-studio-border"
                >
                  <p className="text-sm font-medium">{plan.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-studio-muted">
                    {rub(plan.price)}/мес за двоих вместо {rub(twoSolo)} ·
                    экономия {rub(save)}/мес
                  </p>
                </li>
              );
            })}
          </ul>
        )}

        {!isMember && (
          <Button
            className="mt-4"
            fullWidth
            variant="secondary"
            onClick={() => setPlansOpen(true)}
          >
            {isOwner && active ? "Продлить / апгрейд Duo" : "Выбрать Duo"}
          </Button>
        )}
        {isOwner && duo?.status !== "active" && (
          <Button className="mt-4" fullWidth onClick={() => setLinkOpen(true)}>
            <Link2 className="h-4 w-4" />
            Подключить друга
          </Button>
        )}
      </div>

      <Modal
        open={plansOpen}
        onClose={() => setPlansOpen(false)}
        title="Тарифы Duo"
        size="lg"
      >
        <p className="mb-4 text-xs leading-relaxed text-studio-muted">
          Duo есть на каждом уровне. Один платит, второго подключает по email.
          Уроки, Котик и прогресс у каждого свои — это не общий аккаунт, а два
          полноценных кабинета дешевле двух отдельных подписок.
        </p>
        <div className="mb-4 flex flex-wrap gap-2">
          {SUBSCRIPTION_MONTH_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setMonths(option)}
              className={`min-h-10 rounded-xl px-3 py-2 text-xs ring-1 transition ${
                months === option
                  ? "bg-studio-accent/15 text-studio-accent-light ring-studio-accent"
                  : "bg-studio-surface text-studio-muted ring-studio-border"
              }`}
            >
              {option} мес.
              {subscriptionDiscountPercent(option) > 0
                ? ` −${subscriptionDiscountPercent(option)}%`
                : ""}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {duoPlans.map((plan) => {
            const amount = subscriptionTotal(plan.price, months);
            const list = subscriptionListTotal(plan.price, months);
            const pct = subscriptionDiscountPercent(months);
            const save = duoPeriodSaving(plan.tier, months);
            const twoSolo =
              subscriptionTotal(APP_TIER_PRICES[plan.tier], months) * 2;
            const blocked = TIER_RANK[plan.tier] < currentRank;
            const isCurrent =
              isOwner && active && plan.tier === currentDuoTier;
            return (
              <button
                key={plan.tier}
                type="button"
                disabled={blocked}
                onClick={() => {
                  if (blocked) return;
                  setPlansOpen(false);
                  setPayment({
                    type: "duo_subscription",
                    tier: plan.tier,
                    months: months as SubscriptionMonths,
                    amount,
                  });
                }}
                className={`flex w-full items-start justify-between rounded-xl bg-studio-surface p-4 text-left ring-1 transition ${
                  blocked
                    ? "cursor-not-allowed opacity-50 ring-studio-border"
                    : "ring-studio-border hover:ring-studio-accent"
                }`}
              >
                <span className="min-w-0 pr-3">
                  <span className="block font-medium">
                    {plan.title}
                    {isCurrent ? " · ваш тариф" : ""}
                  </span>
                  <span className="mt-0.5 block text-xs text-studio-muted">
                    {plan.summary}
                  </span>
                  <span className="mt-1 block text-xs text-studio-gold">
                    {blocked
                      ? "Понижение недоступно"
                      : `Экономия ${rub(save)} против двух ${formatAppTier(plan.tier)} (${rub(twoSolo)})`}
                  </span>
                  <span className="mt-1 block text-xs text-studio-muted">
                    {rub(plan.price)}/мес · {months} мес.
                    {pct > 0 ? ` −${pct}%` : ""}
                  </span>
                  <ul className="mt-2 space-y-1 text-xs text-studio-muted">
                    {plan.features.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                    <li>
                      Один платёж — два кабинета {formatAppTier(plan.tier)}.
                      Уроки и прогресс личные
                    </li>
                  </ul>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-semibold">{rub(amount)}</span>
                  {pct > 0 ? (
                    <span className="text-xs text-studio-muted line-through">
                      {rub(list)}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </Modal>

      <Modal
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        title="Подключить друга"
        size="sm"
      >
        <div>
          <label>
            <span className="mb-1.5 block text-xs text-studio-muted">
              Email зарегистрированного аккаунта
            </span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="friend@example.com"
              className="w-full rounded-xl bg-studio-surface px-4 py-3 text-sm ring-1 ring-studio-border focus:outline-none focus:ring-studio-accent"
            />
          </label>
          <p className="mt-3 text-xs text-studio-muted">
            После подключения самостоятельная смена будет недоступна.
          </p>
          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
          <Button
            className="mt-5"
            fullWidth
            disabled={!email.trim() || linking}
            onClick={() => void linkFriend()}
          >
            {linking ? "Подключаем…" : "Подтвердить"}
          </Button>
        </div>
      </Modal>

      {payment && (
        <SbpPaymentSheet
          open
          purpose={payment}
          onClose={() => setPayment(null)}
          onSuccess={() => {
            void Promise.all([loadDuo(), refreshProfile()]);
          }}
        />
      )}
    </>
  );
}
