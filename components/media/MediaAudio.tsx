"use client";

import { forwardRef, type AudioHTMLAttributes } from "react";
import {
  preferIosPlayback,
  routeHtmlMediaToSpeaker,
} from "@/lib/ios-audio-session";

type Props = AudioHTMLAttributes<HTMLAudioElement>;

/** HTML audio that stays on the iPhone speaker, not the earpiece. */
const MediaAudio = forwardRef<HTMLAudioElement, Props>(function MediaAudio(
  { onPlay, onLoadedMetadata, ...props },
  ref
) {
  return (
    <audio
      ref={ref}
      playsInline
      {...{ "webkit-playsinline": "true" }}
      {...props}
      onLoadedMetadata={(event) => {
        void routeHtmlMediaToSpeaker(event.currentTarget);
        onLoadedMetadata?.(event);
      }}
      onPlay={(event) => {
        preferIosPlayback();
        void routeHtmlMediaToSpeaker(event.currentTarget);
        onPlay?.(event);
      }}
    />
  );
});

export default MediaAudio;
