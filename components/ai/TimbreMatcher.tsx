"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, RefreshCcw, Sparkles, Square, Stars } from "lucide-react";
import Meyda, { type MeydaFeaturesObject } from "meyda";
import Button from "@/components/ui/Button";
import VoiceRadarChart from "@/components/ai/VoiceRadarChart";
import {
  CELEBRITY_GENRES,
  groupMatchesByGenre,
  rankCelebritiesByGender,
  type CelebrityGenre,
  type CelebrityMatch,
} from "@/lib/celebritiesDB";
import {
  FingerprintAccumulator,
  computeRadarAxes,
  detectGenderFromF0,
  type AcousticFingerprint,
  type RadarAxes,
  type TimbreGender,
} from "@/lib/timbre-features";
import { assessVocalPresence } from "@/lib/vocal-presence";
import { createYinDetector, type PitchDetectorFn } from "@/lib/pitch";
import {
  startContextPcmCapture,
  type PcmCaptureSession,
} from "@/lib/pcm-capture";

const RECORD_MS = 10_000;
/**
 * Power-of-two analysis window shared by BOTH detectors running on every frame:
 * Meyda (mfcc/spectralCentroid/rms) AND pitchfinder's YIN (fed the exact same
 * frame via Meyda's `buffer` feature — see the analyzer callback below), per
 * the "run both systems together on every frame" requirement. 2048 samples ≈
 * 46ms @44.1kHz — still comfortably faster than the ~100ms target cadence,
 * and (unlike the smaller 1024-sample window used before YIN was added to
 * this pipeline) long enough to contain 2+ full periods even of a low male
 * chest voice (~85Hz → ~520 samples/period), which YIN needs for a reliable
 * F0 read, while still being short enough to gate out brief silences cleanly.
 */
const MFCC_BUFFER_SIZE = 2048;
/** Meyda's own default MFCC coefficient count — matches the reference DB's vectors. */
const MFCC_COEFFICIENTS = 13;

type Stage = "idle" | "recording" | "extracting" | "matching" | "done";

type Props = { locked?: boolean };

const GENRE_LABEL_RU: Record<CelebrityGenre, string> = {
  Pop: "Поп",
  Rock: "Рок",
};

const GENDER_LABEL_RU: Record<TimbreGender, string> = {
  male: "Мужской",
  female: "Женский",
};

