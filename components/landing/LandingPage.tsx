"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AudioLines,
  Bot,
  Check,
  Crown,
  Mic2,
  Play,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import Header from "@/components/Header";
import AuthModal from "@/components/auth/AuthModal";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import type { AppSubscriptionTier } from "@/types";

type AuthMode = "login" | "register";

const plans: Array<{
  tier: Exclude<AppSubscriptionTier, "none">;
  title: string;
  subtitle: string;
  icon: typeof Bot;
  features: string[];
  highlighted?: boolean;
}> = [
  {
    tier: "standard",
    title: "Standard",
    subtitle: "Уверенный старт",
    icon: Bot,
    features: ["AI-анализатор нот", "Чат платформы", "Часть упражнений"],
  },
  {
    tier: "premium",
    title: "Premium",
    subtitle: "Максимум прогресса",
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
    subtitle: "Для будущих звёзд",
    icon: Crown,
    features: ["Запись студийного трека", "Безлимитный AI-анализ", "Всё из Premium"],
  },
];

export default function LandingPage() {
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("register");
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

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

        <section className="grid min-h-[76vh] items-center gap-10 py-14 lg:grid-cols-[1.05fr_.95fr] lg:py-20">
          <div className="animate-slide-up">
            <Badge className="mb-5">
              <WandSparkles className="mr-1.5 h-3.5 w-3.5" />
              Вокальная IT-платформа
            </Badge>
            <h1 className="max-w-3xl font-display text-5xl font-semibold leading-[1.04] sm:text-6xl lg:text-7xl">
              Раскройте свой голос с помощью{" "}
              <span className="text-gradient">AI и профи</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-studio-muted sm:text-lg">
              Тренируйтесь между уроками, получайте точную обратную связь и
              отслеживайте прогресс в едином пространстве.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" onClick={() => openAuth("register")}>
                Зарегистрироваться
              </Button>
              <Button
                size="lg"
                variant="secondary"
                onClick={() => openAuth("login")}
              >
                Войти
              </Button>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-xl">
            <div className="absolute -inset-8 rounded-full bg-studio-accent/10 blur-3xl" />
            <div className="relative aspect-[4/5] overflow-hidden rounded-[2rem] bg-gradient-to-br from-studio-card via-[#171224] to-studio-bg ring-1 ring-studio-accent/20 shadow-glow sm:aspect-video lg:aspect-[4/5]">
              <div className="absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_20%_20%,rgba(192,132,252,.35),transparent_35%),linear-gradient(130deg,transparent_35%,rgba(255,255,255,.04)_50%,transparent_65%)]" />
              <div className="absolute inset-x-5 bottom-5 rounded-2xl bg-black/35 p-4 backdrop-blur-xl ring-1 ring-white/10">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-studio-accent/20">
                    <AudioLines className="h-6 w-6 text-studio-accent-light" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex h-8 items-end gap-1">
                      {[12, 22, 15, 28, 18, 30, 12, 24, 17, 26, 14, 20].map(
                        (height, index) => (
                          <span
                            key={index}
                            className="flex-1 rounded-full bg-gradient-to-t from-studio-accent to-studio-gold"
                            style={{ height }}
                          />
                        )
                      )}
                    </div>
                    <p className="mt-2 text-xs text-studio-muted">
                      AI анализирует чистоту интонации
                    </p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="absolute left-1/2 top-1/2 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 backdrop-blur-md ring-1 ring-white/20 transition hover:scale-105 hover:bg-studio-accent/20"
                aria-label="Воспроизвести видео"
              >
                <Play className="h-8 w-8 translate-x-0.5 text-white" />
              </button>
              <div className="absolute left-5 top-5 flex items-center gap-2 rounded-full bg-black/30 px-3 py-1.5 text-xs backdrop-blur">
                <span className="h-2 w-2 animate-pulse rounded-full bg-red-400" />
                Видео о платформе
              </div>
            </div>
          </div>
        </section>

        <section id="subscriptions" className="scroll-mt-10 py-16">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-studio-accent">
              Наши подписки
            </p>
            <h2 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">
              Выберите темп своего роста
            </h2>
            <p className="mt-4 text-studio-muted">
              Подписка открывает функции IT-платформы. Условия и стоимость
              вокальных уроков преподаватель настраивает индивидуально.
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
                  {plan.highlighted && (
                    <Badge className="absolute right-5 top-5">Популярный</Badge>
                  )}
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-studio-accent/10 ring-1 ring-studio-accent/25">
                    <Icon className="h-6 w-6 text-studio-accent" />
                  </div>
                  <h3 className="mt-6 font-display text-2xl font-semibold">
                    {plan.title}
                  </h3>
                  <p className="text-sm text-studio-muted">{plan.subtitle}</p>
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
                    onClick={() => setSelectedPlan(plan.title)}
                  >
                    Купить подписку
                  </Button>
                </article>
              );
            })}
          </div>
        </section>

        <section className="mt-8 rounded-3xl bg-gradient-to-r from-studio-accent/10 via-studio-card to-blue-500/10 p-8 text-center ring-1 ring-studio-border sm:p-12">
          <Mic2 className="mx-auto h-8 w-8 text-studio-accent" />
          <h2 className="mt-4 font-display text-3xl font-semibold">
            Ваш уникальный голос уже внутри
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-studio-muted">
            Создайте аккаунт и начните с персональной траектории развития.
          </p>
          <Button className="mt-6" size="lg" onClick={() => openAuth("register")}>
            Начать бесплатно
          </Button>
        </section>

        <footer className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-studio-border/60 pt-6 text-xs text-studio-muted sm:flex-row">
          <span>© Unique Vocal Studio</span>
          <Link
            href="/admin/login"
            className="inline-flex items-center gap-1.5 transition hover:text-studio-accent-light"
          >
            <Crown className="h-3.5 w-3.5" />
            Вход для администратора
          </Link>
        </footer>
      </div>

      <AuthModal
        open={authOpen}
        initialMode={authMode}
        onClose={() => setAuthOpen(false)}
      />

      <Modal
        open={Boolean(selectedPlan)}
        onClose={() => setSelectedPlan(null)}
        title={`Подписка ${selectedPlan ?? ""}`}
      >
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-studio-accent/10">
            <Sparkles className="h-7 w-7 text-studio-accent" />
          </div>
          <h3 className="mt-4 font-display text-2xl font-semibold">
            Оплата скоро появится
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-studio-muted">
            Эквайринг для ежемесячных подписок находится в разработке. Мы
            сообщим, когда тариф станет доступен.
          </p>
          <Button fullWidth className="mt-6" onClick={() => setSelectedPlan(null)}>
            Понятно
          </Button>
        </div>
      </Modal>
    </main>
  );
}
