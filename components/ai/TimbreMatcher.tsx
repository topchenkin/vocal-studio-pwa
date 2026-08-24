"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, ShieldCheck, Sparkles, Square } from "lucide-react";
import Button from "@/components/ui/Button";
import {
  CELEBRITY_GENRES,
  CELEBRITY_REGIONS,
  DECADE_LABEL_RU,
  GENRE_LABEL_RU,
  REGION_LABEL_RU,
  VOCAL_FACH_LABEL_RU,
  classifyVocalFach,
  type CelebrityProfile,
  type CelebrityRegion,
  type Genre,
} from "@/lib/celebritiesDB";
import {
  COLOUR_LABEL_RU,
  PITCH_HEIGHT_LABEL_RU,
  RASP_LABEL_RU,
  deriveVocalArchetype,
  rankCelebrityCandidates,
  selectArchetypeRepresentatives,
} from "@/lib/vocal-archetype";
import {
  mapFlatnessToRasp,
  type TimbreGender,
  type VoiceMeasurement,
} from "@/lib/timbre-features";
import { analyzeVoiceBuffer } from "@/lib/analyze-voice-buffer";
import { assessVocalPresence } from "@/lib/vocal-presence";
import {
  startContextPcmCapture,
  type PcmCaptureSession,
} from "@/lib/pcm-capture";
import { getSingingMicStream } from "@/lib/mic-audio";
import { releaseIosCapture } from "@/lib/ios-audio-session";

const RECORD_MS = 10_000;
const REPRESENTATIVES_PER_GENRE = 5;
let nextAnalysisId = 0;

type Stage = "idle" | "recording" | "extracting" | "done";
type Props = { locked?: boolean };

const GENDERS: TimbreGender[] = ["male", "female"];
const GENDER_LABEL_RU: Record<TimbreGender, string> = {
  male: "Мужской",
  female: "Женский",
};