export default function TimbreMatcher({ locked = false }: Props) {
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [axes, setAxes] = useState<RadarAxes | null>(null);
  const [fingerprint, setFingerprint] = useState<AcousticFingerprint | null>(null);
  const [detectedGender, setDetectedGender] = useState<TimbreGender | null>(null);
  const [selectedGender, setSelectedGender] = useState<TimbreGender | null>(null);
  const [activeGenre, setActiveGenre] = useState<CelebrityGenre>("Pop");

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

      // Independent "is there a voice at all" guard — kept from the previous
      // pipeline (see lib/vocal-presence.ts); the actual gender decision below
      // no longer depends on it, only whether to accept the take at all.
      const presence = assessVocalPresence(audioBuffer);
      if (!presence.ok) {
        throw new Error(presence.reason || "Голос не обнаружен");
      }
      if (isStale(analysisId)) return;

      // Median-based fingerprint from the live Meyda+YIN accumulator — see
      // lib/timbre-features.ts for why median (not mean) and why frames with
      // no detected pitch still contribute to the MFCC median but not to
      // medianF0.
      const fp = accumulator.finalize();
      if (!fp) {
        throw new Error(
          "Звук не распознан, пойте громче — не хватило голосового сигнала для анализа тембра."
        );
      }
      if (isStale(analysisId)) return;

      setStage("matching");

      // EXACT rule, no secondary heuristics: medianF0 < 175Hz → male, else female.
      // Worked examples (traced end-to-end):
      //  - male student, F0≈140Hz  → detectGenderFromF0 → "male"   → rankCelebritiesByGender only ever
      //    scores/returns `gender: "male"` profiles → grouped by genre → top 5 Pop + top 5 Rock.
      //  - female student, F0≈230Hz → "female" → only `gender: "female"` profiles considered, symmetric.
      //  - borderline male, F0≈170Hz → still "male" (< 175) — if that's wrong for this voice, the
      //    gender toggle below lets the student flip to "female" and instantly re-filters/re-ranks
      //    the SAME median MFCC vector against the other-gender pool — no re-recording needed.
      const detected = detectGenderFromF0(fp.medianF0);

      setFingerprint(fp);
      setAxes(computeRadarAxes(fp));
      setDetectedGender(detected);
      setSelectedGender(detected);
      setActiveGenre("Pop");
      setStage("done");
    } catch (err) {
      if (isStale(analysisId)) return;
      setAxes(null);
      setFingerprint(null);
      setDetectedGender(null);
      setSelectedGender(null);
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
    setFingerprint(null);
    setDetectedGender(null);
    setSelectedGender(null);
    setActiveGenre("Pop");
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

      // Same-context PCM tap, used only for the post-hoc "is there a voice at
      // all" guard (assessVocalPresence) and duration checks — no longer feeds
      // a second gender classifier (that now runs off medianF0 from the live
      // Meyda+YIN accumulator below).
      const pcmSession = startContextPcmCapture(ctx, stream, ctx.currentTime);
      pcmSessionRef.current = pcmSession;

      // Independent MediaStreamSource tap on the same context for Meyda —
      // multiple taps on one context/stream is standard and doesn't affect the mic.
      const meydaSource = ctx.createMediaStreamSource(stream);
      meydaSourceRef.current = meydaSource;

      const accumulator = new FingerprintAccumulator();

      // Single YIN detector instance reused across the whole take — cheaper
      // than constructing pitchfinder's internal state every frame, and this
      // is the SAME tested primitive the pitch tuner uses (lib/pitch.ts).
      const yinDetector: PitchDetectorFn = createYinDetector(ctx.sampleRate);

      const analyzer = Meyda.createMeydaAnalyzer({
        audioContext: ctx,
        source: meydaSource,
        bufferSize: MFCC_BUFFER_SIZE,
        numberOfMFCCCoefficients: MFCC_COEFFICIENTS,
        featureExtractors: ["mfcc", "spectralCentroid", "rms", "buffer"],
        callback: (features: Partial<MeydaFeaturesObject>) => {
          // Both detectors run on the exact same frame/buffer/sample-rate —
          // Meyda's `buffer` feature is the raw (pre-FFT) time-domain signal
          // for this analysis window, handed straight to YIN.
          let f0: number | null = null;
          const raw = features.buffer;
          if (Array.isArray(raw) && raw.length > 0) {
            f0 = yinDetector(Float32Array.from(raw));
          }
          accumulator.addFrame(features.mfcc, features.spectralCentroid, features.rms, f0);
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

  // Instant recompute on gender toggle — no re-recording, no re-running DSP:
  // just re-filter/re-rank the SAME median MFCC vector against the other
  // gender's pool. STRICT gender filter lives entirely inside
  // `rankCelebritiesByGender` (lib/celebritiesDB.ts): it only ever scores
  // candidates whose `gender` field equals the `gender` argument passed here,
  // so whichever of `detectedGender`/`selectedGender` we pass through is the
  // one and only gender ever represented in `matches`/`grouped` below.
  const matches: CelebrityMatch[] = useMemo(() => {
    if (!fingerprint || !selectedGender) return [];
    return rankCelebritiesByGender(fingerprint.mfcc, selectedGender);
  }, [fingerprint, selectedGender]);

  const grouped = useMemo(() => groupMatchesByGenre(matches, 5), [matches]);

  const topMatch = matches[0];

  if (locked) {
    return (
      <LockedCard
        title="На кого похож твой тембр?"
        text="Сравнение тембра с базой исполнителей доступно на Premium / VIP (настраивается)."
      />
    );
  }

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
            (медианные MFCC + спектральный центроид + YIN-высота тона) и
            сравним его с базой из 100 известных голосов.
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

      {stage === "done" && selectedGender && (
        <div className="mt-6 space-y-6">
          {/* Gender toggle — shown together with results since matching is
              instant; stays interactive the whole time so the student can
              correct it before OR after trusting the results. */}
          <div className="rounded-2xl bg-studio-bg/80 px-4 py-3 text-center ring-1 ring-studio-border">
            <p className="text-sm leading-relaxed text-studio-text">
              Ваш голос определён как:{" "}
              <span className="font-semibold text-studio-accent-light">
                {GENDER_LABEL_RU[selectedGender]}
              </span>
              {detectedGender && selectedGender !== detectedGender && (
                <span className="ml-1.5 text-xs text-amber-300">(вручную)</span>
              )}
              . Если это ошибка,{" "}
              <button
                type="button"
                onClick={() =>
                  setSelectedGender((g) => (g === "male" ? "female" : "male"))
                }
                className="inline-flex items-center gap-1 font-semibold text-pink-300 underline decoration-dotted underline-offset-4 transition hover:text-pink-200"
              >
                <RefreshCcw className="h-3 w-3" />
                переключить на{" "}
                {GENDER_LABEL_RU[selectedGender === "male" ? "female" : "male"]}
              </button>
            </p>
          </div>

          {topMatch && (
            <>
              <div className="text-center">
                <p className="text-lg leading-snug text-studio-text">
                  Абсолютный мэтч:{" "}
                  <span className="font-semibold text-pink-300">
                    {topMatch.celebrity.name}
                  </span>{" "}
                  (
                  <span className="font-semibold text-pink-300">
                    {topMatch.percent}%
                  </span>
                  )
                </p>
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

              <div>
                <div className="mb-3 flex gap-1 rounded-2xl bg-studio-bg/60 p-1 ring-1 ring-studio-border">
                  {CELEBRITY_GENRES.map((genre) => {
                    const count = grouped[genre]?.length ?? 0;
                    return (
                      <button
                        key={genre}
                        type="button"
                        onClick={() => setActiveGenre(genre)}
                        className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition ${
                          activeGenre === genre
                            ? "bg-studio-accent/20 text-studio-accent-light"
                            : "text-studio-muted hover:text-studio-text"
                        }`}
                      >
                        {GENRE_LABEL_RU[genre]}
                        {count > 0 && (
                          <span className="ml-1.5 tabular-nums opacity-70">
                            ({count})
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {(grouped[activeGenre]?.length ?? 0) === 0 ? (
                  <p className="rounded-2xl bg-studio-card px-4 py-6 text-center text-sm text-studio-muted ring-1 ring-studio-border">
                    В жанре «{GENRE_LABEL_RU[activeGenre]}» нет совпадений для
                    выбранного пола.
                  </p>
                ) : (
                  <div className="rounded-2xl bg-studio-card p-3.5 ring-1 ring-studio-border sm:p-4">
                    <h3 className="mb-3 text-sm font-semibold text-studio-text">
                      Топ совпадений — {GENRE_LABEL_RU[activeGenre]}
                    </h3>
                    <ul className="space-y-4">
                      {(grouped[activeGenre] ?? []).map((m, i) => (
                        <li key={m.celebrity.id}>
                          <div className="mb-1.5 flex items-center justify-between gap-2">
                            <p className="text-[13px] leading-snug text-studio-text sm:text-sm">
                              <span className="mr-1.5 text-studio-muted">
                                {i + 1}.
                              </span>
                              {m.celebrity.name}
                            </p>
                            <span className="shrink-0 text-xs font-semibold tabular-nums text-studio-accent-light">
                              {m.percent}% сходства
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
                )}
              </div>
            </>
          )}
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
