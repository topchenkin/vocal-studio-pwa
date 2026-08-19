"use client";

import type { AudioHTMLAttributes } from "react";
import { preferIosPlayback } from "@/lib/ios-audio-session";

type Props = AudioHTMLAttributes<HTMLAudioElement>;

/** HTML audio that stays on the iPhone speaker, not the earpiece. */
export default function MediaAudio({ onPlay, ...props }: Props) {
  return (
    <audio
      playsInline
      {...{ "webkit-playsinline": "true" }}
      {...props}
      onPlay={(event) => {
        preferIosPlayback();
        onPlay?.(event);
      }}
    />
  );
}
