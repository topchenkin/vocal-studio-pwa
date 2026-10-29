"use client";

import { useRef } from "react";
import { teacherMediaUrl, type TeacherMedia } from "@/lib/teacher-card";

/** Vertical 9:16 videos in a swipeable row; starting one pauses the others. */
export default function TeacherReels({ videos }: { videos: TeacherMedia[] }) {
  const listRef = useRef<HTMLDivElement>(null);

  if (videos.length === 0) return null;

  const pauseOthers = (playing: HTMLVideoElement) => {
    listRef.current?.querySelectorAll("video").forEach((video) => {
      if (video !== playing && !video.paused) video.pause();
    });
  };

  return (
    <div
      ref={listRef}
      className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 scrollbar-none sm:mx-0 sm:px-0 md:grid md:grid-cols-2 md:gap-4 md:overflow-visible md:pb-0"
    >
      {videos.map((video) => (
        <figure
          key={video.id}
          className="w-[62vw] max-w-[260px] shrink-0 snap-start md:w-auto md:max-w-none"
        >
          <video
            src={`${teacherMediaUrl(video.path)}#t=0.1`}
            controls
            playsInline
            preload="metadata"
            onPlay={(event) => pauseOthers(event.currentTarget)}
            className="aspect-[9/16] w-full rounded-2xl bg-black object-cover ring-1 ring-studio-border"
          />
          {video.caption ? (
            <figcaption className="mt-2 text-sm text-studio-muted">
              {video.caption}
            </figcaption>
          ) : null}
        </figure>
      ))}
    </div>
  );
}
