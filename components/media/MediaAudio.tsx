"use client";

import { forwardRef, type AudioHTMLAttributes } from "react";
import { preferIosPlayback } from "@/lib/ios-audio-session";

type Props = AudioHTMLAttributes<HTMLAudioElement>;

/** HTML audio that stays on the iPhone speaker, not the earpiece. */
const MediaAudio = forwardRef<HTMLAudioElement, Props>(function MediaAudio(
  { onPlay, ...props },
  ref
) {
  return (
    <audio
      ref={ref}
      playsInline
      {...{ "webkit-playsinline": "true" }}
      {...props}
      onPlay={(event) => {
        preferIosPlayback();
        onPlay?.(event);
      }}
    />
  );
});

export default MediaAudio;
