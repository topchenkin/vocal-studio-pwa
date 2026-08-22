"use client";

import { useState } from "react";
import { Download, Share2 } from "lucide-react";
import Logo from "@/components/Logo";
import Button from "@/components/ui/Button";
import {
  downloadGiftCertificatePng,
  shareGiftCertificatePng,
} from "@/lib/gift-certificate-export";
import {
  formatGiftCode,
  giftIncludesLine,
  GIFT_ACTIVATION_STEPS,
  GIFT_KIND_LABELS,
  type GiftCertificate,
} from "@/lib/gift-certificates";

export default function GiftCertificateArt({
  cert,
}: {
  cert: GiftCertificate;
}) {
  const [busy, setBusy] = useState<"" | "download" | "share">("");
  const [hint, setHint] = useState("");

  const run = async (mode: "download" | "share") => {
    setBusy(mode);
    setHint("");
    try {
      if (mode === "download") {
        await downloadGiftCertificatePng(cert);
        setHint("Картинка сохранена");
      } else {
        const result = await shareGiftCertificatePng(cert);
        setHint(
          result === "shared"
            ? "Отправлено через «Поделиться»"
            : "Сохранено — отправьте файл из галереи"
        );
      }
    } catch (caught) {
      setHint(
        caught instanceof Error ? caught.message : "Не удалось подготовить картинку"
      );
    }
    setBusy("");
    window.setTimeout(() => setHint(""), 2600);
  };

  return (
    <div className="space-y-3">
      <article className="relative overflow-hidden rounded-[28px] bg-[#0a0a0f] px-6 py-8 text-white ring-1 ring-studio-gold/35 sm:px-8 sm:py-10">
        <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-studio-accent/20 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-16 h-56 w-56 rounded-full bg-studio-gold/10 blur-2xl" />

        <div className="relative flex flex-col items-center text-center">
          <Logo size={72} className="shadow-glow-gold" />
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.32em] text-studio-gold">
            Unique Vocal Studio
          </p>
          <p className="mt-2 text-xs uppercase tracking-[0.2em] text-studio-muted">
            Подарочный сертификат
          </p>

          <p className="mt-8 text-xs uppercase tracking-[0.18em] text-studio-muted">
            Получатель
          </p>
          <h3 className="mt-2 max-w-[16ch] font-display text-3xl font-semibold leading-tight sm:text-4xl">
            {cert.recipient_name}
          </h3>

          <div className="my-7 h-px w-24 bg-gradient-to-r from-transparent via-studio-gold/50 to-transparent" />

          <p className="text-sm font-medium text-studio-accent-light">
            {GIFT_KIND_LABELS[cert.kind]}
          </p>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-studio-muted">
            {giftIncludesLine(cert)}
          </p>

          <div className="mt-8 w-full max-w-sm rounded-2xl bg-black/40 px-5 py-4 ring-1 ring-studio-gold/30">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-studio-muted">
              Код активации
            </p>
            <p className="mt-2 font-mono text-2xl tracking-[0.16em] text-studio-gold sm:text-3xl">
              {formatGiftCode(cert.code)}
            </p>
          </div>

          <div className="mt-8 w-full max-w-md rounded-2xl bg-studio-surface/40 px-5 py-4 text-center ring-1 ring-white/10">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-studio-muted">
              Как активировать
            </p>
            <ol className="mt-3 space-y-2.5 text-sm leading-relaxed text-studio-text/90">
              {GIFT_ACTIVATION_STEPS.map((step, index) => (
                <li key={step}>
                  <span className="text-studio-gold">{index + 1}.</span> {step}
                </li>
              ))}
            </ol>
          </div>

          <p className="mt-8 text-xs text-studio-muted">uniquevocal.ru</p>
        </div>
      </article>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={busy !== ""}
          onClick={() => void run("download")}
        >
          <Download className="h-4 w-4" />
          {busy === "download" ? "Готовим…" : "Скачать PNG"}
        </Button>
        <Button
          disabled={busy !== ""}
          onClick={() => void run("share")}
        >
          <Share2 className="h-4 w-4" />
          {busy === "share" ? "Готовим…" : "Отправить"}
        </Button>
      </div>
      {hint && <p className="text-xs text-studio-muted">{hint}</p>}
    </div>
  );
}
