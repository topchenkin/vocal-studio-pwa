"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Bot, Check, Crown, MapPin, Sparkles, Video } from "lucide-react";
import Header from "@/components/Header";
import Badge from "@/components/ui/Badge";
import SiteFooter from "@/components/legal/SiteFooter";
import CinemaHeroLoop from "@/components/landing/CinemaHeroLoop";
import HeadlineStagger from "@/components/landing/HeadlineStagger";
import AuthRedirect from "@/components/landing/AuthRedirect";
import Faq from "@/components/landing/Faq";
import { AuthCta, PublicAuthProvider } from "@/components/landing/PublicAuth";
import IntroQuiz from "@/components/landing/IntroQuiz";
import TeacherPreview from "@/components/landing/TeacherPreview";
import TrialCard from "@/components/landing/TrialCard";
import type { TeacherCard } from "@/lib/teacher-card";
import { APP_TIER_PRICES } from "@/lib/constants";
import {
  FAQ_HOME,
  PUBLIC_PATHS,
  STUDIO_PLACE,
  TRIAL_LESSON,
  formatRub,
} from "@/lib/public-site";
import { formatPrice } from "@/lib/storage";
import type { AppSubscriptionTier } from "@/types";

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
    title: "Standart",
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
      "Всё из Standart",
      "Больше упражнений",
      "Обработка голоса и аккорды",
    ],
    highlighted: true,
  },
  {
    tier: "vip",
    title: "VIP",
    subtitle: "Студийный формат и полный набор инструментов",
    price: APP_TIER_PRICES.vip,
    icon: Crown,
    features: ["Запись студийного трека", "Всё из Premium"],
  },
];

const paths = [
  {
    href: PUBLIC_PATHS.ekaterinburg,
    icon: MapPin,
    title: "Я в Екатеринбурге",
    text: `Очные занятия в «${STUDIO_PLACE.nameIn}», ${STUDIO_PLACE.street}`,
  },
  {
    href: PUBLIC_PATHS.online,
    icon: Video,
    title: "Я в другом городе",
    text: "Онлайн по видеосвязи из любого города России",
  },
] as const;

