import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import Header from "@/components/Header";
import RequisitesCard from "@/components/legal/RequisitesCard";
import SiteFooter from "@/components/legal/SiteFooter";
import JsonLd from "@/components/seo/JsonLd";
import { APP_NAME } from "@/lib/constants";
import { LEGAL } from "@/lib/legal";
import {
  PUBLIC_PATHS,
  STUDIO_MAP_URL,
  STUDIO_PLACE,
} from "@/lib/public-site";
import { buildPublicMetadata, organizationJsonLd } from "@/lib/public-seo";

export const metadata: Metadata = buildPublicMetadata({
  title: `Контакты — студия вокала в Екатеринбурге | ${APP_NAME}`,
  description: `Unique Vocal Studio: ${STUDIO_PLACE.name}, ${STUDIO_PLACE.street}, ${STUDIO_PLACE.city}. Очные уроки в центре города и онлайн по России.`,
  path: LEGAL.contactsPath,
});

export default function ContactsPage() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <JsonLd data={organizationJsonLd()} />
      <div className="pointer-events-none fixed inset-0 bg-hero-glow" />
      <div className="relative mx-auto max-w-3xl px-4 pb-24 pt-5 sm:px-6">
        <Header />
        <article className="mt-10 rounded-3xl bg-studio-card/60 p-5 ring-1 ring-studio-border sm:p-8">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-studio-gold">
            Студия
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold sm:text-4xl">
            Контакты и реквизиты
          </h1>
          <ul className="mt-6 space-y-3 text-sm">
            <li className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-studio-accent" />
              <span>
                «{STUDIO_PLACE.name}»
                <br />
                {STUDIO_PLACE.street}, {STUDIO_PLACE.city}
                <br />
                <span className="text-studio-muted">
                  {STUDIO_PLACE.postalCode}, {STUDIO_PLACE.area}
                </span>
              </span>
            </li>
          </ul>
          <a
            href={STUDIO_MAP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex min-h-10 items-center gap-1 text-sm text-studio-accent-light underline"
          >
            Открыть на Яндекс Картах <ArrowRight className="h-4 w-4" />
          </a>

          <p className="mt-6 text-sm text-studio-muted">
            Очные занятия —{" "}
            <Link
              href={PUBLIC_PATHS.ekaterinburg}
              className="text-studio-accent-light underline"
            >
              в Екатеринбурге
            </Link>
            , онлайн —{" "}
            <Link
              href={PUBLIC_PATHS.online}
              className="text-studio-accent-light underline"
            >
              из любого города
            </Link>
            . Условия, оплата и возврат — в{" "}
            <Link href={LEGAL.offerPath} className="text-studio-accent-light underline">
              оферте
            </Link>
            . Прайс — на странице{" "}
            <Link href={LEGAL.uslugiPath} className="text-studio-accent-light underline">
              «Услуги и цены»
            </Link>
            .
          </p>

          <div className="mt-8">
            <RequisitesCard />
          </div>
        </article>
        <SiteFooter />
      </div>
    </main>
  );
}
