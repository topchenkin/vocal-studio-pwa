"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { teacherMediaUrl, type TeacherMedia } from "@/lib/teacher-card";

const SWIPE_PX = 40;

export default function TeacherSlideshow({
  photos,
  alt,
  className,
  intervalMs = 5000,
}: {
  photos: TeacherMedia[];
  alt: string;
  className?: string;
  intervalMs?: number;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const startX = useRef<number | null>(null);
  const count = photos.length;
  const current = count ? index % count : 0;

  useEffect(() => {
    if (count < 2 || paused) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        setIndex((value) => (value + 1) % count);
      }
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [count, intervalMs, paused]);

  if (count === 0) return null;

  const go = (delta: number) => {
    setPaused(true);
    setIndex((value) => (value + delta + count) % count);
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl bg-studio-surface ring-1 ring-studio-border",
        className
      )}
      onPointerDown={(event) => {
        startX.current = event.clientX;
      }}
      onPointerUp={(event) => {
        if (startX.current == null) return;
        const dx = event.clientX - startX.current;
        startX.current = null;
        if (Math.abs(dx) >= SWIPE_PX) go(dx < 0 ? 1 : -1);
      }}
      role="region"
      aria-roledescription="слайд-шоу"
      aria-label={alt}
    >
      {photos.map((photo, photoIndex) => (
        <img
          key={photo.id}
          src={teacherMediaUrl(photo.path)}
          alt={photo.caption || alt}
          draggable={false}
          loading={photoIndex === 0 ? "eager" : "lazy"}
          decoding="async"
          className={cn(
            "absolute inset-0 h-full w-full select-none object-cover transition-opacity duration-700",
            photoIndex === current ? "opacity-100" : "opacity-0"
          )}
        />
      ))}

      {photos[current]?.caption ? (
        <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-4 pb-12 pt-10 text-sm text-white">
          {photos[current].caption}
        </p>
      ) : null}

      {count > 1 ? (
        <>
          <button
            type="button"
            onClick={() => go(-1)}
            className="absolute left-2 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60 sm:flex"
            aria-label="Предыдущее фото"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            className="absolute right-2 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60 sm:flex"
            aria-label="Следующее фото"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute inset-x-0 bottom-1 flex justify-center">
            {photos.map((photo, dotIndex) => (
              <button
                key={photo.id}
                type="button"
                onClick={() => {
                  setPaused(true);
                  setIndex(dotIndex);
                }}
                className="flex h-10 w-6 items-center justify-center"
                aria-label={`Фото ${dotIndex + 1} из ${count}`}
                aria-current={dotIndex === current}
              >
                <span
                  className={cn(
                    "h-2 rounded-full bg-white transition-all",
                    dotIndex === current ? "w-4 opacity-100" : "w-2 opacity-50"
                  )}
                />
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
