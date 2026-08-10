"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Sparkles, Square, Stars } from "lucide-react";
import Meyda, { type MeydaFeaturesObject } from "meyda";
import Button from "@/components/ui/Button";
import VoiceRadarChart from "@/components/ai/VoiceRadarChart";
import {
  matchTopCelebrities,
  type CelebrityMatch,
} from "@/lib/celebritiesDB";
import {
  FingerprintAccumulator,
  computeRadarAxes,
  type RadarAxes,
} from "@/lib/timbre-features";
import { classifySingingGender } from "@/lib/singing-gender";
import { assessVocalPresence } from "@/lib/vocal-presence";
import {
  startContextPcmCapture,
  type PcmCaptureSession,
} from "@/lib/pcm-capture";

const RECORD_MS = 10_000;
/** Power-of-two analysis window Meyda requires. 1024 samples ≈ 23ms @44.1kHz —
 *  a good balance between frequency resolution (needed for stable MFCC/centroid
 *  estimates on a singing voice) and time resolution (fast enough to gate out
 *  short silences without smearing across syllables). */
const MFCC_BUFFER_SIZE = 1024;
/** Meyda's own default MFCC coefficient count — matches the reference DB's vectors. */
const MFCC_COEFFICIENTS = 13;

type Stage = "idle" | "recording" | "extracting" | "matching" | "done";

type Props = { locked?: boolean };

