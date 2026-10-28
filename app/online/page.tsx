import type { Metadata } from "next";
import Link from "next/link";
import { Clock, Headphones, Video } from "lucide-react";
import Faq from "@/components/landing/Faq";
import PublicShell from "@/components/landing/PublicShell";
import TrialCard from "@/components/landing/TrialCard";
import JsonLd from "@/components/seo/JsonLd";
import {
  FAQ_ONLINE,
  PUBLIC_PATHS,
  TRIAL_LESSON,
  formatRub,
} from "@/lib/public-site";
import {
  buildPublicMetadata,
  faqJsonLd,
  organizationJsonLd,
} from "@/lib/public-seo";

export const metadata: Metadata = buildPublicMetadata({
  title: "Уроки вокала онлайн из любого города России | Unique Vocal Studio",
  description: `Индивидуальные уроки вокала онлайн по видеосвязи для взрослых и детей, из любого города России. Пробный урок ${TRIAL_LESSON.minutes} минут — ${formatRub(TRIAL_LESSON.price)}.`,
  path: PUBLIC_PATHS.online,
});

const POINTS = [
  {
    icon: Video,
    title: "Живое занятие по видеосвязи",
    text: "Тот же индивидуальный урок с преподавателем, только из дома.",
  },
  {
    icon: Clock,
    title: "Время под ваш часовой пояс",
    text: "Согласуем удобное время, где бы вы ни жили.",
  },
  {
    icon: Headphones,
    title: "Нужны наушники и интернет",
    text: "Остальное подскажем на пробном уроке.",
  },
] as const;

export default function OnlinePage() {
  return (
    <PublicShell>
      <JsonLd data={organizationJsonLd()} />
      <JsonLd data={faqJsonLd(FAQ_ONLINE)} />

      <section className="py-12 text-center sm:py-16">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-studio-gold">
          Онлайн по всей России
        </p>
        <h1 className="mx-auto mt-3 max-w-3xl font-display text-4xl font-semibold leading-tight sm:text-6xl">
          Уроки вокала онлайн
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-studio-muted sm:text-lg">
          Занимайтесь с преподавателем из любого города — индивидуально, для
          взрослых и детей, с нуля или с опытом.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {POINTS.map(({ icon: Icon, title, text }) => (
          <article
            key={title}
            className="rounded-3xl bg-studio-surface p-6 ring-1 ring-studio-border"
          >
            <Icon className="h-6 w-6 text-studio-accent" />
            <h2 className="mt-4 font-display text-xl font-semibold">{title}</h2>
            <p className="mt-2 text-sm text-studio-muted">{text}</p>
          </article>
        ))}
      </section>

      <div className="mt-10">
        <TrialCard />
      </div>

      <Faq items={FAQ_ONLINE} />

      <p className="pb-4 text-center text-sm text-studio-muted">
        Вы в Екатеринбурге?{" "}
        <Link
          href={PUBLIC_PATHS.ekaterinburg}
          className="text-studio-accent-light underline"
        >
          Очные уроки вокала в центре города
        </Link>
      </p>
    </PublicShell>
  );
}
