"use client";

import { Play, Pause, SkipBack, SkipForward, Volume2 } from "lucide-react";
import { useState } from "react";

interface AudioPlayerProps {
  title: string;
  duration: string;
  description?: string;
}

export default function AudioPlayer({
  title,
  duration,
  description,
}: AudioPlayerProps) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(35);

  return (
    <div className="rounded-2xl bg-studio-surface p-4 ring-1 ring-studio-border">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => setPlaying(!playing)}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-studio-accent/30 to-purple-600/20 ring-1 ring-studio-accent/30 transition-all hover:shadow-glow"
        >
          {playing ? (
            <Pause className="h-5 w-5 text-studio-accent-light" />
          ) : (
            <Play className="h-5 w-5 translate-x-0.5 text-studio-accent-light" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{title}</p>
          {description && (
            <p className="mt-0.5 truncate text-xs text-studio-muted">
              {description}
            </p>
          )}

          <div className="mt-3">
            <div className="h-1.5 overflow-hidden rounded-full bg-studio-border">
              <div
                className="h-full rounded-full bg-gradient-to-r from-studio-accent to-purple-500 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-studio-muted">
              <span>1:52</span>
              <span>{duration}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-center gap-4 border-t border-studio-border/50 pt-3">
        <button type="button" className="text-studio-muted hover:text-white">
          <SkipBack className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setPlaying(!playing)}
          className="text-studio-accent hover:text-studio-accent-light"
        >
          {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </button>
        <button type="button" className="text-studio-muted hover:text-white">
          <SkipForward className="h-4 w-4" />
        </button>
        <button type="button" className="ml-auto text-studio-muted hover:text-white">
          <Volume2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
