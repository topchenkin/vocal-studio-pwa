"use client";

import { useCallback, useEffect, useState } from "react";
import { Link2, UsersRound } from "lucide-react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import SbpPaymentSheet, {
  type PaymentPurpose,
} from "@/components/payment/SbpPaymentSheet";
import { useAuth } from "@/context/AuthContext";
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
}> = [
  { tier: "standard", title: "Standard Duo", price: 1490 },
  { tier: "premium", title: "Premium Duo", price: 2990 },
  { tier: "vip", title: "VIP Duo", price: 5990 },
];

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
                ? `${duo?.tier ?? profile.app_sub_tier} Duo`
                : isMember
                  ? "Вы подключены к Duo"
                  : "Подписка Duo"}
            </p>
            <p className="mt-1 text-xs text-studio-muted">
              {isOwner && duo?.status === "active"
                ? "Друг подключён. Сменить его может только администратор."
                : isOwner
                  ? "Подключите один аккаунт друга по email."
                  : isMember
                    ? "У вас общий доступ к платформе, но личные уроки, Котик и баланс."
                    : "Одна оплата — два аккаунта. Уроки и прогресс остаются личными."}
            </p>
          </div>
        </div>

        {!isOwner && !isMember && (
          <Button
            className="mt-4"
            fullWidth
            variant="secondary"
            onClick={() => setPlansOpen(true)}
          >
            Выбрать Duo
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
        size="sm"
      >
        <div className="space-y-2">
          {duoPlans.map((plan) => (
            <button
              key={plan.tier}
              type="button"
              onClick={() => {
                setPlansOpen(false);
                setPayment({
                  type: "duo_subscription",
                  tier: plan.tier,
                  amount: plan.price,
                });
              }}
              className="flex w-full items-center justify-between rounded-xl bg-studio-surface p-4 text-left ring-1 ring-studio-border transition hover:ring-studio-accent"
            >
              <span>
                <span className="block font-medium">{plan.title}</span>
                <span className="text-xs text-studio-muted">
                  Доступ платформы для двух аккаунтов
                </span>
              </span>
              <span className="font-semibold">{plan.price.toLocaleString("ru-RU")} ₽</span>
            </button>
          ))}
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
