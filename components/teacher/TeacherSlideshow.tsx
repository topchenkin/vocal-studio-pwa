"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { teacherMediaUrl, type TeacherMedia } from "@/lib/teacher-card";

const SWIPE_PX = 40;
/** Native video controls live in the bottom strip; swipes there are scrubbing, not paging. */
const VIDEO_CONTROLS_PX = 72;

export default function TeacherSlideshow({
  items,
  alt,
  className,
  intervalMs = 5000,
  autoplayMuted = false,
}: {
  items: TeacherMedia[];
  alt: string;
  className?: string;
  intervalMs?: number;
  /** Home preview: play the current clip with no sound. The teacher page keeps manual controls. */
  autoplayMuted?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const startX = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const count = items.length;
  const current = count ? index % count : 0;
  const onVideo = items[current]?.kind === "video";

  useEffect(() => {
    if (count < 2 || paused || (onVideo && !autoplayMuted)) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        setIndex((value) => (value + 1) % count);
      }
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [count, intervalMs, paused, onVideo, autoplayMuted]);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    rootRef.current?.querySelectorAll("video").forEach((video) => {
      const active = video.dataset.slide === String(current);
      if (!active) {
        if (!video.paused) video.pause();
        return;
      }
      if (!autoplayMuted || reduce) return;
      video.muted = true;
      void video.play().catch(() => undefined);
    });
  }, [current, autoplayMuted]);

  if (count === 0) return null;

  const go = (delta: number) => {
    setPaused(true);
    setIndex((value) => (value + delta + count) % count);
  };

  const caption = items[current]?.caption;

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative overflow-hidden rounded-3xl bg-studio-surface ring-1 ring-studio-border",
        className
      )}
      onPointerDown={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        startX.current =
          onVideo && event.clientY > rect.bottom - VIDEO_CONTROLS_PX ? null : event.clientX;
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
      {items.map((item, itemIndex) => {
        const active = itemIndex === current;
        const layer = cn(
          "absolute inset-0 h-full w-full select-none transition-opacity duration-700",
          active ? "opacity-100" : "pointer-events-none opacity-0"
        );
        return item.kind === "video" ? (
          <video
            key={item.id}
            data-slide={itemIndex}
            src={`${teacherMediaUrl(item.path)}#t=0.1`}
            controls={!autoplayMuted}
            muted={autoplayMuted}
            autoPlay={autoplayMuted && active}
            loop={autoplayMuted}
            playsInline
            preload={active ? "metadata" : "none"}
            aria-label={item.caption || alt}
            className={cn(layer, "bg-black object-contain")}
          />
        ) : (
          <img
            key={item.id}
            src={teacherMediaUrl(item.path)}
            alt={item.caption || alt}
            draggable={false}
            loading={itemIndex === 0 ? "eager" : "lazy"}
            decoding="async"
            className={cn(layer, "object-cover")}
          />
        );
      })}

      {caption ? (
        <p
          className={cn(
            "pointer-events-none absolute inset-x-0 px-4 text-sm text-white",
            onVideo
              ? "top-0 bg-gradient-to-b from-black/75 to-transparent pb-10 pt-10"
              : "bottom-0 bg-gradient-to-t from-black/75 to-transparent pb-12 pt-10"
          )}
        >
          {caption}
        </p>
      ) : null}

      {count > 1 ? (
        <>
          <button
            type="button"
            onClick={() => go(-1)}
            className="absolute left-2 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60 sm:flex"
            aria-label="Предыдущий слайд"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            className="absolute right-2 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60 sm:flex"
            aria-label="Следующий слайд"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div
            className={cn(
              "absolute inset-x-0 flex justify-center",
              onVideo ? "top-1" : "bottom-1"
            )}
          >
            {items.map((item, dotIndex) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setPaused(true);
                  setIndex(dotIndex);
                }}
                className="flex h-10 w-6 items-center justify-center"
                aria-label={`${item.kind === "video" ? "Видео" : "Фото"} ${dotIndex + 1} из ${count}`}
                aria-current={dotIndex === current}
              >
                <span
                  className={cn(
                    "h-2 rounded-full bg-white shadow transition-all",
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
