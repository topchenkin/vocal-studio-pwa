"use client";

import { Award } from "lucide-react";
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

  const media = [...teacherPhotos(card), ...teacherVideos(card)];
  const paragraphs = bioParagraphs(card.bio);
  const hasMusic = card.musicLinks.some((link) => parseYandexMusicEmbed(link));
  const name = card.fullName || FALLBACK_NAME;

  const hasAchievements = card.achievements.length > 0;
  const hasLeft = media.length > 0 || hasMusic || hasAchievements;

  // Phone: photo, name, music, achievements, bio (flat grid, `order`).
  // Desktop: the left column holds photo, music and achievements next to the text column.
  return (
    <section
      className={
        hasLeft
          ? "grid gap-6 py-10 sm:py-14 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:items-start md:gap-8 lg:gap-x-12"
          : "py-10 sm:py-14"
      }
    >
      {hasLeft ? (
        <div className="contents md:block md:space-y-8">
          {media.length > 0 ? (
            <div className="order-1">
              <TeacherSlideshow items={media} alt={name} className="aspect-[4/5] w-full" />
            </div>
          ) : null}

          {hasMusic ? (
            <div className="order-3">
              <h2 className="font-display text-2xl font-semibold sm:text-3xl">Музыка</h2>
              <div className="mt-4">
                <YandexMusicEmbeds links={card.musicLinks} />
              </div>
            </div>
          ) : null}

          {hasAchievements ? (
            <div className="order-4">
              <h2 className="font-display text-2xl font-semibold sm:text-3xl">Достижения</h2>
              <ul className="mt-4 grid gap-3">
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
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        className={
          hasLeft ? "contents md:block md:max-w-2xl" : "mx-auto max-w-2xl text-center"
        }
      >
        <div className="order-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-studio-gold">
            Преподаватель
          </p>
          <h1 className="mt-3 font-display text-4xl font-semibold leading-tight sm:text-5xl">
            {name}
          </h1>
          {card.headline ? (
            <p className="mt-3 text-lg text-studio-accent-light">{card.headline}</p>
          ) : null}
        </div>
        <div className="order-5 space-y-3 text-base leading-relaxed text-studio-muted md:mt-5">
          {paragraphs.map((paragraph) => (
            <p key={paragraph} className="whitespace-pre-line">
              {paragraph}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}
