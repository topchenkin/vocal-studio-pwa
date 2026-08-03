"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Volume2 } from "lucide-react";

export default function ExerciseAudioPlayer({
  src,
  title,
}: {
  src: string;
  title: string;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(120);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    if (!playing || src) return;
    const timer = window.setInterval(
      () =>
        setProgress((current) =>
          current >= duration ? 0 : current + 0.25 * speed
        ),
      250
    );
    return () => window.clearInterval(timer);
  }, [duration, playing, speed, src]);

  const toggle = async () => {
    if (!src) {
      setPlaying((current) => !current);
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      await audio.play();
      setPlaying(true);
    } else {
      audio.pause();
      setPlaying(false);
    }
  };

  const seek = (value: number) => {
    setProgress(value);
    if (audioRef.current && src) audioRef.current.currentTime = value;
  };

  const changeSpeed = (value: number) => {
    setSpeed(value);
    if (audioRef.current) audioRef.current.playbackRate = value;
  };

  const formatTime = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
      .toString()
      .padStart(2, "0")}`;

  return (
    <div className="rounded-2xl bg-studio-card p-4 ring-1 ring-studio-border">
      {src && (
        <audio
          ref={audioRef}
          src={src}
          preload="metadata"
          onTimeUpdate={(event) => setProgress(event.currentTarget.currentTime)}
          onLoadedMetadata={(event) =>
            setDuration(event.currentTarget.duration || 120)
          }
          onEnded={() => setPlaying(false)}
        />
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void toggle()}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-studio-accent text-white shadow-glow"
          aria-label={playing ? "Пауза" : "Воспроизвести"}
        >
          {playing ? (
            <Pause className="h-5 w-5" />
          ) : (
            <Play className="h-5 w-5 translate-x-0.5" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{title}</p>
          <input
            type="range"
            min={0}
            max={duration}
            step={0.1}
            value={Math.min(progress, duration)}
            onChange={(event) => seek(Number(event.target.value))}
            className="mt-2 h-1.5 w-full cursor-pointer accent-purple-500"
            aria-label="Позиция аудио"
          />
          <div className="mt-1 flex justify-between text-[10px] text-studio-muted">
            <span>{formatTime(progress)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-studio-border/60 pt-3">
        <Volume2 className="h-4 w-4 text-studio-muted" />
        <button
          type="button"
          onClick={() => seek(0)}
          className="rounded-lg p-1.5 text-studio-muted hover:bg-studio-surface hover:text-white"
          aria-label="В начало"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
        <div className="ml-auto flex gap-1">
          {[0.75, 1, 1.25, 1.5].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => changeSpeed(value)}
              className={`rounded-lg px-2 py-1 text-xs transition ${
                speed === value
                  ? "bg-studio-accent/20 text-studio-accent-light"
                  : "text-studio-muted hover:text-white"
              }`}
            >
              {value}×
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
