"use client";

import { useEffect } from "react";
import { preferIosPlayback } from "@/lib/ios-audio-session";

/**
 * Keep iPhone in media-playback mode unless a tool has the mic open.
 * Without this, a previous getUserMedia leaves the PWA ducking into the
 * earpiece for every later <audio> / Web Audio play.
 */
export default function IosAudioSession() {
  useEffect(() => {
    preferIosPlayback();
    const onVisible = () => {
      if (document.visibilityState === "visible") preferIosPlayback();
    };
    const onPageShow = () => preferIosPlayback();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", preferIosPlayback);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", preferIosPlayback);
    };
  }, []);
  return null;
}
