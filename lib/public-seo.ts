import type { Metadata } from "next";
import { APP_NAME } from "@/lib/constants";
import { LEGAL } from "@/lib/legal";
import {
  STUDIO_PLACE,
  TRIAL_LESSON,
  type FaqItem,
} from "@/lib/public-site";

const OG_IMAGE = "/hero/cinema-mic.jpg";

export function buildPublicMetadata(opts: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  return {
    title: opts.title,
    description: opts.description,
    alternates: { canonical: opts.path },
    openGraph: {
      type: "website",
      locale: "ru_RU",
      siteName: APP_NAME,
      url: opts.path,
      title: opts.title,
      description: opts.description,
      images: [{ url: OG_IMAGE, alt: APP_NAME }],
    },
    twitter: {
      card: "summary_large_image",
      title: opts.title,
      description: opts.description,
      images: [OG_IMAGE],
    },
  };
}

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "MusicSchool",
    name: APP_NAME,
    url: LEGAL.site,
    image: `${LEGAL.site}${OG_IMAGE}`,
    description:
      "Индивидуальные уроки вокала для взрослых и детей: очно в центре Екатеринбурга и онлайн по всей России.",
    address: {
      "@type": "PostalAddress",
      streetAddress: STUDIO_PLACE.street,
      addressLocality: STUDIO_PLACE.city,
      addressRegion: STUDIO_PLACE.region,
      addressCountry: "RU",
    },
    areaServed: [
      { "@type": "City", name: STUDIO_PLACE.city },
      { "@type": "Country", name: "Россия" },
    ],
    makesOffer: {
      "@type": "Offer",
      name: `Пробный урок вокала, ${TRIAL_LESSON.minutes} минут`,
      price: TRIAL_LESSON.price,
      priceCurrency: "RUB",
    },
  };
}

export function faqJsonLd(items: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}
