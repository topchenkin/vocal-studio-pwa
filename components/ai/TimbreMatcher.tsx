"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, Square, Stars } from "lucide-react";
import Button from "@/components/ui/Button";
import {
  CELEBRITY_DECADES,
  CELEBRITY_GENRES,
  CELEBRITY_REGIONS,
  DECADE_LABEL_RU,
  FACH_MISMATCH_SIMILARITY,
  GENRE_LABEL_RU,
  MIN_DISPLAY_PERCENT,
  RECALIBRATION_CAP_PERCENT,
  RECALIBRATION_TARGET_PERCENT,
  REGION_LABEL_RU,
  VOCAL_FACH_LABEL_RU,
  classifyVocalFach,
  groupMatchesByDecadeAndGenre,
  matchCelebrities,
  type CelebrityMatch,
  type CelebrityRegion,
  type Genre,
} from "@/lib/celebritiesDB";
import {
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

type Stage = "idle" | "recording" | "extracting" | "matching" | "done";

type Props = { locked?: boolean };

const GENDERS: TimbreGender[] = ["male", "female"];

const GENDER_LABEL_RU: Record<TimbreGender, string> = {
  male: "Мужской",
  female: "Женский",
};

export default function TimbreMatcher({ locked = false }: Props) {
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [measurement, setMeasurement] = useState<VoiceMeasurement | null>(null);
  /**
   * MANDATORY, explicitly chosen BEFORE recording — never auto-detected.
   * Filters the celebrity pool to this gender only.
   */
  const [gender, setGender] = useState<TimbreGender | null>(null);
  /** Results tab: Russian vs Western — never mixed in one list. */
  const [regionTab, setRegionTab] = useState<CelebrityRegion>("russian");

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const pcmSessionRef = useRef<PcmCaptureSession | null>(null);
  const timersRef = useRef<number[]>([]);
  const busyRef = useRef(false);
  const analysisIdRef = useRef(0);
  const finishingRef = useRef(false);
  const endCaptureRef = useRef<(() => Promise<void>) | null>(null);

  const cleanupAudio = () => {
    timersRef.current.forEach((id) => window.clearInterval(id));
    timersRef.current = [];
    try {
      pcmSessionRef.current?.abort();
    } catch {
      /* already aborted */
    }
    pcmSessionRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    releaseIosCapture(streamRef.current);
    streamRef.current = null;
    const ctx = audioContextRef.current;
    audioContextRef.current = null;
    if (ctx && ctx.state !== "closed") {
      void ctx.close().catch(() => undefined);
    }
  };

  useEffect(() => () => cleanupAudio(), []);

  const isStale = (id: number) => id !== analysisIdRef.current;

  const finalize = async (audioBuffer: AudioBuffer, analysisId: number) => {
    try {
      if (audioBuffer.duration < 0.8 || audioBuffer.length < 8000) {
        throw new Error("Запись слишком короткая — спойте ещё раз");
      }

      // Extreme silence / knocks only — quiet normal singing must pass.
      const presence = assessVocalPresence(audioBuffer);
      if (!presence.ok) {
        throw new Error(presence.reason || "Голос не обнаружен");
      }
      if (isStale(analysisId)) return;

      setStage("extracting");
      // Careful offline pass over the full PCM (meyda + YIN), with UI yields.
      const result = await analyzeVoiceBuffer(audioBuffer);
      if (isStale(analysisId)) return;

      if (!result) {
        throw new Error(
          "Слишком мало голосового сигнала — спойте пару фраз обычным голосом ближе к микрофону (кричать не нужно)."
        );
      }

      setStage("matching");
      // Let the matching stage paint before the sync rank.
      await new Promise((r) => setTimeout(r, 40));
      if (isStale(analysisId)) return;

      setMeasurement(result);
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
    setProgress(0);

    try {
      cleanupAudio();
      const stream = await getSingingMicStream();
      if (isStale(analysisId)) {
        stream.getTracks().forEach((t) => t.stop());
        releaseIosCapture(stream);
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

      const pcmSession = startContextPcmCapture(ctx, stream, ctx.currentTime);
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
          stream.getTracks().forEach((t) => t.stop());
          if (streamRef.current === stream) streamRef.current = null;
          pcmSessionRef.current = null;
          if (audioContextRef.current === ctx) audioContextRef.current = null;
          await ctx.close().catch(() => undefined);

          await finalize(audioBuffer, analysisId);
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
    } catch {
      setError("Не удалось включить микрофон");
      cleanupAudio();
      busyRef.current = false;
      setStage("idle");
    }
  };

  const stopEarly = () => {
    void endCaptureRef.current?.();
  };

  /**
   * Fach is informational + soft prior in ranking — NOT a hard DB filter.
   * Flipping gender after the take re-matches the full gender pool instantly.
   */
  const fach = useMemo(
    () => (measurement && gender ? classifyVocalFach(gender, measurement.medianHz) : null),
    [measurement, gender]
  );

  const matches: CelebrityMatch[] = useMemo(() => {
    if (!measurement || !gender) return [];
    return matchCelebrities(
      gender,
      {
        timbreWeight: measurement.userWeight,
        airiness: measurement.userAiriness,
        raspiness: measurement.userRaspiness,
        tessituraSpan: measurement.tessituraSpan,
      },
      { userFach: fach }
    );
  }, [measurement, gender, fach]);

  const regionMatches = useMemo(
    () => matches.filter((m) => m.celebrity.region === regionTab),
    [matches, regionTab]
  );

  const groupedByDecade = useMemo(
    () => groupMatchesByDecadeAndGenre(regionMatches, 5, MIN_DISPLAY_PERCENT),
    [regionMatches]
  );

  const visibleDecades = useMemo(
    () =>
      CELEBRITY_DECADES.filter((decade) => {
        const genres = groupedByDecade[decade];
        if (!genres) return false;
        return CELEBRITY_GENRES.some((genre) => (genres[genre]?.length ?? 0) > 0);
      }),
    [groupedByDecade]
  );

  const regionCounts = useMemo(() => {
    const counts: Record<CelebrityRegion, number> = { russian: 0, western: 0 };
    for (const m of matches) {
      if (m.percent >= MIN_DISPLAY_PERCENT) counts[m.celebrity.region] += 1;
    }
    return counts;
  }, [matches]);

  const topMatch =
    matches[0] && matches[0].percent >= MIN_DISPLAY_PERCENT
      ? matches[0]
      : matches[0] ?? null;
  const bestRawPercent = matches.reduce(
    (m, x) => Math.max(m, x.rawPercent),
    0
  );
  const fachAdjustedRaw = (m: CelebrityMatch) =>
    m.fachMismatch
      ? Math.round(m.rawPercent * FACH_MISMATCH_SIMILARITY)
      : m.rawPercent;
  const recalibrated = matches.some(
    (m) => m.percent > fachAdjustedRaw(m) + 1
  );
  const isBusy = stage === "recording" || stage === "extracting" || stage === "matching";

  if (locked) {
    return (
      <LockedCard
        title="Звёздный двойник"
        text="Спойте десять секунд — Звёздный двойник найдёт, чей голос звучит как ваш. Тип голоса, совпадения с исполнителями и момент, после которого хочется петь ещё. Доступно на Premium."
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
            Звёздный двойник
          </h2>
          <p className="mt-1 text-sm text-studio-muted">
            Выберите пол, спойте десять секунд обычным голосом — после записи
            мы разберём тембр и покажем ближайших исполнителей по эпохам и
            жанрам. Кричать не нужно.
          </p>
        </div>
      </div>

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
            Выберите пол — база сразу сузится только до вашего пола.
          </p>
        )}
        <p className="mt-2 text-xs leading-relaxed text-studio-muted">
          Хотите увидеть, на кого из исполнителей другого пола похож ваш голос?
          Выберите противоположный пол — после записи совпадения пересчитаются
          сразу, петь заново не нужно.
        </p>
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
              ? "Считаем параметры голоса…"
              : "Подбираем исполнителей…"}
          </p>
          <p className="max-w-xs text-sm text-studio-muted">
            Анализ идёт после записи — это займёт несколько секунд, не
            закрывайте страницу.
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
              {measurement.userRaspiness}/100 · Ширина тесситуры{" "}
              {measurement.tessituraSpan}/100
            </p>
            {topMatch && (
              <p className="mt-3 text-base text-studio-text">
                Ближайший двойник:{" "}
                <span className="font-semibold text-pink-300">
                  {topMatch.celebrity.name}
                </span>{" "}
                (
                <span className="font-semibold text-pink-300 tabular-nums">
                  {topMatch.percent}%
                </span>
                )
                <span className="text-studio-muted">
                  {" "}
                  · {REGION_LABEL_RU[topMatch.celebrity.region]},{" "}
                  {DECADE_LABEL_RU[topMatch.celebrity.decade]},{" "}
                  {GENRE_LABEL_RU[topMatch.celebrity.genre]}
                </span>
              </p>
            )}
          </div>

          <DebugParamsPanel
            measurement={measurement}
            fach={fach}
            topMatch={topMatch}
            bestRawPercent={bestRawPercent}
            recalibrated={recalibrated}
          />

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
                {regionCounts[region] > 0 ? (
                  <span className="ml-1.5 tabular-nums text-xs opacity-70">
                    ({Math.min(regionCounts[region], 99)})
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          {visibleDecades.length === 0 ? (
            <p className="rounded-2xl bg-studio-card px-4 py-6 text-center text-sm text-studio-muted ring-1 ring-studio-border">
              В разделе «{REGION_LABEL_RU[regionTab]}» пока мало совпадений —
              переключите вкладку или пол выше. База не пустая: попробуйте
              другой регион.
            </p>
          ) : (
            <div className="space-y-4">
              {visibleDecades.map((decade) => {
                const genreGroups = groupedByDecade[decade] ?? {};
                const visibleGenres = CELEBRITY_GENRES.filter(
                  (genre) => (genreGroups[genre]?.length ?? 0) > 0
                );
                if (visibleGenres.length === 0) return null;
                return (
                  <div
                    key={decade}
                    className="rounded-2xl bg-studio-card p-3.5 ring-1 ring-studio-border sm:p-4"
                  >
                    <h3 className="mb-3 font-display text-lg font-semibold text-studio-text">
                      {DECADE_LABEL_RU[decade]}
                    </h3>
                    <div
                      className={`grid gap-5 ${
                        visibleGenres.length > 1 ? "sm:grid-cols-2" : ""
                      }`}
                    >
                      {visibleGenres.map((genre) => (
                        <EraGenreList
                          key={genre}
                          genre={genre}
                          matches={genreGroups[genre] ?? []}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
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

function DebugParamsPanel({
  measurement,
  fach,
  topMatch,
  bestRawPercent,
  recalibrated,
}: {
  measurement: VoiceMeasurement;
  fach: NonNullable<ReturnType<typeof classifyVocalFach>>;
  topMatch: CelebrityMatch | null;
  bestRawPercent: number;
  recalibrated: boolean;
}) {
  const rows: Array<[string, string]> = [
    ["Тембр / яркость (timbreWeight)", `${measurement.userWeight}/100`],
    ["Воздух (airiness)", `${measurement.userAiriness}/100`],
    [
      "HF ratio median / p75",
      `${measurement.medianHfRatio.toFixed(4)} / ${measurement.p75HfRatio.toFixed(4)}`,
    ],
    ["Расщепление / rasp", `${measurement.userRaspiness}/100`],
    ["Ширина тесситуры", `${measurement.tessituraSpan}/100`],
    ["Определённый fach", VOCAL_FACH_LABEL_RU[fach]],
    [
      "Средний F0 / p25 / p75",
      `${Math.round(measurement.medianHz)} / ${Math.round(measurement.p25Hz)} / ${Math.round(measurement.p75Hz)} Hz`,
    ],
    [
      "Кадры: voiced / pitched / HF",
      `${measurement.frameCount} / ${measurement.pitchedFrameCount} / ${measurement.hfFrameCount}`,
    ],
    [
      "Presence / quality",
      measurement.frameCount >= 16 && measurement.pitchedFrameCount >= 12
        ? "ok (достаточно кадров)"
        : "слабо (мало кадров)",
    ],
    [
      "Distance / raw % → после",
      topMatch
        ? `${topMatch.distance.toFixed(1)} / ${topMatch.rawPercent}% → ${topMatch.percent}%${
            topMatch.fachMismatch
              ? ` (fach ×${FACH_MISMATCH_SIMILARITY})`
              : ""
          }`
        : "—",
    ],
    [
      "Пул: лучший raw %",
      `${bestRawPercent}%${
        recalibrated
          ? ` → перекалибровка к ~${RECALIBRATION_TARGET_PERCENT}% (cap ${RECALIBRATION_CAP_PERCENT}%)`
          : " (без перекалибровки)"
      }`,
    ],
  ];

  return (
    <details className="rounded-2xl bg-amber-500/5 px-3 py-3 ring-1 ring-amber-500/30 open:pb-3">
      <summary className="cursor-pointer select-none text-sm font-semibold text-amber-200/90">
        Отладка параметров (временно)
      </summary>
      <dl className="mt-3 space-y-1.5 text-xs text-studio-muted">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-studio-border/40 pb-1.5 last:border-0"
          >
            <dt>{label}</dt>
            <dd className="font-mono tabular-nums text-studio-text">{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function EraGenreList({
  genre,
  matches,
}: {
  genre: Genre;
  matches: CelebrityMatch[];
}) {
  return (
    <div>
      <h4 className="mb-2.5 text-sm font-semibold text-studio-muted">
        {GENRE_LABEL_RU[genre]}
      </h4>
      <ul className="space-y-3">
        {matches.map((m, i) => (
          <li
            key={m.celebrity.id}
            className="flex items-baseline justify-between gap-3 text-sm"
          >
            <span className="min-w-0 text-studio-text">
              <span className="mr-1.5 tabular-nums text-studio-muted">
                {i + 1}.
              </span>
              {m.celebrity.name}
            </span>
            <span className="shrink-0 font-semibold tabular-nums text-pink-300">
              {m.percent}%
            </span>
          </li>
        ))}
      </ul>
    </div>
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