export default function LandingPage({ teacher }: { teacher: TeacherCard | null }) {
  const reduce = useReducedMotion();

  return (
    <PublicAuthProvider>
      <main className="relative min-h-screen overflow-hidden">
        <div className="pointer-events-none fixed inset-0 bg-hero-glow" />
        <div className="pointer-events-none fixed -right-40 top-48 h-96 w-96 rounded-full bg-studio-accent/10 blur-3xl" />
        <div className="pointer-events-none fixed -left-40 bottom-20 h-96 w-96 rounded-full bg-blue-500/5 blur-3xl" />

        <div
          className="relative isolate min-h-[100svh] text-studio-text"
          style={{
            ["--studio-text" as string]: "255 255 255",
            ["--studio-muted" as string]: "186 186 210",
            ["--studio-surface" as string]: "18 18 26",
            ["--studio-card" as string]: "26 26 38",
            ["--studio-border" as string]: "42 42 61",
            ["--studio-accent" as string]: "192 132 252",
            ["--studio-accent-light" as string]: "233 213 255",
          }}
        >
          <CinemaHeroLoop />

          <div className="relative z-10 mx-auto max-w-6xl px-4 pb-8 pt-5 sm:px-6">
            <Header />

            <section className="flex min-h-[68vh] flex-col items-center justify-center py-14 text-center lg:py-20">
              <div className="mx-auto max-w-3xl">
                <Badge className="mb-5">
                  Екатеринбург · онлайн по всей России
                </Badge>
                <HeadlineStagger />
                <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-studio-muted sm:text-lg">
                  Индивидуальные занятия с преподавателем для взрослых и детей —
                  очно в центре Екатеринбурга и онлайн из любого города.
                  Пробный урок {TRIAL_LESSON.minutes} минут —{" "}
                  {formatRub(TRIAL_LESSON.price)}.
                </p>
                <div className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                  <AuthCta size="lg" className="cta-shimmer">
                    Записаться на пробный
                  </AuthCta>
                  <a
                    href="#quiz"
                    className="inline-flex items-center justify-center rounded-2xl bg-studio-accent/10 px-6 py-3.5 text-base font-semibold text-studio-text ring-1 ring-studio-accent/50 transition hover:bg-studio-accent/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-studio-accent"
                  >
                    Подобрать путь за 1 минуту
                  </a>
                  <AuthCta
                    mode="login"
                    size="lg"
                    variant="ghost"
                    className="px-6 text-studio-muted ring-1 ring-studio-border/80 hover:text-studio-text"
                  >
                    Войти в кабинет
                  </AuthCta>
                </div>
              </div>
            </section>
          </div>
        </div>

        <div className="relative z-10 mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <section className="grid gap-4 md:grid-cols-2">
            {paths.map(({ href, icon: Icon, title, text }) => (
              <Link
                key={href}
                href={href}
                className="group flex items-center gap-4 rounded-3xl bg-studio-surface p-6 ring-1 ring-studio-border transition hover:-translate-y-0.5 hover:ring-studio-accent/40"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-studio-accent/10 ring-1 ring-studio-accent/25">
                  <Icon className="h-6 w-6 text-studio-accent" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-2xl font-semibold">
                    {title}
                  </span>
                  <span className="mt-1 block text-sm text-studio-muted">
                    {text}
                  </span>
                </span>
                <ArrowRight className="h-5 w-5 shrink-0 text-studio-muted transition group-hover:translate-x-1 group-hover:text-studio-accent" />
              </Link>
            ))}
          </section>

          <div className="mt-10">
            <IntroQuiz id="quiz" />
          </div>

          <div className="mt-10">
            <TeacherPreview snapshot={teacher} />
          </div>

          <div className="mt-10">
            <TrialCard id="trial" />
          </div>

          <Faq items={FAQ_HOME} />

          <section id="subscriptions" className="scroll-mt-10 py-12">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-studio-accent">
                Для учеников студии
              </p>
              <h2 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">
                Кабинет между уроками
              </h2>
              <p className="mt-4 text-studio-muted">
                Кабинет открывается бесплатно, преподаватель сам ставит вас в
                расписание. Подписка не заменяет уроки и не обязательна — она открывает чат
                с преподавателем, анализатор нот, упражнения и лабораторию,
                чтобы между занятиями прогресс не замирал. Цены в рублях, без
                НДС. Сами уроки оплачиваются отдельно.
              </p>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {plans.map((plan, index) => {
                const Icon = plan.icon;
                return (
                  <motion.article
                    key={plan.tier}
                    initial={reduce ? false : { opacity: 0, y: 28 }}
                    whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.3 }}
                    transition={{
                      duration: 0.5,
                      delay: reduce ? 0 : index * 0.12,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    className={`relative flex flex-col rounded-3xl p-6 ring-1 transition duration-300 hover:-translate-y-1 ${
                      plan.highlighted
                        ? "bg-gradient-to-b from-studio-accent/15 to-studio-card ring-studio-accent/50 shadow-glow"
                        : "bg-studio-surface ring-studio-border hover:ring-studio-accent/30"
                    }`}
                  >
                    {plan.highlighted ? (
                      <Badge className="absolute right-5 top-5">
                        Чаще выбирают
                      </Badge>
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
                    <AuthCta
                      fullWidth
                      variant={plan.highlighted ? "primary" : "secondary"}
                    >
                      Выбрать {plan.title}
                    </AuthCta>
                  </motion.article>
                );
              })}
            </div>
          </section>

          <SiteFooter home />
        </div>
      </main>
      <AuthRedirect />
    </PublicAuthProvider>
  );
}