function pcmFingerprint(audioBuffer: AudioBuffer): string {
  const samples = audioBuffer.getChannelData(0);
  const stride = Math.max(1, Math.floor(samples.length / 2048));
  let hash = 2166136261;
  for (let index = 0; index < samples.length; index += stride) {
    const quantized = Math.round((samples[index] ?? 0) * 32767);
    hash ^= quantized & 0xffff;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export default function TimbreMatcher({ locked = false }: Props) {
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [measurement, setMeasurement] = useState<VoiceMeasurement | null>(null);
  const [activeTakeId, setActiveTakeId] = useState<number | null>(null);
  const [gender, setGender] = useState<TimbreGender | null>(null);
  const [regionTab, setRegionTab] =
    useState<CelebrityRegion>("russian");

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const pcmSessionRef = useRef<PcmCaptureSession | null>(null);
  const timersRef = useRef<number[]>([]);
  const busyRef = useRef(false);
  const analysisIdRef = useRef(0);
  const finishingRef = useRef(false);
  const endCaptureRef = useRef<(() => Promise<void>) | null>(null);

  const cleanupAudio = async () => {
    timersRef.current.forEach((id) => window.clearInterval(id));
    timersRef.current = [];
    endCaptureRef.current = null;
    finishingRef.current = false;
    try {
      pcmSessionRef.current?.abort();
    } catch {
      // Capture may already be stopped.
    }
    pcmSessionRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    releaseIosCapture(streamRef.current);
    streamRef.current = null;
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== "closed") {
      await context.close().catch(() => undefined);
    }
  };

  useEffect(
    () => () => {
      analysisIdRef.current = ++nextAnalysisId;
      void cleanupAudio();
    },
    []
  );

  const isStale = (id: number) => id !== analysisIdRef.current;

  const finalize = async (audioBuffer: AudioBuffer, analysisId: number) => {
    try {
      if (audioBuffer.duration < 0.8 || audioBuffer.length < 8000) {
        throw new Error("Запись слишком короткая — спойте ещё раз");
      }

      const presence = assessVocalPresence(audioBuffer);
      if (!presence.ok) {
        throw new Error(presence.reason || "Голос не обнаружен");
      }
      if (isStale(analysisId)) return;

      setStage("extracting");
      const result = await analyzeVoiceBuffer(audioBuffer);
      if (isStale(analysisId)) return;
      if (!result) {
        throw new Error(
          "Слишком мало устойчивого голосового сигнала. Спойте пару фраз ближе к микрофону обычным голосом."
        );
      }

      console.info("[DSP_DEBUG]", {
        analysisId,
        pcm: {
          fingerprint: pcmFingerprint(audioBuffer),
          sampleRate: audioBuffer.sampleRate,
          samples: audioBuffer.length,
          durationSeconds: audioBuffer.duration,
        },
        centroidHz: result.medianCentroidHz,
        spectralFlatness: result.medianFlatness,
        normalized: {
          brightness: result.userWeight,
          rasp: result.userRaspiness,
        },
        f0Hz: {
          median: result.medianHz,
          p25: result.p25Hz,
          p75: result.p75Hz,
        },
        rmsGate: {
          noiseFloor: result.noiseFloorRms,
          threshold: result.noiseGateRms,
          voicedMedian: result.medianVoicedRms,
        },
        frames: {
          valid: result.frameCount,
          pitched: result.pitchedFrameCount,
          total: result.totalFrameCount,
        },
      });

      const rasp = mapFlatnessToRasp(result.medianFlatness);
      const fach = classifyVocalFach(gender!, result.medianHz);
      const sortedForLog = rankCelebrityCandidates({
        gender: gender!,
        fach,
        userWeight: result.userWeight,
        userRaspiness: result.userRaspiness,
      })
        .slice(0, 20)
        .map(({ star, distance }) => ({
          name: star.name,
          timbreWeight: star.timbreWeight,
          raspiness: star.raspiness,
          distance,
          region: star.region,
          decade: star.decade,
          genre: star.genre,
        }));
      console.log(
        "[DSP] Median Flatness:",
        result.medianFlatness,
        "-> Расщепление:",
        rasp.label
      );
      console.log("[DSP] Sorted Stars Distance:", sortedForLog);

      setMeasurement(result);
      setStage("done");
    } catch (caught) {
      if (isStale(analysisId)) return;
      setMeasurement(null);
      setError(
        caught instanceof Error
          ? caught.message
          : "Не удалось проанализировать запись"
      );
      setStage("idle");
    } finally {
      if (!isStale(analysisId)) busyRef.current = false;
    }
  };

  const start = async () => {
    if (busyRef.current || stage === "recording" || !gender) return;
    busyRef.current = true;
    const analysisId = ++nextAnalysisId;
    analysisIdRef.current = analysisId;
    setActiveTakeId(analysisId);
    setError("");
    setMeasurement(null);
    setProgress(0);

    try {
      await cleanupAudio();
      if (isStale(analysisId)) return;
      const stream = await getSingingMicStream();
      if (isStale(analysisId)) {
        stream.getTracks().forEach((track) => track.stop());
        releaseIosCapture(stream);
        busyRef.current = false;
        return;
      }
      streamRef.current = stream;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const context = new AudioCtx();
      if (context.state === "suspended") await context.resume();
      audioContextRef.current = context;

      const pcmSession = startContextPcmCapture(
        context,
        stream,
        context.currentTime,
        () => !isStale(analysisId)
      );
      pcmSessionRef.current = pcmSession;
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
          const audioBuffer = await pcmSession.stop();
          stream.getTracks().forEach((track) => track.stop());
          if (streamRef.current === stream) streamRef.current = null;
          pcmSessionRef.current = null;
          if (audioContextRef.current === context) audioContextRef.current = null;
          await context.close().catch(() => undefined);
          await finalize(audioBuffer, analysisId);
        } catch (caught) {
          if (isStale(analysisId)) return;
          cleanupAudio();
          setError(
            caught instanceof Error
              ? caught.message
              : "Не удалось обработать запись"
          );
          setStage("idle");
          busyRef.current = false;
        }
      };

      const started = performance.now();
      const progressTimer = window.setInterval(() => {
        if (isStale(analysisId)) return;
        setProgress(
          Math.min(100, ((performance.now() - started) / RECORD_MS) * 100)
        );
      }, 100);
      const finishTimer = window.setTimeout(() => {
        if (isStale(analysisId)) return;
        void endCapture();
      }, RECORD_MS);
      timersRef.current = [progressTimer, finishTimer];
      endCaptureRef.current = endCapture;
    } catch {
      if (isStale(analysisId)) return;
      setError("Не удалось включить микрофон");
      await cleanupAudio();
      busyRef.current = false;
      setStage("idle");
    }
  };

  const archetype = useMemo(
    () =>
      measurement && gender
        ? deriveVocalArchetype(
            gender,
            measurement.medianHz,
            measurement.userWeight,
            measurement.userRaspiness
          )
        : null,
    [gender, measurement]
  );

  const representatives = useMemo(() => {
    if (!gender || !archetype) {
      return {} as Partial<Record<Genre, CelebrityProfile[]>>;
    }
    return Object.fromEntries(
      CELEBRITY_GENRES.map((genre) => [
        genre,
        selectArchetypeRepresentatives({
          gender,
          fach: archetype.fach,
          userWeight: measurement!.userWeight,
          userRaspiness: measurement!.userRaspiness,
          region: regionTab,
          genre,
          limit: REPRESENTATIVES_PER_GENRE,
        }),
      ])
    ) as Partial<Record<Genre, CelebrityProfile[]>>;
  }, [archetype, gender, measurement, regionTab]);

  const isBusy = stage === "recording" || stage === "extracting";

  if (locked) {
    return (
      <LockedCard
        title="Вокальный архетип"
        text="Спойте десять секунд — инструмент локально определит ориентировочный тип, окрас и текстуру голоса. Доступно на Premium."
      />
    );
  }

  return (
    <section className="rounded-3xl bg-studio-surface p-4 ring-1 ring-studio-border sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-pink-500/10">
          <Sparkles className="h-5 w-5 text-pink-300" />
        </div>
        <div>
          <h2 className="font-display text-2xl font-semibold">
            Вокальный архетип
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-studio-muted">
            Выберите пол и спойте десять секунд обычным голосом. Анализ
            выполняется на устройстве после записи; аудио никуда не отправляется.
          </p>
        </div>
      </div>

      <div className="mt-5 rounded-2xl bg-studio-bg/80 p-3 ring-1 ring-studio-border">
        <p className="mb-2 text-sm font-medium text-studio-text">Ваш пол:</p>
        <div className="flex gap-1 rounded-xl bg-studio-card p-1">
          {GENDERS.map((item) => (
            <button
              key={item}
              type="button"
              disabled={isBusy}
              onClick={() => setGender(item)}
              aria-pressed={gender === item}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                gender === item
                  ? "bg-studio-accent/20 text-studio-accent-light ring-1 ring-studio-accent/40"
                  : "text-studio-muted hover:text-studio-text"
              }`}
            >
              {GENDER_LABEL_RU[item]}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-studio-muted">
          Пол нужен только для выбора диапазонов. После анализа его можно
          переключить — результат пересчитается без новой записи.
        </p>
      </div>

      <div className="mt-4">
        {stage === "recording" ? (
          <Button fullWidth size="lg" variant="danger" onClick={() => void endCaptureRef.current?.()}>
            <Square className="h-4 w-4 fill-current" />
            Стоп · {Math.round(progress)}%
          </Button>
        ) : stage === "extracting" ? (
          <Button fullWidth size="lg" disabled>
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
            Анализируем на устройстве…
          </Button>
        ) : (
          <Button fullWidth size="lg" disabled={!gender} onClick={() => void start()}>
            <Mic className="h-5 w-5" />
            Спеть 10 секунд
          </Button>
        )}
      </div>

      {stage === "recording" && (
        <div className="mt-4">
          <p className="mb-2 text-center text-xs text-studio-muted">
            Записывается дубль №{activeTakeId}
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-studio-bg">
            <div
              className="h-full rounded-full bg-gradient-to-r from-pink-500 to-studio-accent transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {stage === "extracting" && (
        <div className="mt-5 rounded-2xl bg-studio-bg/80 px-4 py-7 text-center ring-1 ring-studio-border">
          <p className="font-medium text-studio-text">Считаем параметры голоса…</p>
          <p className="mt-1 text-sm text-studio-muted">
            Дубль №{activeTakeId}: Pitchfinder/YIN и Meyda обрабатывают свежий
            PCM локально.
          </p>
        </div>
      )}

      {stage === "done" && measurement && archetype && gender && (
        <div className="mt-6 space-y-5">
          <div className="rounded-2xl bg-gradient-to-br from-pink-500/10 to-studio-accent/10 p-5 ring-1 ring-pink-400/25">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-pink-300">
              Ваш вокальный архетип:
            </p>
            <h3 className="mt-2 font-display text-2xl font-semibold text-studio-text sm:text-3xl">
              {archetype.name}
            </h3>
            <p className="mt-2 text-sm text-studio-muted">
              Ориентировочная интерпретация по дублю №{activeTakeId}
            </p>
          </div>

          <div className="rounded-2xl bg-studio-card p-4 ring-1 ring-studio-border">
            <h3 className="font-display text-lg font-semibold text-studio-text">
              Характеристики вашего тембра
            </h3>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <Metric label="Высота" value={PITCH_HEIGHT_LABEL_RU[archetype.pitch]} />
              <Metric label="Окрас" value={COLOUR_LABEL_RU[archetype.brightness]} />
              <Metric label="Текстура" value={RASP_LABEL_RU[archetype.rasp]} />
              <Metric label="Ориентировочный тип" value={VOCAL_FACH_LABEL_RU[archetype.fach]} />
              <Metric label="Медианная высота" value={`${Math.round(measurement.medianHz)} Гц`} />
            </dl>
          </div>

          <div>
            <h3 className="font-display text-xl font-semibold text-studio-text">
              Представители этого архетипа
            </h3>
            <p className="mt-1 text-sm text-studio-muted">
              Справочные примеры того же пола и типа голоса, не результаты
              идентификации или сравнения личности.
            </p>
          </div>

          <div className="flex gap-1 rounded-xl bg-studio-card p-1 ring-1 ring-studio-border">
            {CELEBRITY_REGIONS.map((region) => (
              <button
                key={region}
                type="button"
                onClick={() => setRegionTab(region)}
                aria-pressed={regionTab === region}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  regionTab === region
                    ? "bg-studio-accent/20 text-studio-accent-light ring-1 ring-studio-accent/40"
                    : "text-studio-muted hover:text-studio-text"
                }`}
              >
                {REGION_LABEL_RU[region]}
              </button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {CELEBRITY_GENRES.map((genre) => (
              <RepresentativeList
                key={genre}
                genre={genre}
                representatives={representatives[genre] ?? []}
              />
            ))}
          </div>

          <div className="flex gap-2 rounded-2xl bg-studio-bg/80 p-3 text-xs leading-relaxed text-studio-muted ring-1 ring-studio-border">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
            <p>
              Образовательная интерпретация одной 10-секундной записи. Это не
              биометрическая идентификация, медицинская диагностика или строгая
              классификация классического Fach. Аудио остаётся на устройстве.
            </p>
          </div>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-studio-bg/70 px-3 py-3">
      <dt className="text-xs text-studio-muted">{label}</dt>
      <dd className="mt-1 font-medium text-studio-text">{value}</dd>
    </div>
  );
}

function RepresentativeList({
  genre,
  representatives,
}: {
  genre: Genre;
  representatives: CelebrityProfile[];
}) {
  return (
    <section className="rounded-2xl bg-studio-card p-4 ring-1 ring-studio-border">
      <h4 className="font-semibold text-studio-text">{GENRE_LABEL_RU[genre]}</h4>
      {representatives.length === 0 ? (
        <p className="mt-3 text-sm text-studio-muted">
          В базе пока нет представителей этой категории.
        </p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {representatives.map((star) => (
            <li key={star.id} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-studio-text">{star.name}</span>
              <span className="shrink-0 text-xs text-studio-muted">
                {DECADE_LABEL_RU[star.decade]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LockedCard({ title, text }: { title: string; text: string }) {
  return (
    <section className="rounded-3xl bg-studio-surface p-6 ring-1 ring-studio-border">
      <h2 className="font-display text-2xl font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-studio-muted">{text}</p>
    </section>
  );
}
