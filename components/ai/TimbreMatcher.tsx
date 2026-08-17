"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, Sparkles, Square, Stars } from "lucide-react";
import type { MeydaFeaturesObject } from "meyda";
import Button from "@/components/ui/Button";
import VoiceRadarChart from "@/components/ai/VoiceRadarChart";
import {
  CELEBRITY_GENRES,
  VOCAL_FACH_LABEL_RU,
  classifyVocalFach,
  groupMatchesByGenre,
  matchCelebrities,
  type CelebrityMatch,
  type Genre,
} from "@/lib/celebritiesDB";
import {
  VoiceMeasurementAccumulator,
  type TimbreGender,
  type VoiceMeasurement,
} from "@/lib/timbre-features";
import { assessVocalPresence } from "@/lib/vocal-presence";
import { createYinDetector, type PitchDetectorFn } from "@/lib/pitch";
import {
  startContextPcmCapture,
  type PcmCaptureSession,
} from "@/lib/pcm-capture";

const RECORD_MS = 10_000;
/**
 * Power-of-two analysis window shared by BOTH detectors running on every
 * frame: Meyda (spectralCentroid / spectralFlatness / zcr / rms) AND
 * pitchfinder's YIN (fed raw PCM tapped from a parallel AnalyserNode — see
 * the analyzer callback below; YIN deliberately does NOT use Meyda's own
 * `buffer` feature, which is the *windowed*, not raw, signal and badly
 * degrades pitch detection). 2048 samples ≈ 46ms @44.1kHz — long enough to
 * contain 2+ full periods even of a low male chest voice (~85Hz → ~520
 * samples/period), which YIN needs for a reliable F0 read, while still short
 * enough to gate out brief silences cleanly.
 */
const ANALYSIS_BUFFER_SIZE = 2048;
/**
 * Window size of the separate raw-PCM tap that feeds YIN — deliberately LARGER
 * than Meyda's frame.
 *
 * pitchfinder's YIN rounds its input down to the nearest power of two and then
 * only searches lags up to a QUARTER of that (`yinBufferLength = bufferSize/2`,
 * lags `2..yinBufferLength`). With a 2048-sample tap that caps the usable lag
 * at 511 samples, and — because YIN's cumulative-mean normalisation seeds
 * `yinBuffer[1] = 1` — the difference function of a low, slowly-varying voice
 * never gets large enough for the 0.1 threshold to trigger at the true lag.
 * Measured on synthetic voices (48kHz, realistic mic noise floor, 4s takes,
 * frames counted the same way this component counts them):
 *
 *          2048-sample tap        4096-sample tap
 *  110Hz    0/93 pitched          31/93 pitched, median 110.2
 *  120Hz    0/93 pitched          50/93 pitched, median 119.9
 *  135Hz    0/93 pitched          80/93 pitched, median 135.0
 *  150Hz    0/93 pitched          92/93 pitched, median 150.1
 *  210Hz   93/93 pitched          92/93 pitched, median 210.1
 *
 * i.e. at 2048 the pipeline is structurally blind to EVERY male voice below
 * ~165Hz — the exact population this feature kept misclassifying. Doubling the
 * tap costs ~6ms of YIN per frame instead of ~1.5ms, comfortably inside the
 * ~43ms frame cadence. 8192 was rejected: ~24ms/frame is too close to the
 * cadence, and YIN is O(n²).
 */
const PITCH_WINDOW_SIZE = 4096;

type Stage = "idle" | "recording" | "extracting" | "matching" | "done";

type Props = { locked?: boolean };

const GENRE_LABEL_RU: Record<Genre, string> = {
  Pop: "Поп",
  Rock: "Рок",
  "Rap/Hip-Hop": "Рэп",
  "Estrada/Chanson": "Шансон",
  "Jazz/Soul": "Джаз",
};

const GENDERS: TimbreGender[] = ["male", "female"];

const GENDER_LABEL_RU: Record<TimbreGender, string> = {
  male: "Мужской",
  female: "Женский",
};

type MeydaAnalyzerHandle = { start: () => void; stop: () => void };

