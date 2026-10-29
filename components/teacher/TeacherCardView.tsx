"use client";

import { Award } from "lucide-react";
import TeacherReels from "@/components/teacher/TeacherReels";
import TeacherSlideshow from "@/components/teacher/TeacherSlideshow";
import YandexMusicEmbeds from "@/components/teacher/YandexMusicEmbeds";
import { useLiveTeacherCard } from "@/components/teacher/useLiveTeacherCard";
import {
  bioParagraphs,
  isTeacherCardEmpty,
  parseYandexMusicEmbed,
  teacherPhotos,
  teacherVideos,
  type TeacherCard,
} from "@/lib/teacher-card";

const FALLBACK_NAME = "Преподаватель по вокалу";

export default function TeacherCardView({ snapshot }: { snapshot: TeacherCard | null }) {
  const card = useLiveTeacherCard(snapshot);

  if (!card || isTeacherCardEmpty(card)) {
    return (
      <section className="py-16 text-center">
        <h1 className="font-display text-4xl font-semibold sm:text-5xl">
          {FALLBACK_NAME}
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-studio-muted">
          Скоро здесь появится рассказ о преподавателе, фото, видео и музыкальные
          релизы.
        </p>
      </section>
    );
  }

  const photos = teacherPhotos(card);
  const videos = teacherVideos(card);
  const paragraphs = bioParagraphs(card.bio);
  const hasMusic = card.musicLinks.some((link) => parseYandexMusicEmbed(link));
  const name = card.fullName || FALLBACK_NAME;

  return (
    <>
      <section className="grid gap-8 py-10 sm:py-14 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:items-start lg:gap-12">
        {photos.length > 0 ? (
          <div className="md:sticky md:top-6">
            <TeacherSlideshow
              photos={photos}
              alt={name}
              className="aspect-[4/5] w-full"
            />
          </div>
        ) : null}
        <div className={photos.length > 0 ? "max-w-2xl" : "mx-auto max-w-2xl text-center md:col-span-2"}>
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-studio-gold">
            Преподаватель
          </p>
          <h1 className="mt-3 font-display text-4xl font-semibold leading-tight sm:text-5xl">
            {name}
          </h1>
          {card.headline ? (
            <p className="mt-3 text-lg text-studio-accent-light">{card.headline}</p>
          ) : null}
          <div className="mt-5 space-y-3 text-base leading-relaxed text-studio-muted">
            {paragraphs.map((paragraph) => (
              <p key={paragraph} className="whitespace-pre-line">
                {paragraph}
              </p>
            ))}
          </div>
        </div>
      </section>

      {card.achievements.length > 0 ? (
        <section className="py-8">
          <h2 className="font-display text-3xl font-semibold">Достижения</h2>
          <ul className="mt-5 grid gap-3 md:grid-cols-2">
            {card.achievements.map((item) => (
              <li
                key={item}
                className="flex items-start gap-3 rounded-2xl bg-studio-surface p-4 text-sm ring-1 ring-studio-border"
              >
                <Award className="mt-0.5 h-5 w-5 shrink-0 text-studio-gold" />
                {item}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {videos.length > 0 ? (
        <section className="py-8">
          <h2 className="font-display text-3xl font-semibold">Видео</h2>
          <div className="mt-5">
            <TeacherReels videos={videos} />
          </div>
        </section>
      ) : null}

      {hasMusic ? (
        <section className="py-8">
          <h2 className="font-display text-3xl font-semibold">Музыка</h2>
          <div className="mt-5">
            <YandexMusicEmbeds links={card.musicLinks} />
          </div>
        </section>
      ) : null}
    </>
  );
}
