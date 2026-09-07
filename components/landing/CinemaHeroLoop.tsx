"use client";

import { useEffect, useState } from "react";

/**
 * Cinema loop (Киностудия): performant stills crossfade + Ken Burns.
 * Sequence: microphone → guitar → piano → gold flash.
 * Not a filmed WebM; poster (mic) paints first for LCP.
 */
const FRAMES = [
  { src: "/hero/cinema-mic.jpg", alt: "" },
  { src: "/hero/cinema-guitar.jpg", alt: "" },
  { src: "/hero/cinema-piano.jpg", alt: "" },
  { src: "/hero/cinema-flash.jpg", alt: "" },
] as const;

const HOLD_MS = [5200, 5200, 5200, 2800];

export default function CinemaHeroLoop() {
  const [index, setIndex] = useState(0);
  const [reduce, setReduce] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const applyMotion = () => setReduce(motion.matches);
    applyMotion();
    motion.addEventListener("change", applyMotion);
    const onVis = () => setVisible(document.visibilityState === "visible");
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      motion.removeEventListener("change", applyMotion);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  useEffect(() => {
    if (reduce || !visible) return;
    const wait = HOLD_MS[index] ?? 5000;
    const timer = window.setTimeout(() => {
      setIndex((current) => (current + 1) % FRAMES.length);
    }, wait);
    return () => window.clearTimeout(timer);
  }, [index, reduce, visible]);

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden="true"
      data-cinema-loop="stills"
    >
      {FRAMES.map((frame, frameIndex) => {
        const isPoster = frameIndex === 0;
        const on = reduce ? isPoster : frameIndex === index;
        return (
          <img
            key={frame.src}
            src={frame.src}
            alt=""
            decoding={isPoster ? "sync" : "async"}
            fetchPriority={isPoster ? "high" : "low"}
            loading={isPoster ? "eager" : "lazy"}
            className={`hero-cinema-still ${on ? "is-on" : ""} ${reduce ? "is-static" : ""}`}
          />
        );
      })}
      <div className="hero-cinema-shade" />
      <div className="hero-cinema-vignette" />
      <div className="hero-cinema-grain" />
    </div>
  );
}
