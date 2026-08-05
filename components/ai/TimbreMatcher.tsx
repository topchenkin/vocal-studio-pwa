"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Sparkles, Square, Stars } from "lucide-react";
import Button from "@/components/ui/Button";
import {
  boostRecognizedArtist,
  matchVoiceByGenres,
  type TimbreMatch,
} from "@/lib/artist-timbre-db";
import { extractVoiceEmbedding } from "@/lib/voice-embed";
import { classifySingingGender } from "@/lib/singing-gender";
import { assessVocalPresence } from "@/lib/vocal-presence";
import { audioBufferToMonoWav16k } from "@/lib/wav-client";
import { startPcmCapture, type PcmCaptureSession } from "@/lib/pcm-capture";
import { getChatSessionToken } from "@/lib/chat-media";
import type { TimbreGender } from "@/lib/timbre-features";

const RECORD_MS = 10_000;

type GenreResults = {
  western: { pop: TimbreMatch[]; rock: TimbreMatch[]; rap: TimbreMatch[] };
  russian: { pop: TimbreMatch[]; rock: TimbreMatch[]; rap: TimbreMatch[] };
  asian: { kpop: TimbreMatch[] };
};

const EMPTY_RESULTS: GenreResults = {
  western: { pop: [], rock: [], rap: [] },
  russian: { pop: [], rock: [], rap: [] },
  asian: { kpop: [] },
};

type Props = { locked?: boolean };

