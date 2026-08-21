import type { ReactNode } from "react";
import Link from "next/link";
import { LEGAL } from "@/lib/legal";

const links = [
  { href: LEGAL.uslugiPath, label: "Услуги и цены" },
  { href: LEGAL.offerPath, label: "Оферта и возврат" },
  { href: LEGAL.privacyPath, label: "Конфиденциальность" },
  { href: LEGAL.contactsPath, label: "Контакты и реквизиты" },
] as const;

export default function SiteFooter({ extra }: { extra?: ReactNode }) {
  return (
    <footer className="mt-10 border-t border-studio-border/60 pt-6 text-xs text-studio-muted">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <p>
            ©{" "}
            <span className="text-studio-gold">Unique</span>{" "}
            <span className="text-studio-accent">Vocal</span>{" "}
            <span className="text-gradient">Studio</span>
          </p>
          <p>
            {LEGAL.fullName} · самозанятый · ИНН {LEGAL.inn} · {LEGAL.city}
          </p>
          <p>
            <a className="hover:text-studio-text" href={LEGAL.phoneHref}>
              {LEGAL.phone}
            </a>
            {" · "}
            <a className="hover:text-studio-text" href={`mailto:${LEGAL.email}`}>
              {LEGAL.email}
            </a>
          </p>
        </div>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {links.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="transition hover:text-studio-accent-light"
            >
              {item.label}
            </Link>
          ))}
          {extra}
        </nav>
      </div>
    </footer>
  );
}
