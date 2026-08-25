/** iOS Files/iCloud greys out MP3 if `accept` is only `audio/mpeg`. Extensions first. */
export const AUDIO_FILE_ACCEPT =
  ".mp3,.m4a,.wav,.ogg,.aac,.flac,audio/mpeg,audio/mp4,audio/wav,audio/x-m4a,audio/aac,audio/ogg,audio/flac,audio/*";

export const VIDEO_FILE_ACCEPT =
  ".mp4,.mov,.m4v,.webm,video/mp4,video/quicktime,video/webm,video/*";

export const MEDIA_FILE_ACCEPT = `${AUDIO_FILE_ACCEPT},${VIDEO_FILE_ACCEPT}`;

const AUDIO_EXT = new Set(["mp3", "m4a", "wav", "ogg", "aac", "flac", "opus", "webm"]);
const VIDEO_EXT = new Set(["mp4", "mov", "m4v", "webm"]);

function extensionOf(file: { name?: string; type?: string }) {
  const fromName = file.name?.split(".").pop()?.replace(/[^\w]+/g, "").toLowerCase();
  if (fromName) return fromName;
  const mime = (file.type || "").toLowerCase();
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("m4a") || mime.includes("mp4") || mime.includes("aac")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("flac")) return "flac";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("quicktime")) return "mov";
  return "";
}

export function isAllowedAudioFile(file: { name?: string; type?: string } | null | undefined) {
  if (!file) return false;
  const mime = (file.type || "").toLowerCase();
  if (mime.startsWith("audio/")) return true;
  return AUDIO_EXT.has(extensionOf(file));
}

export function isAllowedVideoFile(file: { name?: string; type?: string } | null | undefined) {
  if (!file) return false;
  const mime = (file.type || "").toLowerCase();
  if (mime.startsWith("video/")) return true;
  return VIDEO_EXT.has(extensionOf(file));
}

export function mediaAcceptFor(type: "audio" | "video") {
  return type === "audio" ? AUDIO_FILE_ACCEPT : VIDEO_FILE_ACCEPT;
}

export function rejectedMediaMessage(type: "audio" | "video") {
  return type === "audio"
    ? "Выберите аудио: MP3, M4A, WAV, OGG, AAC или FLAC."
    : "Выберите видео: MP4, MOV или WebM.";
}
