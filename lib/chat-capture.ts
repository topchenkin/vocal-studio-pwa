/**
 * Chat voice/video capture — kept separate from singing-analysis helpers.
 *
 * iPhone/WebKit will not reuse tuner constraints here: echoCancellation:false
 * + a second camera+mic stream (or leftover live tracks) makes getUserMedia
 * fail even when the user already granted permission. Android is lenient.
 */

import { isAppleWebKit } from "@/lib/mic-audio";
import { pickVideoRecorderMime, pickVoiceRecorderMime } from "@/lib/media-mime";

export function stopMediaStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((track) => {
    try {
      track.enabled = false;
      track.stop();
    } catch {
      /* already ended */
    }
  });
}

const VIDEO_CONSTRAINT_ATTEMPTS: MediaStreamConstraints[] = [
  {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: {
      facingMode: { ideal: "user" },
      width: { ideal: 720 },
      height: { ideal: 1280 },
    },
  },
  {
    audio: { echoCancellation: true },
    video: { facingMode: { ideal: "user" } },
  },
  { audio: true, video: true },
];

export async function getChatMediaStream(
  kind: "voice" | "video"
): Promise<MediaStream> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("unsupported");
  }
  if (kind === "voice") {
    return navigator.mediaDevices.getUserMedia({ audio: true });
  }

  let lastError: unknown;
  for (const constraints of VIDEO_CONSTRAINT_ATTEMPTS) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Не удалось включить камеру");
}

/** iOS will not start the camera until a visible inline <video> is playing. */
export async function attachPreviewStream(
  video: HTMLVideoElement,
  stream: MediaStream
): Promise<void> {
  video.setAttribute("playsinline", "true");
  video.setAttribute("webkit-playsinline", "true");
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.srcObject = stream;
  try {
    await video.play();
  } catch {
    /* muted + playsInline usually allows autoplay; ignore if the engine defers */
  }
}

export function createChatRecorder(
  stream: MediaStream,
  kind: "voice" | "video"
): { recorder: MediaRecorder; mime: string } {
  const mime =
    kind === "video" ? pickVideoRecorderMime() : pickVoiceRecorderMime();
  try {
    const recorder = mime
      ? new MediaRecorder(stream, { mimeType: mime })
      : new MediaRecorder(stream);
    return { recorder, mime: recorder.mimeType || mime };
  } catch {
    const recorder = new MediaRecorder(stream);
    return { recorder, mime: recorder.mimeType || mime };
  }
}

/**
 * Android Chrome is happy with a 250ms timeslice. Safari's video/mp4
 * MediaRecorder often throws or yields an empty file if timeslice is set.
 */
export function startChatRecorder(
  recorder: MediaRecorder,
  kind: "voice" | "video"
) {
  const useTimeslice = kind !== "video" || !isAppleWebKit();
  if (useTimeslice) {
    try {
      recorder.start(250);
      return;
    } catch {
      /* fall through */
    }
  }
  recorder.start();
}

export function chatCaptureErrorMessage(
  kind: "voice" | "video",
  err: unknown
): string {
  const name = err instanceof DOMException ? err.name : "";
  if (kind === "voice") {
    if (name === "NotFoundError") return "Микрофон не найден";
    if (name === "NotReadableError") return "Микрофон занят другим приложением";
    return "Нужен доступ к микрофону";
  }
  if (name === "NotFoundError") return "Камера не найдена";
  if (name === "NotReadableError") {
    return "Камера занята. Закройте другие приложения с камерой и попробуйте снова";
  }
  if (name === "OverconstrainedError") {
    return "Не удалось включить камеру на этом устройстве";
  }
  if (name === "NotAllowedError") return "Нужен доступ к камере и микрофону";
  return "Не удалось включить камеру. Разрешите доступ и попробуйте снова";
}
