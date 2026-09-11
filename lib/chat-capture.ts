/**
 * Chat voice/video capture — kept separate from singing-analysis helpers.
 *
 * iPhone will not reuse tuner constraints here. A second getUserMedia
 * (camera already open, then mic) often hangs forever in WKWebView — the
 * green "Камера используется" pill stays on and the timer never starts.
 */

import { isAppleWebKit } from "@/lib/mic-audio";
import {
  armIosCapture,
  cancelArmedIosCapture,
  holdIosCapture,
  releaseIosCapture,
} from "@/lib/ios-audio-session";
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
  releaseIosCapture(stream);
}

export async function getChatMediaStream(
  kind: "voice" | "video",
  preview?: HTMLVideoElement | null
): Promise<MediaStream> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("unsupported");
  }
  armIosCapture();
  try {
    const stream =
      kind === "voice"
        ? await getVoiceStream()
        : await getVideoStream(preview ?? null);
    holdIosCapture(stream);
    return stream;
  } catch (error) {
    cancelArmedIosCapture();
    throw error;
  }
}

async function getVoiceStream(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
  } catch (first) {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
    } catch {
      throw first;
    }
  }
}

const IOS_VIDEO_CONSTRAINTS: MediaTrackConstraints[] = [
  {
    facingMode: { ideal: "user" },
    width: { ideal: 640 },
    height: { ideal: 480 },
  },
  { facingMode: "user" },
];

async function getVideoStream(
  preview: HTMLVideoElement | null
): Promise<MediaStream> {
  if (preview) prepareInlineVideo(preview);

  if (isAppleWebKit()) {
    // One combined request. Never open the camera and then ask for the mic.
    let stream: MediaStream | null = null;
    let lastError: unknown;
    for (const video of IOS_VIDEO_CONSTRAINTS) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video,
        });
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!stream) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
        });
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: true,
          });
        } catch (error) {
          throw lastError || error;
        }
      }
    }
    stream.getVideoTracks().forEach((track) => {
      track.enabled = true;
    });
    await bindPreview(preview, stream);
    return stream;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: { facingMode: { ideal: "user" }, width: { ideal: 640 }, height: { ideal: 480 } },
    });
    await bindPreview(preview, stream);
    return stream;
  } catch {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });
    await bindPreview(preview, stream);
    return stream;
  }
}

async function bindPreview(
  preview: HTMLVideoElement | null,
  stream: MediaStream
): Promise<void> {
  if (!preview) return;
  prepareInlineVideo(preview);
  if (preview.srcObject !== stream) {
    preview.srcObject = stream;
  }
  const play = () => {
    prepareInlineVideo(preview);
    return preview.play().catch(() => undefined);
  };
  if (preview.readyState >= 1) {
    await play();
    return;
  }
  await new Promise<void>((resolve) => {
    const done = () => {
      preview.removeEventListener("loadedmetadata", done);
      resolve();
    };
    preview.addEventListener("loadedmetadata", done, { once: true });
    window.setTimeout(done, 800);
  });
  await play();
}

/** Call synchronously in the tap handler so iOS unlocks autoplay. */
export function unlockInlineVideo(video: HTMLVideoElement) {
  prepareInlineVideo(video);
  void video.play().catch(() => undefined);
}

function prepareInlineVideo(video: HTMLVideoElement) {
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "true");
  video.setAttribute("muted", "");
  video.setAttribute("autoplay", "");
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.controls = false;
  video.setAttribute("controlslist", "nodownload nofullscreen noremoteplayback");
  try {
    video.disablePictureInPicture = true;
  } catch {
    /* older WebKit */
  }
}

/** Best-effort play(); never block the recorder on metadata. */
export async function attachPreviewStream(
  video: HTMLVideoElement,
  stream: MediaStream
): Promise<void> {
  await bindPreview(video, stream);
}

export function createChatRecorder(
  stream: MediaStream,
  kind: "voice" | "video"
): { recorder: MediaRecorder; mime: string } {
  if (kind === "voice" && stream.getAudioTracks().length === 0) {
    throw new Error("no-audio-track");
  }
  if (kind === "video" && stream.getVideoTracks().length === 0) {
    throw new Error("no-video-track");
  }

  if (isAppleWebKit()) {
    try {
      const recorder = new MediaRecorder(stream);
      return {
        recorder,
        mime:
          recorder.mimeType ||
          (kind === "video" ? "video/mp4" : "audio/mp4"),
      };
    } catch {
      /* fall through to typed mime */
    }
  }

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
  _kind: "voice" | "video"
) {
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

function errorName(err: unknown) {
  if (err instanceof DOMException) return err.name;
  if (err instanceof Error) return err.name;
  return "";
}

function errorText(err: unknown) {
  if (err instanceof Error && err.message) return err.message;
  return String(err ?? "");
}

export function chatCaptureErrorMessage(
  kind: "voice" | "video",
  err: unknown
): string {
  const name = errorName(err);
  const text = errorText(err);
  if (kind === "voice") {
    if (text === "unsupported" || name === "NotSupportedError") {
      return "Этот браузер не умеет записывать голос. Откройте Safari.";
    }
    if (text === "no-audio-track") {
      return "Микрофон включился без дорожки. Нажмите ещё раз.";
    }
    if (name === "NotFoundError") return "Микрофон не найден";
    if (name === "NotReadableError") {
      return "Микрофон занят. Закройте тюнер или другое приложение и нажмите ещё раз";
    }
    if (name === "AbortError") {
      return "Safari прервал микрофон. Нажмите на голосовое ещё раз";
    }
    if (name === "NotAllowedError" || name === "SecurityError") {
      return "Safari не отдал микрофон этому окну. Закройте тюнер, откройте чат ещё раз и нажмите на микрофон — запрос должен появиться сразу";
    }
    if (name === "InvalidStateError") {
      return "Не удалось начать запись. Нажмите на микрофон ещё раз";
    }
    return "Не удалось включить микрофон. Нажмите ещё раз";
  }
  if (name === "NotFoundError") return "Камера не найдена";
  if (name === "NotReadableError") {
    return "Камера занята. Закройте другие приложения с камерой и попробуйте снова";
  }
  if (name === "OverconstrainedError") {
    return "Не удалось включить камеру на этом устройстве";
  }
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Нужен доступ к камере и микрофону. Нажмите ещё раз сразу после открытия чата";
  }
  if (text === "no-video-track") return "Камера не дала картинку. Нажмите ещё раз";
  return "Не удалось включить камеру. Нажмите ещё раз";
}
