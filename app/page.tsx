import type { Metadata } from "next";
import LandingPage from "@/components/landing/LandingPage";
import JsonLd from "@/components/seo/JsonLd";
import { FAQ_HOME, TRIAL_LESSON, formatRub } from "@/lib/public-site";
import {
  buildPublicMetadata,
  faqJsonLd,
  organizationJsonLd,
} from "@/lib/public-seo";

export const metadata: Metadata = buildPublicMetadata({
  title: "Уроки вокала в Екатеринбурге и онлайн | Unique Vocal Studio",
  description: `Индивидуальные уроки вокала для взрослых и детей: очно в центре Екатеринбурга и онлайн по всей России. Пробный урок ${TRIAL_LESSON.minutes} минут — ${formatRub(TRIAL_LESSON.price)}.`,
  path: "/",
});

/** Landing is rendered into the static HTML for search bots; logged-in users are redirected client-side. */
export default function Home() {
  return (
    <>
      <JsonLd data={organizationJsonLd()} />
      <JsonLd data={faqJsonLd(FAQ_HOME)} />
      <LandingPage />
    </>
  );
}
