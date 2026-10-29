import type { Metadata } from "next";
import Link from "next/link";
import PublicShell from "@/components/landing/PublicShell";
import TrialCard from "@/components/landing/TrialCard";
import JsonLd from "@/components/seo/JsonLd";
import TeacherCardView from "@/components/teacher/TeacherCardView";
import { APP_NAME } from "@/lib/constants";
import { LEGAL } from "@/lib/legal";
import { PUBLIC_PATHS } from "@/lib/public-site";
import { buildPublicMetadata } from "@/lib/public-seo";
import {
  TEACHER_CARD_PATH,
  bioParagraphs,
  fetchTeacherCardSnapshot,
  teacherMediaUrl,
  teacherPhotos,
} from "@/lib/teacher-card";

export async function generateMetadata(): Promise<Metadata> {
  const card = await fetchTeacherCardSnapshot();
  const name = card?.fullName || "Преподаватель по вокалу";
  const lead = card ? bioParagraphs(card.bio)[0] ?? "" : "";
  return buildPublicMetadata({
    title: `${name} — преподаватель по вокалу | ${APP_NAME}`,
    description:
      lead.slice(0, 180) ||
      "Преподаватель по вокалу в Екатеринбурге и онлайн: достижения, видео выступлений и музыкальные релизы.",
    path: TEACHER_CARD_PATH,
  });
}

export default async function TeacherPage() {
  const card = await fetchTeacherCardSnapshot();
  const photo = card ? teacherPhotos(card)[0] : undefined;

  return (
    <PublicShell>
      {card?.fullName ? (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "Person",
            name: card.fullName,
            jobTitle: card.headline || "Преподаватель по вокалу",
            description: bioParagraphs(card.bio)[0] || undefined,
            image: photo ? teacherMediaUrl(photo.path) : undefined,
            url: `${LEGAL.site}${TEACHER_CARD_PATH}`,
            worksFor: { "@type": "MusicSchool", name: APP_NAME, url: LEGAL.site },
          }}
        />
      ) : null}

      <TeacherCardView snapshot={card} />

      <div className="mt-6">
        <TrialCard />
      </div>

      <p className="py-10 text-center text-sm text-studio-muted">
        Занятия{" "}
        <Link href={PUBLIC_PATHS.ekaterinburg} className="text-studio-accent-light underline">
          лично
        </Link>{" "}
        и{" "}
        <Link href={PUBLIC_PATHS.online} className="text-studio-accent-light underline">
          онлайн по всей России
        </Link>
      </p>
    </PublicShell>
  );
}
