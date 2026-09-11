"use client";

import { useEffect } from "react";
import {
  forceIosSpeakerRoute,
  preferIosPlayback,
} from "@/lib/ios-audio-session";

/**
 * Keep iPhone in media-playback mode unless a tool has the mic open.
 * Without this, a previous getUserMedia leaves the PWA ducking into the
 * earpiece for every later <audio> / Web Audio play.
 */
export default function IosAudioSession() {
  useEffect(() => {
    preferIosPlayback();
    const retakeSpeaker = () => {
      preferIosPlayback();
      if (document.visibilityState === "visible") {
        void forceIosSpeakerRoute();
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") retakeSpeaker();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", retakeSpeaker);
    window.addEventListener("focus", retakeSpeaker);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", retakeSpeaker);
      window.removeEventListener("focus", retakeSpeaker);
    };
  }, []);
  return null;
}