async function loadMeydaCreate() {
  const mod = (await import("meyda")) as {
    default?: { createMeydaAnalyzer?: unknown };
    createMeydaAnalyzer?: unknown;
  };
  const Meyda = mod.default ?? mod;
  if (typeof Meyda.createMeydaAnalyzer !== "function") {
    throw new Error("Анализ тембра недоступен в этом браузере");
  }
  return Meyda.createMeydaAnalyzer as (options: {
    audioContext: AudioContext;
    source: AudioNode;
    bufferSize: number;
    featureExtractors: string[];
    callback: (features: Partial<MeydaFeaturesObject>) => void;
  }) => MeydaAnalyzerHandle;
}

export default function TimbreMatcher({ locked = false }: Props) {
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [measurement, setMeasurement] = useState<VoiceMeasurement | null>(null);
  /**
   * MANDATORY, explicitly chosen by the student BEFORE recording — never
   * auto-detected. F0-threshold auto-detection is precisely what used to
   * mislabel low male voices and match them against tenors.
   */
  const [gender, setGender] = useState<TimbreGender | null>(null);
  const [activeGenre, setActiveGenre] = useState<Genre>("Pop");

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const meydaSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const pitchAnalyserRef = useRef<AnalyserNode | null>(null);
  const analyzerRef = useRef<MeydaAnalyzerHandle | null>(null);
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
      pitchAnalyserRef.current?.disconnect();
    } catch {
      /* already disconnected */
    }
    pitchAnalyserRef.current = null;
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
    accumulator: VoiceMeasurementAccumulator,
    analysisId: number
  ) => {
    try {
      if (audioBuffer.duration < 0.8 || audioBuffer.length < 8000) {
        throw new Error("Запись слишком короткая — спойте ещё раз");
      }

      // "Is there a voice at all" guard (lib/vocal-presence.ts) — rejects real
      // silence / knocks, tuned permissively so quiet or hoarse singing still
      // passes.
      const presence = assessVocalPresence(audioBuffer);
      if (!presence.ok) {
        throw new Error(presence.reason || "Голос не обнаружен");
      }
      if (isStale(analysisId)) return;

      setStage("matching");

      const result = accumulator.finalize();
      if (!result) {
        throw new Error(
          "Звук не распознан, пойте громче — не хватило голосового сигнала для анализа тембра."
        );
      }
      if (isStale(analysisId)) return;

      setMeasurement(result);
      setActiveGenre("Pop");
      setStage("done");
    } catch (err) {
      if (isStale(analysisId)) return;
      setMeasurement(null);
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
    if (busyRef.current || stage === "recording" || !gender) return;
    busyRef.current = true;

    const analysisId = analysisIdRef.current + 1;
    analysisIdRef.current = analysisId;

    setError("");
    setMeasurement(null);
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
      // all" guard (assessVocalPresence) and the duration check.
      const pcmSession = startContextPcmCapture(ctx, stream, ctx.currentTime);
      pcmSessionRef.current = pcmSession;

      // Independent MediaStreamSource tap on the same context for Meyda —
      // multiple taps on one context/stream is standard and doesn't affect the mic.
      const meydaSource = ctx.createMediaStreamSource(stream);
      meydaSourceRef.current = meydaSource;

      const accumulator = new VoiceMeasurementAccumulator(
        ctx.sampleRate,
        ANALYSIS_BUFFER_SIZE
      );

      // Single YIN detector instance reused across the whole take — cheaper
      // than rebuilding pitchfinder's internal state every frame, and it is
      // the SAME tested primitive the pitch tuner uses (lib/pitch.ts).
      const yinDetector: PitchDetectorFn = createYinDetector(ctx.sampleRate);

      // Raw (non-windowed) time-domain tap for YIN, via a plain AnalyserNode
      // on the SAME source. IMPORTANT: Meyda's `buffer` feature is NOT raw
      // PCM — Meyda applies its windowing function (Hanning by default) to
      // every frame before computing ANY feature, including the `buffer`
      // pseudo-feature, which just hands back that already-windowed signal
      // (tapered to ~0 at both edges). Feeding a Hanning-windowed buffer into
      // YIN's difference function corrupts exactly the periodicity structure
      // it depends on, which made YIN return null on almost every frame of
      // real singing. AnalyserNode.getFloatTimeDomainData() returns genuine
      // unprocessed samples, decoupled from whatever Meyda does internally.
      const pitchAnalyser = ctx.createAnalyser();
      pitchAnalyser.fftSize = PITCH_WINDOW_SIZE;
      meydaSource.connect(pitchAnalyser);
      pitchAnalyserRef.current = pitchAnalyser;
      const rawTimeDomain = new Float32Array(PITCH_WINDOW_SIZE);

      const createMeydaAnalyzer = await loadMeydaCreate();
      const analyzer = createMeydaAnalyzer({
        audioContext: ctx,
        source: meydaSource,
        bufferSize: ANALYSIS_BUFFER_SIZE,
        featureExtractors: ["spectralCentroid", "spectralFlatness", "zcr", "rms"],
        callback: (features: Partial<MeydaFeaturesObject>) => {
          // YIN runs on raw PCM tapped straight from the AnalyserNode above —
          // NOT on Meyda's (windowed) features — over roughly the same time
          // window as this Meyda callback.
          pitchAnalyser.getFloatTimeDomainData(rawTimeDomain);
          const f0 = yinDetector(rawTimeDomain);
          accumulator.addFrame(
            features.spectralCentroid,
            features.rms,
            f0,
            features.spectralFlatness,
            features.zcr
          );
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
            pitchAnalyser.disconnect();
            meydaSource.disconnect();
          } catch {
            /* already disconnected */
          }
          const audioBuffer = await pcmSession.stop();
          stream.getTracks().forEach((t) => t.stop());
          if (streamRef.current === stream) streamRef.current = null;
          pcmSessionRef.current = null;
          if (analyzerRef.current === analyzer) analyzerRef.current = null;
          if (pitchAnalyserRef.current === pitchAnalyser) pitchAnalyserRef.current = null;
          if (meydaSourceRef.current === meydaSource) meydaSourceRef.current = null;
          if (audioContextRef.current === ctx) audioContextRef.current = null;
          await ctx.close().catch(() => undefined);

          await finalize(audioBuffer, accumulator, analysisId);
        } catch (err) {
          if (isStale(analysisId)) return;
          cleanupAudio();
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
    } catch (err) {
      setError(
        err instanceof Error && /тембра/i.test(err.message)
          ? err.message
          : "Разрешите доступ к микрофону"
      );
      cleanupAudio();
      busyRef.current = false;
      setStage("idle");
    }
  };

  const stopEarly = () => {
    void endCaptureRef.current?.();
  };

  /**
   * Vocal Fach from the take's median F0 + the gender the student selected.
   * Pure math over the already-stored medians, so flipping the gender toggle
   * after the fact instantly reclassifies and re-matches with no re-recording.
   */
  const fach = useMemo(
    () => (measurement && gender ? classifyVocalFach(gender, measurement.medianHz) : null),
    [measurement, gender]
  );

  /**
   * STRICT (gender × vocalFach) filter lives entirely inside
   * `matchCelebrities` (lib/celebritiesDB.ts) — it only ever scores candidates
   * whose gender AND fach both equal the arguments passed here, with no
   * fallback pool, so a bass can never surface a tenor. Ranking is 3-D
   * Euclidean distance on [timbreWeight, airiness, raspiness].
   */
  const matches: CelebrityMatch[] = useMemo(() => {
    if (!measurement || !gender || !fach) return [];
    return matchCelebrities(gender, fach, {
      timbreWeight: measurement.userWeight,
      airiness: measurement.userAiriness,
      raspiness: measurement.userRaspiness,
    });
  }, [measurement, gender, fach]);

  const grouped = useMemo(() => groupMatchesByGenre(matches, 5), [matches]);

  const visibleGenres = useMemo(
    () => CELEBRITY_GENRES.filter((genre) => (grouped[genre]?.length ?? 0) > 0),
    [grouped]
  );

  const shownGenre: Genre =
    visibleGenres.includes(activeGenre) ? activeGenre : (visibleGenres[0] ?? "Pop");

  const topMatch = matches[0];
  const isBusy = stage === "recording" || stage === "extracting" || stage === "matching";

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
            Спойте 10 секунд — мы измерим тесситуру (медианная F0), вес
            тембра, воздух и расщепление и подберём звёзд с тем же типом
            голоса из базы 100 исполнителей.
          </p>
        </div>
      </div>

      {/* Пол выбирается ВРУЧНУЮ до записи — от него напрямую зависят пороги
          классификации Vocal Fach (165 Гц для мужчин, 220 Гц для женщин). */}
      <div className="mt-5 rounded-2xl bg-studio-bg/80 p-3 ring-1 ring-studio-border">
        <p className="mb-2 text-sm font-medium text-studio-text">Ваш пол:</p>
        <div className="flex gap-1 rounded-xl bg-studio-card p-1">
          {GENDERS.map((g) => (
            <button
              key={g}
              type="button"
              disabled={isBusy}
              onClick={() => setGender(g)}
              aria-pressed={gender === g}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                gender === g
                  ? "bg-studio-accent/20 text-studio-accent-light ring-1 ring-studio-accent/40"
                  : "text-studio-muted hover:text-studio-text"
              }`}
            >
              {GENDER_LABEL_RU[g]}
            </button>
          ))}
        </div>
        {!gender && (
          <p className="mt-2 text-xs text-amber-300">
            Выберите пол — без него нельзя определить тип голоса.
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
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
          <Button
            fullWidth
            size="lg"
            disabled={!gender}
            onClick={() => void start()}
          >
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
              ? "Измеряем высоту тона и тембр…"
              : "Подбираем звёзд с вашим типом голоса…"}
          </p>
          <p className="max-w-xs text-sm text-studio-muted">
            Это займёт долю секунды — не закрывайте страницу.
          </p>
        </div>
      )}

      {stage === "done" && measurement && fach && (
        <div className="mt-6 space-y-6">
          <div className="rounded-2xl bg-studio-bg/80 px-4 py-4 text-center ring-1 ring-studio-border">
            <p className="text-lg leading-snug text-studio-text">
              Анализ завершён. Ваш тип голоса:{" "}
              <span className="font-semibold text-pink-300">
                {VOCAL_FACH_LABEL_RU[fach]}
              </span>
              . Медианная частота:{" "}
              <span className="font-semibold text-studio-accent-light tabular-nums">
                {Math.round(measurement.medianHz)} Hz
              </span>
              .
            </p>
            <p className="mt-2 text-sm text-studio-muted">
              Тембр {measurement.userWeight}/100 · Воздух{" "}
              {measurement.userAiriness}/100 · Расщепление{" "}
              {measurement.userRaspiness}/100
            </p>
            {topMatch && (
              <p className="mt-3 text-base text-studio-text">
                Абсолютный мэтч:{" "}
                <span className="font-semibold text-pink-300">
                  {topMatch.celebrity.name}
                </span>{" "}
                (
                <span className="font-semibold text-pink-300 tabular-nums">
                  {topMatch.percent}%
                </span>
                )
              </p>
            )}
          </div>

          <VoiceRadarChart
            user={{
              timbreWeight: measurement.userWeight,
              airiness: measurement.userAiriness,
              raspiness: measurement.userRaspiness,
            }}
            match={
              topMatch
                ? {
                    name: topMatch.celebrity.name,
                    timbreWeight: topMatch.celebrity.timbreWeight,
                    airiness: topMatch.celebrity.airiness,
                    raspiness: topMatch.celebrity.raspiness,
                  }
                : null
            }
          />

          {visibleGenres.length === 0 ? (
            <p className="rounded-2xl bg-studio-card px-4 py-6 text-center text-sm text-studio-muted ring-1 ring-studio-border">
              Нет исполнителей с типом голоса «{VOCAL_FACH_LABEL_RU[fach]}».
            </p>
          ) : (
            <div>
              <div className="mb-3 flex flex-wrap gap-1 rounded-2xl bg-studio-bg/60 p-1 ring-1 ring-studio-border">
                {visibleGenres.map((genre) => {
                  const count = grouped[genre]?.length ?? 0;
                  return (
                    <button
                      key={genre}
                      type="button"
                      onClick={() => setActiveGenre(genre)}
                      className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition ${
                        shownGenre === genre
                          ? "bg-studio-accent/20 text-studio-accent-light"
                          : "text-studio-muted hover:text-studio-text"
                      }`}
                    >
                      {GENRE_LABEL_RU[genre]}
                      <span className="ml-1.5 tabular-nums opacity-70">
                        ({count})
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="rounded-2xl bg-studio-card p-3.5 ring-1 ring-studio-border sm:p-4">
                <h3 className="mb-3 text-sm font-semibold text-studio-text">
                  Топ совпадений — {GENRE_LABEL_RU[shownGenre]}
                </h3>
                <ul className="space-y-4">
                  {(grouped[shownGenre] ?? []).map((m, i) => (
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
            </div>
          )}

          <p className="text-center text-xs text-studio-muted">
            Ошиблись с полом? Переключите его выше — результат пересчитается
            мгновенно, перезаписывать голос не нужно.
          </p>
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
