"use client";

import { formatGiftCode, giftBenefitLine, GIFT_KIND_LABELS } from "@/lib/gift-certificates";
import type { GiftCertificate } from "@/lib/gift-certificates";

export default function GiftCertificateArt({
  cert,
}: {
  cert: GiftCertificate;
}) {
  return (
    <article className="relative overflow-hidden rounded-[28px] bg-[#120c1c] p-6 text-white ring-1 ring-studio-gold/40 sm:p-8">
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-studio-accent/20" />
      <div className="pointer-events-none absolute -bottom-16 -left-10 h-44 w-44 rounded-full bg-studio-gold/10" />
      <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-studio-gold">
        Unique Vocal Studio
      </p>
      <p className="mt-3 text-xs uppercase tracking-[0.18em] text-studio-muted">
        Подарочный сертификат
      </p>
      <h3 className="mt-2 font-display text-2xl font-semibold sm:text-3xl">
        {GIFT_KIND_LABELS[cert.kind]}
      </h3>
      <p className="mt-1 text-sm text-studio-accent-light">
        {giftBenefitLine(cert)}
      </p>
      <p className="mt-6 text-xs uppercase tracking-[0.16em] text-studio-muted">
        Получатель
      </p>
      <p className="mt-1 font-display text-3xl font-semibold leading-tight">
        {cert.recipient_name}
      </p>
      <div className="mt-6 rounded-2xl bg-black/35 px-4 py-3 ring-1 ring-white/10">
        <p className="text-[10px] uppercase tracking-[0.2em] text-studio-muted">
          Код активации
        </p>
        <p className="mt-1 font-mono text-xl tracking-[0.18em] text-studio-gold sm:text-2xl">
          {formatGiftCode(cert.code)}
        </p>
      </div>
      <div className="mt-5 flex items-end justify-between gap-3 text-xs text-studio-muted">
        <span>{Number(cert.amount_rub).toLocaleString("ru-RU")} ₽</span>
        <span>Активация: имя как на сертификате</span>
      </div>
    </article>
  );
}
