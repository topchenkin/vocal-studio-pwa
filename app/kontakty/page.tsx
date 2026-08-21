import type { Metadata } from "next";
import Link from "next/link";
import { Mail, MapPin, Phone } from "lucide-react";
import Header from "@/components/Header";
import RequisitesCard from "@/components/legal/RequisitesCard";
import SiteFooter from "@/components/legal/SiteFooter";
import { APP_NAME } from "@/lib/constants";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: `Контакты и реквизиты — ${APP_NAME}`,
  description:
    "Контакты и реквизиты Unique Vocal Studio: телефон, email, ИНН самозанятого, город Екатеринбург.",
  alternates: { canonical: LEGAL.contactsPath },
};

export default function ContactsPage() {
  return (
    <main className="relative min-h-screen overflow-hidden">
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
          <p className="mt-3 text-sm leading-relaxed text-studio-muted">
            {LEGAL.contactHours}.
          </p>

          <ul className="mt-6 space-y-3 text-sm">
            <li className="flex items-center gap-3">
              <Phone className="h-4 w-4 shrink-0 text-studio-accent" />
              <a className="hover:text-studio-accent-light" href={LEGAL.phoneHref}>
                {LEGAL.phone}
              </a>
            </li>
            <li className="flex items-center gap-3">
              <Mail className="h-4 w-4 shrink-0 text-studio-accent" />
              <a
                className="hover:text-studio-accent-light"
                href={`mailto:${LEGAL.email}`}
              >
                {LEGAL.email}
              </a>
            </li>
            <li className="flex items-center gap-3">
              <MapPin className="h-4 w-4 shrink-0 text-studio-accent" />
              <span>г. {LEGAL.city}</span>
            </li>
          </ul>

          <p className="mt-6 text-sm text-studio-muted">
            Условия, оплата и возврат — в{" "}
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
