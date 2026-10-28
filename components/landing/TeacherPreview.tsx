"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import TeacherSlideshow from "@/components/teacher/TeacherSlideshow";
import { useLiveTeacherCard } from "@/components/teacher/useLiveTeacherCard";
import {
  TEACHER_CARD_PATH,
  bioParagraphs,
  isTeacherCardEmpty,
  teacherPhotos,
  type TeacherCard,
} from "@/lib/teacher-card";

const EXCERPT_CHARS = 280;

function excerpt(bio: string) {
  const first = bioParagraphs(bio)[0] ?? "";
  if (first.length <= EXCERPT_CHARS) return first;
  return `${first.slice(0, EXCERPT_CHARS).replace(/\s+\S*$/, "")}…`;
}

/** Home teaser for /prepodavatel. Hidden until the admin fills the card. */
export default function TeacherPreview({ snapshot }: { snapshot: TeacherCard | null }) {
  const card = useLiveTeacherCard(snapshot);
  if (!card || isTeacherCardEmpty(card)) return null;

  const photos = teacherPhotos(card);
  const name = card.fullName || "Преподаватель по вокалу";

  return (
    <section className="grid gap-6 rounded-3xl bg-studio-card/60 p-4 ring-1 ring-studio-border sm:p-8 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:items-center">
      {photos.length > 0 ? (
        <TeacherSlideshow photos={photos} alt={name} className="aspect-[4/5] w-full" />
      ) : null}
      <div className={photos.length > 0 ? "" : "md:col-span-2"}>
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-studio-accent">
          Ваш преподаватель
        </p>
        <h2 className="mt-3 font-display text-3xl font-semibold sm:text-4xl">{name}</h2>
        {card.headline ? (
          <p className="mt-2 text-studio-accent-light">{card.headline}</p>
        ) : null}
        {card.bio ? (
          <p className="mt-4 leading-relaxed text-studio-muted">{excerpt(card.bio)}</p>
        ) : null}
        <Link
          href={TEACHER_CARD_PATH}
          className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-studio-surface px-5 text-sm font-semibold ring-1 ring-studio-border transition hover:ring-studio-accent/40 sm:w-auto"
        >
          Подробнее: достижения, видео, музыка
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
