"use client";

import { useState } from "react";
import { Bot, Check, Crown, Mic2, Sparkles } from "lucide-react";
import Header from "@/components/Header";
import AuthModal from "@/components/auth/AuthModal";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import SiteFooter from "@/components/legal/SiteFooter";
import { APP_TIER_PRICES } from "@/lib/constants";
import { formatPrice } from "@/lib/storage";
import type { AppSubscriptionTier } from "@/types";

type AuthMode = "login" | "register";

const plans: Array<{
  tier: Exclude<AppSubscriptionTier, "none">;
  title: string;
  subtitle: string;
  price: number;
  icon: typeof Bot;
  features: string[];
  highlighted?: boolean;
}> = [
  {
    tier: "standard",
    title: "Standard",
    subtitle: "Домашняя практика между уроками",
    price: APP_TIER_PRICES.standard,
    icon: Bot,
    features: ["AI-анализатор нот", "Чат платформы", "Часть упражнений"],
  },
  {
    tier: "premium",
    title: "Premium",
    subtitle: "Больше материала и внимания к деталям",
    price: APP_TIER_PRICES.premium,
    icon: Sparkles,
    features: [
      "Отзывы преподавателя",
      "AI-минусовки",
      "5 индивидуальных распевок",
    ],
    highlighted: true,
  },
  {
    tier: "vip",
    title: "VIP",
    subtitle: "Студийный формат и полный набор инструментов",
    price: APP_TIER_PRICES.vip,
    icon: Crown,
    features: ["Запись студийного трека", "Безлимитный AI-анализ", "Всё из Premium"],
  },
];

export default function LandingPage() {
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("register");

  const openAuth = (mode: AuthMode) => {
    setAuthMode(mode);
    setAuthOpen(true);
  };

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none fixed inset-0 bg-hero-glow" />
      <div className="pointer-events-none fixed -right-40 top-48 h-96 w-96 rounded-full bg-studio-accent/10 blur-3xl" />
      <div className="pointer-events-none fixed -left-40 bottom-20 h-96 w-96 rounded-full bg-blue-500/5 blur-3xl" />

      <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-5 sm:px-6">
        <Header />

        <section className="flex min-h-[72vh] flex-col items-center justify-center py-16 text-center lg:py-24">
          <div className="animate-slide-up mx-auto max-w-3xl">
            <Badge className="mb-5">
              Екатеринбург · живые уроки и кабинет в телефоне
            </Badge>
            <h1 className="font-display text-4xl font-semibold leading-[1.08] sm:text-6xl lg:text-7xl">
              Голос раскрывается, когда рядом{" "}
              <span className="text-gradient">наставник и умная практика</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-studio-muted sm:text-lg">
              Занимайтесь с преподавателем по расписанию и тренируйтесь дома в
              том же кабинете. Регистрация ничего не стоит — подписку на
              приложение подключаете только если захотите больше инструментов
              между уроками.
            </p>
            <div className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              <Button size="lg" onClick={() => openAuth("register")}>
                Создать бесплатный кабинет
              </Button>
              <Button
                size="lg"
                variant="ghost"
                className="px-6 text-studio-muted ring-1 ring-studio-border/80 hover:text-studio-text"
                onClick={() => openAuth("login")}
              >
                У меня уже есть аккаунт
              </Button>
            </div>
          </div>
        </section>

        <section className="rounded-3xl bg-gradient-to-r from-studio-accent/10 via-studio-card to-blue-500/10 p-8 text-center ring-1 ring-studio-border sm:p-12">
          <Mic2 className="mx-auto h-8 w-8 text-studio-accent" />
          <h2 className="mt-4 font-display text-3xl font-semibold">
            Начните без оплаты
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-studio-muted">
            Кабинет открывается бесплатно. Преподаватель активирует вас как
            ученика — и можно записываться на занятия. Платить за приложение не
            нужно: это отдельная возможность, не условие учёбы.
          </p>
          <Button className="mt-6" size="lg" onClick={() => openAuth("register")}>
            Зарегистрироваться
          </Button>
        </section>

        <section id="subscriptions" className="scroll-mt-10 py-16">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-studio-accent">
              По желанию
            </p>
            <h2 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">
              Когда захотите заниматься глубже и дома
            </h2>
            <p className="mt-4 text-studio-muted">
              Подписка не заменяет уроки и не обязательна. Она открывает
              анализатор нот, минусовки, распевки и другие инструменты — чтобы
              между занятиями прогресс не замирал, а копился. Цены в рублях, без
              НДС. Сами уроки вокала оплачиваются отдельно: сумма видна в
              кабинете до платежа.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {plans.map((plan) => {
              const Icon = plan.icon;
              return (
                <article
                  key={plan.tier}
                  className={`relative flex flex-col rounded-3xl p-6 ring-1 transition duration-300 hover:-translate-y-1 ${
                    plan.highlighted
                      ? "bg-gradient-to-b from-studio-accent/15 to-studio-card ring-studio-accent/50 shadow-glow"
                      : "bg-studio-surface ring-studio-border hover:ring-studio-accent/30"
                  }`}
                >
                  {plan.highlighted ? (
                    <Badge className="absolute right-5 top-5">Чаще выбирают</Badge>
                  ) : null}
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-studio-accent/10 ring-1 ring-studio-accent/25">
                    <Icon className="h-6 w-6 text-studio-accent" />
                  </div>
                  <h3 className="mt-6 font-display text-2xl font-semibold">
                    {plan.title}
                  </h3>
                  <p className="text-sm text-studio-muted">{plan.subtitle}</p>
                  <p className="mt-3 font-display text-3xl font-semibold">
                    {formatPrice(plan.price)} ₽
                    <span className="ml-1 text-sm font-normal text-studio-muted">
                      / месяц
                    </span>
                  </p>
                  <ul className="my-6 flex-1 space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex gap-2 text-sm">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Button
                    fullWidth
                    variant={plan.highlighted ? "primary" : "secondary"}
                    onClick={() => openAuth("register")}
                  >
                    Выбрать {plan.title}
                  </Button>
                </article>
              );
            })}
          </div>
        </section>

        <SiteFooter />
      </div>

      <AuthModal
        open={authOpen}
        initialMode={authMode}
        onClose={() => setAuthOpen(false)}
      />
    </main>
  );
}
