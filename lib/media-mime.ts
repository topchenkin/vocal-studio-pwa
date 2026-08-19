/** Storage buckets match base types only — strip `;codecs=...` etc. */
export function normalizeMimeType(mime: string | null | undefined): string {
  if (!mime) return "";
  return mime.split(";")[0]?.trim().toLowerCase().replace(/["']/g, "") ?? "";
}

const ALLOWED_AUDIO = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/m4a",
  "audio/aac",
  "audio/x-m4a",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/x-wav",
]);

const ALLOWED_VIDEO = new Set(["video/webm", "video/mp4", "video/quicktime"]);
const ALLOWED_IMAGE = new Set([
  "image/jpeg",
  "image/jpg",
  "image/pjpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

const VOICE_RECORDER_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
] as const;

const VIDEO_RECORDER_CANDIDATES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=avc1,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
] as const;

export function pickVoiceRecorderMime(): string {
  if (typeof MediaRecorder === "undefined") return "audio/webm";
  for (const candidate of VOICE_RECORDER_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return "";
}

export function pickVideoRecorderMime(): string {
  if (typeof MediaRecorder === "undefined") return "video/webm";
  for (const candidate of VIDEO_RECORDER_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return "";
}

export function extensionForAudioMime(mime: string): string {
  const base = normalizeMimeType(mime);
  if (base === "audio/mp4" || base === "audio/m4a" || base === "audio/aac") {
    return "m4a";
  }
  if (base === "audio/ogg") return "ogg";
  if (base === "audio/mpeg" || base === "audio/mp3") return "mp3";
  if (base === "audio/wav" || base === "audio/wave") return "wav";
  return "webm";
}

export function extensionForVideoMime(mime: string): string {
  const base = normalizeMimeType(mime);
  if (base === "video/mp4" || base === "video/quicktime") return "mp4";
  return "webm";
}

export function coerceChatMime(
  messageType: "voice" | "video" | "image",
  rawMime: string | null | undefined
): string {
  const mime = normalizeMimeType(rawMime);
  if (messageType === "voice") {
    if (ALLOWED_AUDIO.has(mime)) {
      if (mime === "audio/m4a" || mime === "audio/aac" || mime === "audio/x-m4a") {
        return "audio/mp4";
      }
      if (mime === "audio/x-wav") return "audio/wav";
      return mime;
    }
    if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac")) {
      return "audio/mp4";
    }
    if (mime.includes("ogg")) return "audio/ogg";
    if (mime.includes("mpeg") || mime.includes("mp3")) return "audio/mpeg";
    if (mime.includes("wav")) return "audio/wav";
    if (
      typeof MediaRecorder !== "undefined" &&
      MediaRecorder.isTypeSupported("audio/mp4") &&
      !MediaRecorder.isTypeSupported("audio/webm")
    ) {
      return "audio/mp4";
    }
    return "audio/webm";
  }
  if (messageType === "video") {
    if (ALLOWED_VIDEO.has(mime)) {
      return mime === "video/quicktime" ? "video/mp4" : mime;
    }
    if (mime.includes("mp4") || mime.includes("quicktime") || mime.includes("m4v")) {
      return "video/mp4";
    }
    if (
      typeof MediaRecorder !== "undefined" &&
      MediaRecorder.isTypeSupported("video/mp4") &&
      !MediaRecorder.isTypeSupported("video/webm")
    ) {
      return "video/mp4";
    }
    return "video/webm";
  }
  if (mime === "image/png" || mime.includes("png")) return "image/png";
  if (mime === "image/webp" || mime.includes("webp")) return "image/webp";
  if (mime === "image/gif" || mime.includes("gif")) return "image/gif";
  if (ALLOWED_IMAGE.has(mime) && mime !== "image/heic" && mime !== "image/heif") {
    if (mime === "image/jpg" || mime === "image/pjpeg") return "image/jpeg";
    return mime;
  }
  return "image/jpeg";
}

export function mediaFileFromChunks(
  chunks: Blob[],
  recorderMime: string,
  kind: "voice" | "video"
): File {
  const contentType = coerceChatMime(kind, recorderMime || chunks[0]?.type);
  const blob = new Blob(chunks, { type: contentType });
  const ext =
    kind === "video"
      ? extensionForVideoMime(contentType)
      : extensionForAudioMime(contentType);
  return new File([blob], `${kind}-${Date.now()}.${ext}`, {
    type: contentType,
  });
}

export function voiceFileFromChunks(
  chunks: Blob[],
  recorderMime: string
): File {
  return mediaFileFromChunks(chunks, recorderMime, "voice");
}

export function extensionForChatMedia(
  messageType: "voice" | "video" | "image",
  mime: string,
  fileName?: string
): string {
  if (messageType === "voice") return extensionForAudioMime(mime);
  if (messageType === "video") return extensionForVideoMime(mime);
  const fromName = fileName?.split(".").pop()?.replace(/[^\w]+/g, "").toLowerCase();
  if (fromName && fromName !== "heic" && fromName !== "heif" && fromName !== "dng") {
    return fromName === "jpeg" ? "jpg" : fromName;
  }
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "jpg";
}