export default function TimbreMatcher({ locked = false }: Props) {
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [axes, setAxes] = useState<RadarAxes | null>(null);
  const [matches, setMatches] = useState<CelebrityMatch[]>([]);
  const [genderLabel, setGenderLabel] = useState("");

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const meydaSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyzerRef = useRef<ReturnType<typeof Meyda.createMeydaAnalyzer> | null>(
    null
  );
  const pcmSessionRef = useRef<PcmCaptureSession | null>(null);
  const timersRef = useRef<number[]>([]);
  const busyRef = useRef(false);
  const analysisIdRef = useRef(0);
  const finishingRef = useRef(false);
  const endCaptureRef = useRef<(() => Promise<void>) | null>(null);

  /** Full teardown of mic/analyzer/context — used on early stop, error, and unmount. */
  const cleanupAudio = () => {
    timersRef.current.forEach((id) => window.clearInterval(id));
    timersRef.current = [];
    try {
      analyzerRef.current?.stop();
    } catch {
      /* already stopped */
    }
    analyzerRef.current = null;
    try {
      meydaSourceRef.current?.disconnect();
    } catch {
      /* already disconnected */
    }
    meydaSourceRef.current = null;
    try {
      pcmSessionRef.current?.abort();
    } catch {
      /* already aborted */
    }
    pcmSessionRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const ctx = audioContextRef.current;
    audioContextRef.current = null;
    if (ctx && ctx.state !== "closed") {
      void ctx.close().catch(() => undefined);
    }
  };

  useEffect(() => () => cleanupAudio(), []);

  const isStale = (id: number) => id !== analysisIdRef.current;

  const finalize = async (
    audioBuffer: AudioBuffer,
    accumulator: FingerprintAccumulator,
    analysisId: number
  ) => {
    try {
      if (audioBuffer.duration < 0.8 || audioBuffer.length < 8000) {
        throw new Error("Запись слишком короткая — спойте ещё раз");
      }

      const presence = assessVocalPresence(audioBuffer);
      if (!presence.ok) {
        throw new Error(presence.reason || "Голос не обнаружен");
      }
      if (isStale(analysisId)) return;

      // Primary silence guard: the live Meyda accumulator, not the post-hoc buffer check
      // above — this is what actually backs the fingerprint used for matching.
      const fingerprint = accumulator.finalize();
      if (!fingerprint) {
        throw new Error(
          "Звук не распознан, пойте громче — не хватило голосового сигнала для анализа тембра."
        );
      }

      const channel = audioBuffer.getChannelData(0);
      const genderResult = classifySingingGender(channel, audioBuffer.sampleRate);
      if (isStale(analysisId)) return;

      setStage("matching");
      // Top-3 closest matches, pure deterministic Euclidean vector math (no randomness) —
      // see `matchTopCelebrities` in lib/celebritiesDB.ts.
      const ranked = matchTopCelebrities(fingerprint.mfcc, {
        gender: genderResult.gender,
        genderIsConfident: genderResult.confidence !== "low",
      });
      if (isStale(analysisId)) return;

      setAxes(computeRadarAxes(fingerprint));
      setMatches(ranked);
      setGenderLabel(
        genderResult.gender === "female" ? "женский голос" : "мужской голос"
      );
      setStage("done");
    } catch (err) {
      if (isStale(analysisId)) return;
      setAxes(null);
      setMatches([]);
      setGenderLabel("");
      setError(
        err instanceof Error ? err.message : "Не удалось проанализировать запись"
      );
      setStage("idle");
    } finally {
      if (!isStale(analysisId)) {
        busyRef.current = false;
      }
    }
  };

  const start = async () => {
    if (busyRef.current || stage === "recording") return;
    busyRef.current = true;

    const analysisId = analysisIdRef.current + 1;
    analysisIdRef.current = analysisId;

    setError("");
    setAxes(null);
    setMatches([]);
    setGenderLabel("");
    setProgress(0);

    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Микрофон недоступен");
      busyRef.current = false;
      return;
    }

    try {
      cleanupAudio();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
        },
      });
      if (isStale(analysisId)) {
        stream.getTracks().forEach((t) => t.stop());
        busyRef.current = false;
        return;
      }
      streamRef.current = stream;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AudioCtx();
      if (ctx.state === "suspended") await ctx.resume();
      audioContextRef.current = ctx;

      // Same-context PCM tap for the classic pitch-based gender detector +
      // vocal-presence guard (both need raw samples, not Meyda's per-frame features).
      const pcmSession = startContextPcmCapture(ctx, stream, ctx.currentTime);
      pcmSessionRef.current = pcmSession;

      // Independent MediaStreamSource tap on the same context for Meyda —
      // multiple taps on one context/stream is standard and doesn't affect the mic.
      const meydaSource = ctx.createMediaStreamSource(stream);
      meydaSourceRef.current = meydaSource;

      const accumulator = new FingerprintAccumulator();

      const analyzer = Meyda.createMeydaAnalyzer({
        audioContext: ctx,
        source: meydaSource,
        bufferSize: MFCC_BUFFER_SIZE,
        numberOfMFCCCoefficients: MFCC_COEFFICIENTS,
        featureExtractors: ["mfcc", "spectralCentroid", "rms"],
        callback: (features: Partial<MeydaFeaturesObject>) => {
          accumulator.addFrame(features.mfcc, features.spectralCentroid, features.rms);
        },
      });
      analyzerRef.current = analyzer;
      analyzer.start();

      finishingRef.current = false;
      setStage("recording");

      const endCapture = async () => {
        if (finishingRef.current) return;
        finishingRef.current = true;
        timersRef.current.forEach((id) => window.clearInterval(id));
        timersRef.current = [];
        setProgress(100);
        setStage("extracting");

        try {
          analyzer.stop();
          try {
            meydaSource.disconnect();
          } catch {
            /* already disconnected */
          }
          const audioBuffer = await pcmSession.stop();
          stream.getTracks().forEach((t) => t.stop());
          if (streamRef.current === stream) streamRef.current = null;
          pcmSessionRef.current = null;
          if (analyzerRef.current === analyzer) analyzerRef.current = null;
          if (meydaSourceRef.current === meydaSource) meydaSourceRef.current = null;
          if (audioContextRef.current === ctx) audioContextRef.current = null;
          await ctx.close().catch(() => undefined);

          await finalize(audioBuffer, accumulator, analysisId);
        } catch (err) {
          if (isStale(analysisId)) return;
          setError(
            err instanceof Error ? err.message : "Не удалось обработать запись"
          );
          setStage("idle");
          busyRef.current = false;
        }
      };

      const started = performance.now();
      const progressTimer = window.setInterval(() => {
        const pct = Math.min(100, ((performance.now() - started) / RECORD_MS) * 100);
        setProgress(pct);
      }, 100);
      const finishTimer = window.setTimeout(() => {
        void endCapture();
      }, RECORD_MS);
      timersRef.current = [progressTimer, finishTimer];
      endCaptureRef.current = endCapture;
    } catch {
      setError("Разрешите доступ к микрофону");
      cleanupAudio();
      busyRef.current = false;
      setStage("idle");
    }
  };

  const stopEarly = () => {
    void endCaptureRef.current?.();
  };

  if (locked) {
    return (
      <LockedCard
        title="На кого похож твой тембр?"
        text="Сравнение тембра с базой исполнителей доступно на Premium / VIP (настраивается)."
      />
    );
  }

  const topMatch = matches[0];

  return (
    <section className="rounded-3xl bg-studio-surface p-4 ring-1 ring-studio-border sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-pink-500/10">
          <Stars className="h-5 w-5 text-pink-300" />
        </div>
        <div>
          <h2 className="font-display text-2xl font-semibold">
            На кого похож твой тембр?
          </h2>
          <p className="mt-1 text-sm text-studio-muted">
            Спойте 10 секунд — мы построим акустический отпечаток вашего голоса
            (MFCC + спектральный центроид) и сравним его с базой из 100
            известных голосов.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        {stage === "recording" ? (
          <Button fullWidth size="lg" variant="danger" onClick={stopEarly}>
            <Square className="h-4 w-4 fill-current" />
            Стоп · {Math.round(progress)}%
          </Button>
        ) : stage === "extracting" || stage === "matching" ? (
          <Button fullWidth size="lg" disabled>
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
            Анализируем…
          </Button>
        ) : (
          <Button fullWidth size="lg" onClick={() => void start()}>
            <Mic className="h-5 w-5" />
            Спеть 10 секунд
          </Button>
        )}
      </div>

      {stage === "recording" && (
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-studio-bg">
          <div
            className="h-full rounded-full bg-gradient-to-r from-pink-500 to-studio-accent transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {(stage === "extracting" || stage === "matching") && (
        <div className="mt-5 flex flex-col items-center gap-3 rounded-2xl bg-studio-bg/80 px-4 py-8 text-center ring-1 ring-studio-border">
          <span
            className="h-12 w-12 animate-spin rounded-full border-[3px] border-pink-400/30 border-t-pink-400"
            aria-hidden
          />
          <p className="font-medium text-studio-text">
            {stage === "extracting"
              ? "Строим акустический отпечаток…"
              : "Сравниваем со звёздами…"}
          </p>
          <p className="max-w-xs text-sm text-studio-muted">
            Это займёт долю секунды — не закрывайте страницу.
          </p>
        </div>
      )}

      {stage === "done" && topMatch && (
        <div className="mt-6 space-y-6">
          <div className="text-center">
            <p className="text-lg leading-snug text-studio-text">
              Главное совпадение:{" "}
              <span className="font-semibold text-pink-300">
                {topMatch.celebrity.name}
              </span>{" "}
              (
              <span className="font-semibold text-pink-300">
                {topMatch.percent}%
              </span>{" "}
              сходства)
            </p>
            {genderLabel && (
              <p className="mt-1 text-sm text-studio-muted">
                Определён {genderLabel}
              </p>
            )}
          </div>

          {axes && (
            <div className="flex justify-center">
              <VoiceRadarChart
                axes={axes}
                compare={{
                  axes: {
                    depth: topMatch.celebrity.acousticTraits.depth,
                    brightness: topMatch.celebrity.acousticTraits.brightness,
                    air: topMatch.celebrity.acousticTraits.airiness,
                  },
                  label: topMatch.celebrity.name,
                }}
                label="Ты"
              />
            </div>
          )}

          {(matches[1] || matches[2]) && (
            <p className="text-center text-sm text-studio-muted">
              Также в вашем голосе есть нотки:{" "}
              <span className="font-medium text-studio-text">
                {[matches[1]?.celebrity.name, matches[2]?.celebrity.name]
                  .filter(Boolean)
                  .join(" и ")}
              </span>
            </p>
          )}

          <div className="rounded-2xl bg-studio-card p-3.5 ring-1 ring-studio-border sm:p-4">
            <h3 className="mb-3 text-sm font-semibold text-studio-text">
              Топ-3 совпадения
            </h3>
            <ul className="space-y-4">
              {matches.map((m, i) => (
                <li key={m.celebrity.id}>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <p className="text-[13px] leading-snug text-studio-text sm:text-sm">
                      <span className="mr-1.5 text-studio-muted">{i + 1}.</span>
                      {m.celebrity.name}
                    </p>
                    <span className="shrink-0 text-xs font-semibold tabular-nums text-studio-accent-light">
                      {m.percent}%
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-studio-bg">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-pink-500 to-studio-accent"
                      style={{ width: `${Math.max(4, m.percent)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
    </section>
  );
}

function LockedCard({ title, text }: { title: string; text: string }) {
  return (
    <section className="rounded-3xl bg-studio-surface p-6 text-center ring-1 ring-studio-border">
      <Sparkles className="mx-auto h-8 w-8 text-amber-300" />
      <h2 className="mt-3 font-display text-2xl font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-studio-muted">{text}</p>
    </section>
  );
}
