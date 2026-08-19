/**
 * Chat voice/video capture — kept separate from singing-analysis helpers.
 *
 * iPhone/WebKit will not reuse tuner constraints here: echoCancellation:false
 * + a second camera+mic stream (or leftover live tracks) makes getUserMedia
 * fail even when the user already granted permission. Android is lenient.
 *
 * A successful getUserMedia is not enough on iOS: the camera stays black until
 * a visible inline <video> is actually playing, and MediaRecorder will persist
 * that black track if it starts too early.
 */

import { isAppleWebKit } from "@/lib/mic-audio";
import { holdIosCapture, releaseIosCapture } from "@/lib/ios-audio-session";
import { pickVideoRecorderMime, pickVoiceRecorderMime } from "@/lib/media-mime";

export function stopMediaStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((track) => {
    try {
      track.stop();
    } catch {
      /* already ended */
    }
  });
  releaseIosCapture(stream);
}

/**
 * Do not lead with portrait 720×1280. WebKit often accepts those `ideal`
 * sizes (so nothing throws) then delivers a live track with no frames.
 * Native / landscape sizes first; tiny VGA last.
 */
const VIDEO_CONSTRAINT_ATTEMPTS: MediaStreamConstraints[] = [
  {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: { facingMode: { ideal: "user" } },
  },
  {
    audio: { echoCancellation: true },
    video: {
      facingMode: { ideal: "user" },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  },
  {
    audio: true,
    video: {
      facingMode: { ideal: "user" },
      width: { ideal: 640 },
      height: { ideal: 480 },
    },
  },
  { audio: true, video: true },
];

export async function getChatMediaStream(
  kind: "voice" | "video",
  preview?: HTMLVideoElement | null
): Promise<MediaStream> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("unsupported");
  }
  if (kind === "voice") {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    holdIosCapture(stream);
    return stream;
  }

  let lastError: unknown;
  for (const constraints of VIDEO_CONSTRAINT_ATTEMPTS) {
    try {
      const stream = await openChatCamera(constraints, preview ?? null);
      holdIosCapture(stream);
      return stream;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Не удалось включить камеру");
}

/**
 * Keep the original MediaStream that getUserMedia returned. Wrapping tracks in
 * a new MediaStream after the fact is a common iOS black-preview trigger.
 * Mic tracks are added onto that same stream once the preview is painting.
 */
async function openChatCamera(
  constraints: MediaStreamConstraints,
  preview: HTMLVideoElement | null
): Promise<MediaStream> {
  const videoConstraints =
    typeof constraints.video === "undefined" ? true : constraints.video;
  const audioConstraints =
    typeof constraints.audio === "undefined" ? true : constraints.audio;

  if (!isAppleWebKit()) {
    return navigator.mediaDevices.getUserMedia(constraints);
  }

  const videoStream = await navigator.mediaDevices.getUserMedia({
    video: videoConstraints,
    audio: false,
  });
  try {
    if (preview) {
      await attachPreviewStream(preview, videoStream);
      if (preview.videoWidth === 0) {
        throw new Error("black");
      }
    }
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: false,
      });
      for (const track of audioStream.getAudioTracks()) {
        videoStream.addTrack(track);
      }
    } catch {
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
        for (const track of audioStream.getAudioTracks()) {
          videoStream.addTrack(track);
        }
      } catch {
        /* video-only still lets the student send a silent circle */
      }
    }
    return videoStream;
  } catch (err) {
    stopMediaStream(videoStream);
    throw err;
  }
}

/** Call synchronously in the tap handler so iOS unlocks autoplay. */
export function unlockInlineVideo(video: HTMLVideoElement) {
  prepareInlineVideo(video);
  void video.play().catch(() => undefined);
}

function prepareInlineVideo(video: HTMLVideoElement) {
  video.setAttribute("playsinline", "true");
  video.setAttribute("webkit-playsinline", "true");
  video.setAttribute("muted", "");
  video.setAttribute("autoplay", "");
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.controls = false;
  try {
    video.disablePictureInPicture = true;
  } catch {
    /* older WebKit */
  }
}

/** iOS will not start the camera until a visible inline <video> is playing. */
export async function attachPreviewStream(
  video: HTMLVideoElement,
  stream: MediaStream
): Promise<void> {
  prepareInlineVideo(video);
  for (const track of stream.getVideoTracks()) {
    track.enabled = true;
  }

  if (video.srcObject !== stream) {
    video.srcObject = stream;
  }

  await waitForTrackUnmute(stream);
  await waitForVideoMetadata(video);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await video.play();
      break;
    } catch {
      await sleep(60 * (attempt + 1));
    }
  }

  if (video.paused) {
    try {
      await video.play();
    } catch {
      /* muted + playsInline usually allows autoplay */
    }
  }

  if (video.videoWidth === 0 && !isAppleWebKit()) {
    const track = stream.getVideoTracks()[0];
    if (track) {
      try {
        await track.applyConstraints({
          width: { ideal: 640 },
          height: { ideal: 480 },
        });
      } catch {
        /* ignore */
      }
      try {
        await video.play();
      } catch {
        /* ignore */
      }
      await waitForVideoMetadata(video, 1200);
    }
  }

  await waitForPlaying(video);
  await nextPaint();
}

function waitForTrackUnmute(stream: MediaStream): Promise<void> {
  const track = stream.getVideoTracks()[0];
  if (!track || !track.muted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, 1500);
    track.addEventListener(
      "unmute",
      () => {
        window.clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
  });
}

function waitForVideoMetadata(
  video: HTMLVideoElement,
  timeoutMs = 2500
): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      if (video.videoWidth > 0 || video.readyState >= HTMLMediaElement.HAVE_METADATA) {
        settled = true;
        window.clearTimeout(timer);
        video.removeEventListener("loadedmetadata", done);
        video.removeEventListener("loadeddata", done);
        video.removeEventListener("canplay", done);
        resolve();
      }
    };
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      video.removeEventListener("loadedmetadata", done);
      video.removeEventListener("loadeddata", done);
      video.removeEventListener("canplay", done);
      resolve();
    }, timeoutMs);
    video.addEventListener("loadedmetadata", done);
    video.addEventListener("loadeddata", done);
    video.addEventListener("canplay", done);
    done();
  });
}

function waitForPlaying(video: HTMLVideoElement): Promise<void> {
  if (!video.paused && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, 1500);
    video.addEventListener(
      "playing",
      () => {
        window.clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
  });
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
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
export function startChatRecorder(recorder: MediaRecorder, _kind: "voice" | "video") {
  // Safari mp4 (voice and video) often yields an empty file if timeslice is set.
  const useTimeslice = !isAppleWebKit();
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
