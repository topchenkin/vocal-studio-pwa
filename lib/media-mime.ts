/** Storage buckets match base types only — strip `;codecs=...` etc. */
export function normalizeMimeType(mime: string | null | undefined): string {
  if (!mime) return "";
  return mime.split(";")[0]?.trim().toLowerCase().replace(/["']/g, "") ?? "";
}

const ALLOWED_AUDIO = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
]);

const ALLOWED_VIDEO = new Set(["video/webm", "video/mp4"]);
const ALLOWED_IMAGE = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const VOICE_RECORDER_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
] as const;

const VIDEO_RECORDER_CANDIDATES = [
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
    if (ALLOWED_AUDIO.has(mime)) return mime;
    if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac")) {
      return "audio/mp4";
    }
    if (mime.includes("ogg")) return "audio/ogg";
    if (mime.includes("mpeg") || mime.includes("mp3")) return "audio/mpeg";
    if (mime.includes("wav")) return "audio/wav";
    return "audio/webm";
  }
  if (messageType === "video") {
    if (ALLOWED_VIDEO.has(mime)) return mime;
    if (mime.includes("mp4") || mime.includes("quicktime") || mime.includes("m4v")) {
      return "video/mp4";
    }
    return "video/webm";
  }
  if (ALLOWED_IMAGE.has(mime)) return mime;
  if (mime.includes("png")) return "image/png";
  if (mime.includes("webp")) return "image/webp";
  if (mime.includes("gif")) return "image/gif";
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
  const fromName = fileName?.split(".").pop()?.replace(/[^\w]+/g, "");
  if (fromName) return fromName;
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "jpg";
}
