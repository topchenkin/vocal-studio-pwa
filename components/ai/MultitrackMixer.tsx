"use client";

import { useEffect, useRef, useState } from "react";
import {
  Download,
  Layers,
  Mic,
  Plus,
  RotateCcw,
  Sparkles,
  Square,
  Trash2,
} from "lucide-react";
import Button from "@/components/ui/Button";
import { decodeBlobToAudioBuffer, mixAudioBuffers } from "@/lib/wav-client";

const MAX_TRACKS = 10;

type Track = {
  id: string;
  name: string;
  blob: Blob;
  url: string;
  durationSec: number;
};

type Props = { locked?: boolean };

export default function MultitrackMixer({ locked = false }: Props) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [mixing, setMixing] = useState(false);
  const [mixUrl, setMixUrl] = useState("");
  const [error, setError] = useState("");

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const secondsRef = useRef(0);

  const stopMic = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setRecordingId(null);
    setSeconds(0);
  };

  useEffect(
    () => () => {
      stopMic();
      tracks.forEach((t) => URL.revokeObjectURL(t.url));
      if (mixUrl) URL.revokeObjectURL(mixUrl);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const startTrack = async () => {
    if (tracks.length >= MAX_TRACKS || recordingId) return;
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;
      chunksRef.current = [];
      const id = crypto.randomUUID();
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";
      const recorder = new MediaRecorder(
        stream,
        mime ? { mimeType: mime } : undefined
      );
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        const url = URL.createObjectURL(blob);
        const approxSec = secondsRef.current;
        setTracks((current) => [
          ...current,
          {
            id,
            name: `Дорожка ${current.length + 1}`,
            blob,
            url,
            durationSec: approxSec,
          },
        ]);
        stopMic();
      };
      recorder.start(200);
      setRecordingId(id);
      secondsRef.current = 0;
      setSeconds(0);
      timerRef.current = window.setInterval(() => {
        secondsRef.current += 1;
        setSeconds(secondsRef.current);
      }, 1000);
    } catch {
      setError("Не удалось получить доступ к микрофону");
      stopMic();
    }
  };

  const stopTrack = () => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    } else {
      stopMic();
    }
  };

  const removeTrack = (id: string) => {
    setTracks((current) => {
      const track = current.find((t) => t.id === id);
      if (track) URL.revokeObjectURL(track.url);
      return current.filter((t) => t.id !== id);
    });
  };

  const resetAll = () => {
    if (recordingId) stopTrack();
    setTracks((current) => {
      current.forEach((t) => URL.revokeObjectURL(t.url));
      return [];
    });
    if (mixUrl) {
      URL.revokeObjectURL(mixUrl);
      setMixUrl("");
    }
    setError("");
    setSeconds(0);
  };

  const mixAll = async () => {
    if (tracks.length === 0 || mixing) return;
    setMixing(true);
    setError("");
    try {
      const buffers = await Promise.all(
        tracks.map((track) => decodeBlobToAudioBuffer(track.blob))
      );
      const mixed = await mixAudioBuffers(buffers);
      if (mixUrl) URL.revokeObjectURL(mixUrl);
      setMixUrl(URL.createObjectURL(mixed));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось свести дорожки"
      );
    } finally {
      setMixing(false);
    }
  };

  if (locked) {
    return (
      <section className="rounded-3xl bg-studio-surface p-6 text-center ring-1 ring-studio-border">
        <Sparkles className="mx-auto h-8 w-8 text-amber-300" />
        <h2 className="mt-3 font-display text-2xl font-semibold">
          Сведение дорожек
        </h2>
        <p className="mt-2 text-sm text-studio-muted">
          Мультитрек 1–10 дорожек доступен начиная с Standard (настраивается).
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-3xl bg-studio-surface p-4 ring-1 ring-studio-border sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
          <Layers className="h-5 w-5 text-emerald-300" />
        </div>
        <div>
          <h2 className="font-display text-2xl font-semibold">
            Сведение дорожек
          </h2>
          <p className="mt-1 text-sm text-studio-muted">
            Запишите до {MAX_TRACKS} партий и сведите их в один трек одной
            кнопкой.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        {!recordingId ? (
          <Button
            fullWidth
            size="lg"
            disabled={tracks.length >= MAX_TRACKS}
            onClick={() => void startTrack()}
          >
            <Plus className="h-5 w-5" />
            Записать дорожку ({tracks.length}/{MAX_TRACKS})
          </Button>
        ) : (
          <Button fullWidth size="lg" variant="danger" onClick={stopTrack}>
            <Square className="h-4 w-4 fill-current" />
            Стоп · {seconds}с
          </Button>
        )}
        {(tracks.length > 0 || mixUrl) && !recordingId && (
          <Button
            fullWidth
            size="lg"
            variant="secondary"
            onClick={resetAll}
          >
            <RotateCcw className="h-5 w-5" />
            Сбросить всё
          </Button>
        )}
      </div>

      {tracks.length > 0 && (
        <ul className="mt-5 space-y-3">
          {tracks.map((track, index) => (
            <li
              key={track.id}
              className="rounded-2xl bg-studio-card p-3 ring-1 ring-studio-border"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Mic className="h-4 w-4 text-studio-accent" />
                  {track.name || `Дорожка ${index + 1}`}
                  <span className="text-xs text-studio-muted">
                    ~{track.durationSec}с
                  </span>
                </div>
                <button
                  type="button"
                  className="rounded-lg p-2 text-studio-muted hover:bg-studio-surface hover:text-red-300"
                  onClick={() => removeTrack(track.id)}
                  aria-label="Удалить дорожку"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <audio controls playsInline src={track.url} className="h-10 w-full" />
            </li>
          ))}
        </ul>
      )}

      {tracks.length > 0 && (
        <Button
          className="mt-4"
          fullWidth
          size="lg"
          disabled={mixing || Boolean(recordingId)}
          onClick={() => void mixAll()}
        >
          <Layers className="h-5 w-5" />
          {mixing ? "Сводим…" : `Свести все (${tracks.length}) в один файл`}
        </Button>
      )}

      {mixUrl && (
        <div className="mt-4 rounded-2xl bg-studio-card p-4 ring-1 ring-studio-border">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium">Результат сведения</span>
            <a
              href={mixUrl}
              download="uvs-mixdown.wav"
              className="rounded-lg p-2 text-studio-muted hover:bg-studio-surface hover:text-white"
              aria-label="Скачать микс"
            >
              <Download className="h-4 w-4" />
            </a>
          </div>
          <audio controls playsInline src={mixUrl} className="h-10 w-full" />
        </div>
      )}

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
    </section>
  );
}