export default function TimbreMatcher({ locked = false }: Props) {
  const [recording, setRecording] = useState(false);
  const [progress, setProgress] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [results, setResults] = useState<GenreResults>(EMPTY_RESULTS);
  const [genderHint, setGenderHint] = useState("");
  const [genderConfidence, setGenderConfidence] = useState("");
  const [genderSource, setGenderSource] = useState("");
  const [genderDebug, setGenderDebug] = useState("");
  const [recognizedTrack, setRecognizedTrack] = useState("");
  const [matchEngine, setMatchEngine] = useState("");
  const [rawTop, setRawTop] = useState<
    Array<{ name: string; percent: number }>
  >([]);

  const streamRef = useRef<MediaStream | null>(null);
  const captureRef = useRef<PcmCaptureSession | null>(null);
  const timersRef = useRef<number[]>([]);
  const busyRef = useRef(false);
  const analysisIdRef = useRef(0);
  const finishingRef = useRef(false);
  const endCaptureRef = useRef<(() => Promise<void>) | null>(null);

  const cleanupMic = () => {
    timersRef.current.forEach((id) => window.clearInterval(id));
    timersRef.current = [];
    captureRef.current?.abort();
    captureRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setRecording(false);
  };

  useEffect(() => () => cleanupMic(), []);

  const hasResults =
    results.western.pop.length > 0 ||
    results.western.rock.length > 0 ||
    results.western.rap.length > 0 ||
    results.russian.pop.length > 0 ||
    results.russian.rock.length > 0 ||
    results.russian.rap.length > 0 ||
    results.asian.kpop.length > 0;

  const isStale = (id: number) => id !== analysisIdRef.current;

  const applyGender = (
    embeddingGender: TimbreGender,
    forced: TimbreGender,
    confidence: "high" | "medium" | "low"
  ) => {
    const genderAxis = forced === "female" ? 0.2 : 0.8;
    return {
      gender: forced,
      genderConfidence: confidence,
      genderAxis,
      vectorPatch: {
        6: genderAxis,
        12: forced === "female" ? 0.35 : 0.65,
        43: forced === "female" ? 0.3 : 0.7,
      } as Record<number, number>,
      embeddingGender,
    };
  };

  const finishWithBuffer = async (audioBuffer: AudioBuffer, analysisId: number) => {
    busyRef.current = true;
    setAnalyzing(true);
    setError("");
    setRecognizedTrack("");
    setGenderDebug("");
    setStatus("Слушаем запись…");
    try {
      if (audioBuffer.duration < 0.8 || audioBuffer.length < 8000) {
        throw new Error("Запись слишком короткая — спойте ещё раз");
      }

      const presence = assessVocalPresence(audioBuffer);
      if (!presence.ok) {
        throw new Error(presence.reason || "Голос не обнаружен");
      }
      if (isStale(analysisId)) return;

      // Local pitch-first gender — authority for thin female / consecutive takes
      const channel = audioBuffer.getChannelData(0);
      const localGender = classifySingingGender(channel, audioBuffer.sampleRate);
      setGenderDebug(localGender.debug);

      setStatus("Изучаем тембр голоса…");
      let embedding = await extractVoiceEmbedding(audioBuffer);
      if (isStale(analysisId)) return;

      // Force embedding gender from singing classifier (not broken formant peaks)
      {
        const patched = applyGender(
          embedding.gender,
          localGender.gender,
          localGender.confidence
        );
        const vector = [...embedding.vector];
        for (const [k, v] of Object.entries(patched.vectorPatch)) {
          vector[Number(k)] = v;
        }
        embedding = {
          ...embedding,
          gender: patched.gender,
          genderConfidence: patched.genderConfidence,
          vector,
          pitchMedianMidi:
            localGender.pitchMedianMidi || embedding.pitchMedianMidi,
        };
      }

      setStatus("Подбираем похожих исполнителей…");
      const wav = audioBufferToMonoWav16k(audioBuffer);
      const token = await getChatSessionToken();
      let recognizedArtist = "";
      let sourceLabel = `локально · ${localGender.debug}`;
      let finalGender = localGender.gender;

      if (localGender.pitchMedianHz > 0 && localGender.pitchMedianHz <= 160) {
        finalGender = "male";
      } else if (
        localGender.pitchMedianHz >= 260 &&
        localGender.pitchFrames >= 6
      ) {
        finalGender = "female";
      }
      embedding = {
        ...embedding,
        gender: finalGender,
        genderConfidence: localGender.confidence,
      };

      if (token) {
        // Optional track ID + gender refine (does not rank artists)
        const genderForm = new FormData();
        genderForm.append(
          "file",
          wav,
          `voice-${analysisId}-${Date.now()}.wav`
        );
        genderForm.append("localGender", finalGender);
        genderForm.append("localPitchHz", String(localGender.pitchMedianHz || 0));
        genderForm.append("localConfidence", localGender.confidence);
        const genderRes = await fetch(
          `/api/ai/analyze-timbre?t=${analysisId}-${Date.now()}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Cache-Control": "no-store",
            },
            body: genderForm,
            cache: "no-store",
          }
        );
        if (isStale(analysisId)) return;
        const genderPayload = (await genderRes.json().catch(() => ({}))) as {
          gender?: "female" | "male";
          recognized?: { artist?: string; title?: string } | null;
        };
        if (genderRes.ok && genderPayload.gender) {
          if (
            localGender.confidence === "low" &&
            !(localGender.pitchMedianHz > 0 && localGender.pitchMedianHz <= 160) &&
            !(localGender.pitchMedianHz >= 260)
          ) {
            finalGender = genderPayload.gender;
            embedding = { ...embedding, gender: finalGender };
          }
        }
        if (genderPayload.recognized?.artist) {
          recognizedArtist = genderPayload.recognized.artist;
          setRecognizedTrack(
            genderPayload.recognized.title
              ? `${genderPayload.recognized.artist} — ${genderPayload.recognized.title}`
              : genderPayload.recognized.artist
          );
        }
      }

      if (isStale(analysisId)) return;

      setGenderSource(sourceLabel);
      setGenderConfidence(
        embedding.genderConfidence === "high"
          ? "высокая уверенность"
          : embedding.genderConfidence === "medium"
            ? "средняя уверенность"
            : "низкая уверенность"
      );
      setGenderHint(
        finalGender === "female"
          ? "женский голос — ищем среди женщин"
          : "мужской голос — ищем среди мужчин"
      );

      // PRIMARY: neural Resemblyzer match via HF Space
      let next: GenreResults = EMPTY_RESULTS;
      let usedNeural = false;

      if (token) {
        setStatus("Сравниваем со звёздами…");
        const nnForm = new FormData();
        nnForm.append(
          "file",
          wav,
          `nn-${analysisId}-${Date.now()}.wav`
        );
        nnForm.append("gender", finalGender);
        const nnRes = await fetch(
          `/api/ai/match-voice?t=${analysisId}-${Date.now()}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Cache-Control": "no-store",
            },
            body: nnForm,
            cache: "no-store",
          }
        );
        if (isStale(analysisId)) return;
        const nnPayload = (await nnRes.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
          engine?: string;
          western?: GenreResults["western"];
          russian?: GenreResults["russian"];
          asian?: GenreResults["asian"];
          rawTop?: Array<{ name: string; percent: number }>;
        };

        if (
          nnRes.ok &&
          nnPayload.western &&
          nnPayload.russian &&
          nnPayload.asian
        ) {
          next = {
            western: nnPayload.western,
            russian: nnPayload.russian,
            asian: nnPayload.asian,
          };
          usedNeural = true;
          setMatchEngine(
            nnPayload.engine
              ? `нейросеть · ${nnPayload.engine}`
              : "нейросеть · resemblyzer"
          );
          setRawTop(nnPayload.rawTop ?? []);
        } else {
          setMatchEngine(
            `упрощённый режим (Space недоступен${nnPayload.code ? `: ${nnPayload.code}` : ""})`
          );
          setRawTop([]);
        }
      } else {
        setMatchEngine("упрощённый режим (нет сессии)");
        setRawTop([]);
      }

      if (!usedNeural) {
        setStatus("Сравниваем со звёздами…");
        next = matchVoiceByGenres(embedding, 5);
      }

      if (recognizedArtist) {
        next.western.pop = boostRecognizedArtist(
          next.western.pop,
          recognizedArtist,
          "western",
          finalGender,
          "pop"
        );
        next.western.rock = boostRecognizedArtist(
          next.western.rock,
          recognizedArtist,
          "western",
          finalGender,
          "rock"
        );
        next.western.rap = boostRecognizedArtist(
          next.western.rap,
          recognizedArtist,
          "western",
          finalGender,
          "rap"
        );
        next.russian.pop = boostRecognizedArtist(
          next.russian.pop,
          recognizedArtist,
          "russian",
          finalGender,
          "pop"
        );
        next.russian.rock = boostRecognizedArtist(
          next.russian.rock,
          recognizedArtist,
          "russian",
          finalGender,
          "rock"
        );
        next.russian.rap = boostRecognizedArtist(
          next.russian.rap,
          recognizedArtist,
          "russian",
          finalGender,
          "rap"
        );
        next.asian.kpop = boostRecognizedArtist(
          next.asian.kpop,
          recognizedArtist,
          "asian",
          finalGender,
          "kpop"
        );
      }

      if (isStale(analysisId)) return;
      setResults(next);
      setStatus("");
    } catch (err) {
      if (isStale(analysisId)) return;
      setResults(EMPTY_RESULTS);
      setGenderHint("");
      setGenderConfidence("");
      setGenderSource("");
      setGenderDebug("");
      setRecognizedTrack("");
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось проанализировать запись"
      );
      setStatus("");
    } finally {
      if (!isStale(analysisId)) {
        busyRef.current = false;
        setAnalyzing(false);
      }
    }
  };

  const start = async () => {
    if (busyRef.current || recording) return;
    busyRef.current = true;

    const analysisId = analysisIdRef.current + 1;
    analysisIdRef.current = analysisId;

    setError("");
    setResults(EMPTY_RESULTS);
    setGenderHint("");
    setGenderConfidence("");
    setGenderSource("");
    setGenderDebug("");
    setRecognizedTrack("");
    setMatchEngine("");
    setRawTop([]);
    setStatus("");
    setProgress(0);

    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Микрофон недоступен");
      busyRef.current = false;
      return;
    }

    try {
      cleanupMic();
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
      const capture = await startPcmCapture(stream);
      captureRef.current = capture;
      finishingRef.current = false;
      setRecording(true);

      const endCapture = async () => {
        if (finishingRef.current) return;
        finishingRef.current = true;
        timersRef.current.forEach((id) => window.clearInterval(id));
        timersRef.current = [];
        setRecording(false);
        setProgress(100);
        setAnalyzing(true);
        setStatus("Готовим запись к анализу…");
        try {
          const buffer = await capture.stop();
          stream.getTracks().forEach((t) => t.stop());
          if (streamRef.current === stream) streamRef.current = null;
          captureRef.current = null;
          await finishWithBuffer(buffer, analysisId);
        } catch {
          setError("Не удалось сохранить запись");
          busyRef.current = false;
          setAnalyzing(false);
          setStatus("");
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
      cleanupMic();
      busyRef.current = false;
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
            Спойте 10 секунд — узнаете, на кого из звёзд похож ваш тембр в попе,
            роке, рэпе и K‑POP.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        {!recording && !analyzing ? (
          <Button fullWidth size="lg" onClick={() => void start()}>
            <Mic className="h-5 w-5" />
            Спеть 10 секунд
          </Button>
        ) : recording ? (
          <Button fullWidth size="lg" variant="danger" onClick={stopEarly}>
            <Square className="h-4 w-4 fill-current" />
            Стоп · {Math.round(progress)}%
          </Button>
        ) : (
          <Button fullWidth size="lg" disabled>
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
            Анализируем…
          </Button>
        )}
      </div>

      {recording && (
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-studio-bg">
          <div
            className="h-full rounded-full bg-gradient-to-r from-pink-500 to-studio-accent transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {analyzing && (
        <div className="mt-5 flex flex-col items-center gap-3 rounded-2xl bg-studio-bg/80 px-4 py-8 text-center ring-1 ring-studio-border">
          <span
            className="h-12 w-12 animate-spin rounded-full border-[3px] border-pink-400/30 border-t-pink-400"
            aria-hidden
          />
          <p className="font-medium text-studio-text">Анализируем ваш голос</p>
          <p className="max-w-xs text-sm text-studio-muted">
            {status || "Это может занять несколько секунд — не закрывайте страницу."}
          </p>
        </div>
      )}

      {hasResults && !analyzing && (
        <div className="mt-6 space-y-6">
          {recognizedTrack && (
            <p className="rounded-xl bg-emerald-500/10 px-3 py-2 text-center text-sm text-emerald-200 ring-1 ring-emerald-500/30">
              Распознан трек:{" "}
              <span className="font-semibold">{recognizedTrack}</span>
            </p>
          )}
          {genderHint && (
            <p className="rounded-xl bg-studio-bg px-3 py-2 text-center text-sm text-studio-text ring-1 ring-studio-border">
              Определён пол:{" "}
              <span className="font-semibold text-pink-300">{genderHint}</span>
            </p>
          )}

          {rawTop.length > 0 && (
            <div className="rounded-xl bg-studio-card px-3 py-3 ring-1 ring-studio-border">
              <p className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-studio-muted">
                Общий топ совпадений
              </p>
              <ol className="space-y-1 text-sm">
                {rawTop.slice(0, 8).map((row, i) => (
                  <li
                    key={`${row.name}-${i}`}
                    className="flex justify-between gap-2 text-studio-text"
                  >
                    <span className="min-w-0 break-words">
                      {i + 1}. {row.name}
                    </span>
                    <span className="shrink-0 tabular-nums text-studio-accent-light">
                      {row.percent}%
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <RegionBlock
            title="Зарубежные"
            columns={[
              { title: "Топ-5 поп", items: results.western.pop, tone: "pink" },
              { title: "Топ-5 рок", items: results.western.rock, tone: "violet" },
              { title: "Топ-5 рэп", items: results.western.rap, tone: "sky" },
            ]}
          />

          <RegionBlock
            title="Российские"
            columns={[
              { title: "Топ-5 поп", items: results.russian.pop, tone: "pink" },
              { title: "Топ-5 рок", items: results.russian.rock, tone: "violet" },
              { title: "Топ-5 рэп", items: results.russian.rap, tone: "sky" },
            ]}
          />

          <RegionBlock
            title="Азиатские"
            columns={[
              { title: "Топ-5 K-POP", items: results.asian.kpop, tone: "sky" },
            ]}
          />
        </div>
      )}

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
    </section>
  );
}

function RegionBlock({
  title,
  columns,
}: {
  title: string;
  columns: Array<{
    title: string;
    items: TimbreMatch[];
    tone: "pink" | "violet" | "sky";
  }>;
}) {
  const visible = columns.filter((c) => c.items.length > 0);
  if (visible.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-base font-semibold text-studio-text">{title}</h3>
      <div
        className={`grid gap-3 ${
          visible.length === 1 ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-3"
        }`}
      >
        {visible.map((col) => (
          <MatchColumn
            key={col.title}
            title={col.title}
            items={col.items}
            tone={col.tone}
          />
        ))}
      </div>
    </div>
  );
}

function MatchColumn({
  title,
  items,
  tone,
}: {
  title: string;
  items: TimbreMatch[];
  tone: "pink" | "violet" | "sky";
}) {
  const bar =
    tone === "pink"
      ? "from-pink-500 to-studio-accent"
      : tone === "violet"
        ? "from-violet-500 to-studio-accent"
        : "from-sky-400 to-blue-500";
  return (
    <div className="rounded-2xl bg-studio-card p-3.5 ring-1 ring-studio-border sm:p-4">
      <h4 className="mb-3 text-sm font-semibold">{title}</h4>
      <ul className="space-y-4">
        {items.map((item, index) => (
          <li key={item.artist.id}>
            <div className="mb-1.5 space-y-0.5">
              <p className="text-[13px] leading-snug text-studio-text sm:text-sm">
                <span className="mr-1.5 text-studio-muted">{index + 1}.</span>
                <span className="whitespace-normal break-words [overflow-wrap:anywhere]">
                  {item.artist.name}
                </span>
              </p>
              <p className="text-xs font-semibold tabular-nums text-studio-accent-light">
                {item.score}%
              </p>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-studio-bg">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${bar}`}
                style={{ width: `${item.score}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
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
