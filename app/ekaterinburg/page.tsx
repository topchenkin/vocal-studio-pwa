import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import Faq from "@/components/landing/Faq";
import PublicShell from "@/components/landing/PublicShell";
import TrialCard from "@/components/landing/TrialCard";
import JsonLd from "@/components/seo/JsonLd";
import {
  FAQ_EKATERINBURG,
  PUBLIC_PATHS,
  STUDIO_MAP_URL,
  STUDIO_PLACE,
  TRIAL_LESSON,
  formatRub,
} from "@/lib/public-site";
import {
  buildPublicMetadata,
  faqJsonLd,
  organizationJsonLd,
} from "@/lib/public-seo";

export const metadata: Metadata = buildPublicMetadata({
  title: "Уроки вокала в Екатеринбурге — очно в центре города | Unique Vocal Studio",
  description: `Индивидуальные уроки вокала в Екатеринбурге для взрослых и детей: ${STUDIO_PLACE.name}, ${STUDIO_PLACE.street}. Пробный урок ${TRIAL_LESSON.minutes} минут — ${formatRub(TRIAL_LESSON.price)}.`,
  path: PUBLIC_PATHS.ekaterinburg,
});

const TOPICS = [
  "Дыхание и опора звука",
  "Чистая интонация и слух",
  "Расширение диапазона",
  "Работа над репертуаром",
  "Уверенность на сцене и перед микрофоном",
] as const;

export default function EkaterinburgPage() {
  return (
    <PublicShell>
      <JsonLd data={organizationJsonLd()} />
      <JsonLd data={faqJsonLd(FAQ_EKATERINBURG)} />

      <section className="py-12 text-center sm:py-16">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-studio-gold">
          Очные занятия
        </p>
        <h1 className="mx-auto mt-3 max-w-3xl font-display text-4xl font-semibold leading-tight sm:text-6xl">
          Уроки вокала в Екатеринбурге
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-studio-muted sm:text-lg">
          Индивидуальные занятия с преподавателем для взрослых и детей — с нуля
          или с опытом. Занимаемся в центре города, в «{STUDIO_PLACE.nameIn}».
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-3xl bg-studio-surface p-6 ring-1 ring-studio-border">
          <MapPin className="h-6 w-6 text-studio-accent" />
          <h2 className="mt-4 font-display text-2xl font-semibold">
            Где мы занимаемся
          </h2>
          <p className="mt-3 text-sm leading-relaxed">
            «{STUDIO_PLACE.name}»
            <br />
            {STUDIO_PLACE.street}, {STUDIO_PLACE.city}
            <br />
            <span className="text-studio-muted">{STUDIO_PLACE.area}</span>
          </p>
          <a
            href={STUDIO_MAP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex min-h-10 items-center gap-1 text-sm text-studio-accent-light underline"
          >
            Открыть на карте <ArrowRight className="h-4 w-4" />
          </a>
        </article>
        <article className="rounded-3xl bg-studio-surface p-6 ring-1 ring-studio-border">
          <h2 className="font-display text-2xl font-semibold">
            Над чем работаем
          </h2>
          <ul className="mt-4 space-y-2 text-sm">
            {TOPICS.map((topic) => (
              <li key={topic} className="flex gap-2">
                <span className="text-emerald-400">✓</span>
                {topic}
              </li>
            ))}
          </ul>
        </article>
      </section>

      <div className="mt-10">
        <TrialCard />
      </div>

      <Faq items={FAQ_EKATERINBURG} />

      <p className="pb-4 text-center text-sm text-studio-muted">
        Живёте не в Екатеринбурге?{" "}
        <Link
          href={PUBLIC_PATHS.online}
          className="text-studio-accent-light underline"
        >
          Уроки вокала онлайн по всей России
        </Link>
      </p>
    </PublicShell>
  );
}
