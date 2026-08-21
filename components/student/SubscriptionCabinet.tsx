"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CreditCard,
  Crown,
  FileText,
  Lock,
  RefreshCw,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import SbpPaymentSheet, {
  type PaymentPurpose,
} from "@/components/payment/SbpPaymentSheet";
import SubscriptionSelector from "@/components/SubscriptionSelector";
import DuoSubscriptionCard from "@/components/student/DuoSubscriptionCard";
import PaymentHistory from "@/components/student/PaymentHistory";
import { useAuth } from "@/context/AuthContext";
import { PLANS } from "@/lib/constants";
import { formatPrice, loadFromStorage, saveToStorage } from "@/lib/storage";
import type { AppSubscriptionTier } from "@/types";

const PLAN_TO_TIER: Record<string, Exclude<AppSubscriptionTier, "none">> = {
  standard: "standard",
  premium: "premium",
  vip: "vip",
  "1m": "standard",
  "3m": "premium",
  "6m": "vip",
};

const TIER_LABEL: Record<AppSubscriptionTier, string> = {
  none: "Нет активного тарифа",
  standard: "Standard",
  premium: "Premium",
  vip: "VIP",
};

const BRANDS = [
  { id: "visa" as const, label: "Visa" },
  { id: "mastercard" as const, label: "Mastercard" },
  { id: "mir" as const, label: "Мир" },
];

type CardBrand = (typeof BRANDS)[number]["id"];

type SavedCard = {
  brand: CardBrand;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
};

type BillingPrefs = {
  card: SavedCard | null;
  autopay: boolean;
  planId: string | null;
};

function billingKey(userId: string) {
  return `uvs_billing_${userId}`;
}

function emptyPrefs(): BillingPrefs {
  return { card: null, autopay: false, planId: null };
}

function planForTier(tier: AppSubscriptionTier) {
  if (tier === "none") return null;
  return PLANS.find((p) => p.id === tier) ?? null;
}

export default function SubscriptionCabinet() {
  const { user, profile, tier, refreshProfile } = useAuth();
  const [selectedId, setSelectedId] = useState(
    () => PLANS.find((p) => p.badge === "Популярный")?.id ?? PLANS[0]!.id
  );
  const [prefs, setPrefs] = useState<BillingPrefs>(emptyPrefs);
  const [brand, setBrand] = useState<CardBrand>("mir");
  const [last4, setLast4] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cardError, setCardError] = useState("");
  const [payment, setPayment] = useState<PaymentPurpose | null>(null);
  const [payNotice, setPayNotice] = useState<"ok" | "fail" | null>(null);

  useEffect(() => {
    if (!user) return;
    const stored = loadFromStorage<BillingPrefs>(
      billingKey(user.id),
      emptyPrefs()
    );
    setPrefs(stored);
    if (stored.planId && PLANS.some((p) => p.id === stored.planId)) {
      setSelectedId(stored.planId);
    } else {
      const inferred = planForTier(tier);
      if (inferred) setSelectedId(inferred.id);
    }
    if (stored.card) {
      setBrand(stored.card.brand);
      setLast4(stored.card.last4);
      setExpiry(
        `${String(stored.card.expiryMonth).padStart(2, "0")}/${String(
          stored.card.expiryYear
        ).slice(-2)}`
      );
    }
  }, [user, tier]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const pay = new URLSearchParams(window.location.search).get("pay");
    if (pay === "ok" || pay === "fail") {
      setPayNotice(pay);
      void refreshProfile();
    }
  }, [refreshProfile]);

  const persist = (next: BillingPrefs) => {
    if (!user) return;
    setPrefs(next);
    saveToStorage(billingKey(user.id), next);
  };

  const selected = useMemo(
    () => PLANS.find((p) => p.id === selectedId) ?? PLANS[0]!,
    [selectedId]
  );
  const mappedTier = PLAN_TO_TIER[selected.id] ?? "standard";
  const isCurrent =
    tier !== "none" && mappedTier === tier && prefs.planId === selected.id;
  const duoMember = profile?.app_sub_variant === "duo_member";

  const saveCard = () => {
    setCardError("");
    const digits = last4.replace(/\D/g, "").slice(-4);
    const match = expiry.trim().match(/^(\d{2})\s*\/\s*(\d{2})$/);
    if (digits.length !== 4) {
      setCardError("Введите последние 4 цифры карты.");
      return;
    }
    if (!match) {
      setCardError("Срок — в формате ММ/ГГ.");
      return;
    }
    const month = Number(match[1]);
    const year = 2000 + Number(match[2]);
    if (month < 1 || month > 12) {
      setCardError("Месяц должен быть от 01 до 12.");
      return;
    }
    persist({
      ...prefs,
      card: { brand, last4: digits, expiryMonth: month, expiryYear: year },
    });
  };

  const checkout = () => {
    if (duoMember) return;
    persist({ ...prefs, planId: selected.id });
    setPayment({
      type: "subscription",
      tier: mappedTier,
      amount: selected.price,
    });
  };

  if (!profile) return null;

  const currentPlan = planForTier(tier);
  const storedPlan = PLANS.find((p) => p.id === prefs.planId) ?? currentPlan;

  return (
    <>
      <div className="space-y-8">
        {payNotice === "ok" && (
          <p className="rounded-2xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300 ring-1 ring-emerald-500/30">
            Платёж принят. Если тариф ещё не обновился, обновите страницу через несколько секунд.
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
              <p className="mt-2 text-sm text-studio-muted">
                {storedPlan
                  ? `${storedPlan.duration} · ${formatPrice(storedPlan.price)} ₽`
                  : "Выберите срок абонемента ниже"}
              </p>
            </div>
            <Badge variant={tier === "vip" ? "gold" : tier === "none" ? "muted" : "default"}>
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
                  Погасите задолженность целиком через СБП.
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

        <section className="space-y-4">
          <div>
            <h3 className="font-display text-xl font-semibold">Сменить план</h3>
            <p className="mt-1 text-sm text-studio-muted">
              Срок тарифа — 1 месяц. Оплата через СБП на странице Робокассы.
            </p>
          </div>
          <SubscriptionSelector
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          {duoMember ? (
            <p className="text-sm text-studio-muted">
              Тариф Duo меняет владелец подписки. Напишите в чат студии, если
              нужен другой план.
            </p>
          ) : (
            <Button fullWidth size="lg" onClick={checkout}>
              {isCurrent ? "Продлить" : "Оформить"} ·{" "}
              {formatPrice(selected.price)} ₽
            </Button>
          )}
        </section>

        <section className="rounded-3xl bg-studio-surface p-5 ring-1 ring-studio-border sm:p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-studio-gold/15 ring-1 ring-studio-gold/30">
              <CreditCard className="h-5 w-5 text-studio-gold" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-xl font-semibold">
                Способ оплаты
              </h3>
              <p className="mt-1 text-sm text-studio-muted">
                Карта в приложении не нужна: ученик платит СБП на странице
                Робокассы и возвращается в кабинет.
              </p>
            </div>
          </div>

          {prefs.card ? (
            <div className="mt-5 overflow-hidden rounded-2xl bg-gradient-to-br from-[#1a1524] to-[#2a2438] p-5 ring-1 ring-studio-gold/20">
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-studio-gold">
                <span>
                  {BRANDS.find((item) => item.id === prefs.card?.brand)?.label}
                </span>
                <Lock className="h-3.5 w-3.5" />
              </div>
              <p className="mt-8 font-display text-2xl tracking-[0.28em] text-studio-text">
                •••• {prefs.card.last4}
              </p>
              <p className="mt-4 text-xs text-studio-muted">
                Срок {String(prefs.card.expiryMonth).padStart(2, "0")}/
                {String(prefs.card.expiryYear).slice(-2)}
              </p>
            </div>
          ) : (
            <p className="mt-5 text-sm text-studio-muted">
              Карта ещё не привязана.
            </p>
          )}

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <label className="block sm:col-span-1">
              <span className="mb-1.5 block text-[11px] uppercase tracking-wider text-studio-muted">
                Бренд
              </span>
              <select
                value={brand}
                onChange={(event) => setBrand(event.target.value as CardBrand)}
                className="w-full rounded-xl bg-studio-bg px-3 py-2.5 text-sm ring-1 ring-studio-border focus:outline-none focus:ring-studio-gold/50"
              >
                {BRANDS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] uppercase tracking-wider text-studio-muted">
                Последние 4
              </span>
              <input
                inputMode="numeric"
                maxLength={4}
                value={last4}
                onChange={(event) =>
                  setLast4(event.target.value.replace(/\D/g, "").slice(0, 4))
                }
                placeholder="4242"
                className="w-full rounded-xl bg-studio-bg px-3 py-2.5 text-sm tabular-nums ring-1 ring-studio-border focus:outline-none focus:ring-studio-gold/50"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] uppercase tracking-wider text-studio-muted">
                Срок ММ/ГГ
              </span>
              <input
                value={expiry}
                onChange={(event) => setExpiry(event.target.value)}
                placeholder="12/28"
                className="w-full rounded-xl bg-studio-bg px-3 py-2.5 text-sm tabular-nums ring-1 ring-studio-border focus:outline-none focus:ring-studio-gold/50"
              />
            </label>
          </div>
          {cardError && (
            <p className="mt-3 text-sm text-red-400">{cardError}</p>
          )}
          <Button className="mt-4" variant="secondary" onClick={saveCard}>
            Сохранить карту в кабинете
          </Button>

          <div className="mt-6 flex items-center justify-between gap-4 rounded-2xl bg-studio-bg/50 px-4 py-3 ring-1 ring-studio-border">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium">
                <RefreshCw className="h-4 w-4 text-studio-gold" />
                Автопродление
              </p>
              <p className="mt-0.5 text-xs text-studio-muted">
                Списывать выбранный план по истечении срока
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={prefs.autopay}
              onClick={() => persist({ ...prefs, autopay: !prefs.autopay })}
              className={`relative h-7 w-12 shrink-0 rounded-full transition ${
                prefs.autopay ? "bg-studio-gold" : "bg-studio-border"
              }`}
            >
              <span
                className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${
                  prefs.autopay ? "left-5" : "left-0.5"
                }`}
              />
            </button>
          </div>
          <p className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-studio-muted">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-studio-gold" />
            Песочница: карта сохранена только в этом кабинете (localStorage).
            Реальный эквайринг и банковский webhook ещё не подключены.
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
                Чек НПД приходит после оплаты через Робокассу. Тестовые платежи
                до включения боевого режима деньги не списывают.
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
            if (payment.type === "subscription") {
              persist({ ...prefs, planId: selected.id });
            }
            void refreshProfile();
          }}
        />
      )}
    </>
  );
}
