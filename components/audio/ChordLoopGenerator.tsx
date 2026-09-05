"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookmarkPlus, Lock, Play, Square, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { useAuth } from "@/context/AuthContext";
import {
  INSTRUMENTS,
  ROOTS,
  VIBES,
  buildProgression,
  clampBpm,
  defaultGroove,
  scaleNoteNames,
  type ChordInstrument,
  type ChordLoopSettings,
  type ChordVibe,
  type Groove,
  type LoopLength,
  type RootKey,
  type ScaleMode,
} from "@/lib/chord-loop";
import {
  INSTRUMENT_MIX,
  playDrumHit,
  playInstrumentNote,
} from "@/lib/chord-synth";
import { beginAudioKeepAlive, endAudioKeepAlive } from "@/lib/audio-keep-alive";
import { ensureChordSamples } from "@/lib/chord-sampler";
import {
  deleteChordLoopPreset,
  listChordLoopPresets,
  presetToSettings,
  saveChordLoopPreset,
} from "@/lib/chord-loop-presets";
import type { ChordLoopPreset } from "@/types";

type Props = { locked?: boolean };

function ensureAudioContext(): AudioContext {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  return new Ctor();
}

function makePadImpulse(ctx: AudioContext): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * 1.4);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch += 1) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.2);
    }
  }
  return buffer;
}

function makeNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * 0.4);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export default function ChordLoopGenerator({ locked = false }: Props) {
  const { user, tier } = useAuth();
  const [root, setRoot] = useState<RootKey>("A");
  const [mode, setMode] = useState<ScaleMode>("minor");
  const [vibe, setVibe] = useState<ChordVibe>("sad-pop");
  const [length, setLength] = useState<LoopLength>(4);
  const [groove, setGroove] = useState<Groove>("quarters");
  const [bpm, setBpm] = useState(80);
  const [instrument, setInstrument] = useState<ChordInstrument>("piano");
  const [playing, setPlaying] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [presets, setPresets] = useState<ChordLoopPreset[]>([]);
  const [selectedPreset, setSelectedPreset] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [presetBusy, setPresetBusy] = useState(false);
  const [presetError, setPresetError] = useState("");
  const [sampleBusy, setSampleBusy] = useState(false);

  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const voiceBusRef = useRef<GainNode | null>(null);
  const dryRef = useRef<GainNode | null>(null);
  const wetRef = useRef<GainNode | null>(null);
  const noiseRef = useRef<AudioBuffer | null>(null);
  const intervalRef = useRef(0);
  const nextTimeRef = useRef(0);
  const chordIndexRef = useRef(0);
  const voicesRef = useRef<AudioScheduledSourceNode[]>([]);
  const timeoutsRef = useRef<number[]>([]);
  const tapsRef = useRef<number[]>([]);
  const playingRef = useRef(false);
  const bpmRef = useRef(bpm);
  const grooveRef = useRef(groove);
  const instrumentRef = useRef(instrument);
  const sampleGenRef = useRef(0);
  const chordsRef = useRef(buildProgression(root, mode, vibe, length));

  const chords = useMemo(
    () => buildProgression(root, mode, vibe, length),
    [root, mode, vibe, length]
  );
  const scale = useMemo(() => scaleNoteNames(root, mode), [root, mode]);
  const settings: ChordLoopSettings = useMemo(
    () => ({ root, mode, vibe, length, groove, bpm, instrument }),
    [root, mode, vibe, length, groove, bpm, instrument]
  );
  chordsRef.current = chords;
  bpmRef.current = bpm;
  grooveRef.current = groove;
  instrumentRef.current = instrument;
  playingRef.current = playing;

  const loadPresets = useCallback(async () => {
    if (!user) return;
    try {
      setPresets(await listChordLoopPresets(user.id));
    } catch (err) {
      setPresetError(err instanceof Error ? err.message : "Не удалось загрузить пресеты");
    }
  }, [user]);

  useEffect(() => {
    void loadPresets();
  }, [loadPresets]);

  const stopVoices = useCallback((when?: number) => {
    const time = when ?? ctxRef.current?.currentTime ?? 0;
    for (const osc of voicesRef.current) {
      try {
        osc.stop(time + 0.05);
      } catch {
        /* already stopped */
      }
    }
    voicesRef.current = [];
  }, []);

  const stop = useCallback(() => {
    sampleGenRef.current += 1;
    setSampleBusy(false);
    playingRef.current = false;
    setPlaying(false);
    endAudioKeepAlive();
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = 0;
    }
    for (const id of timeoutsRef.current) window.clearTimeout(id);
    timeoutsRef.current = [];
    stopVoices();
    if (masterRef.current && ctxRef.current) {
      masterRef.current.gain.cancelScheduledValues(ctxRef.current.currentTime);
      masterRef.current.gain.setValueAtTime(0.0001, ctxRef.current.currentTime);
    }
  }, [stopVoices]);

  const applyMix = useCallback((next: ChordInstrument) => {
    const mix = INSTRUMENT_MIX[next] ?? INSTRUMENT_MIX.piano;
    const ctx = ctxRef.current;
    if (!ctx || !dryRef.current || !wetRef.current) return;
    dryRef.current.gain.setTargetAtTime(mix.dry, ctx.currentTime, 0.04);
    wetRef.current.gain.setTargetAtTime(mix.wet, ctx.currentTime, 0.04);
  }, []);

  const playTone = useCallback(
    (
      ctx: AudioContext,
      dest: AudioNode,
      midi: number,
      when: number,
      dur: number,
      pan: number,
      instrument: Exclude<ChordInstrument, "drums">
    ) => {
      const noise = noiseRef.current ?? makeNoiseBuffer(ctx);
      if (!noiseRef.current) noiseRef.current = noise;
      const voices = playInstrumentNote(
        ctx,
        dest,
        instrument,
        midi,
        when,
        dur,
        pan,
        noise
      );
      voicesRef.current.push(...voices);
    },
    []
  );

  const playDrum = useCallback(
    (ctx: AudioContext, dest: AudioNode, kind: "kick" | "snare" | "hat", when: number) => {
      const noise = noiseRef.current ?? makeNoiseBuffer(ctx);
      if (!noiseRef.current) noiseRef.current = noise;
      voicesRef.current.push(...playDrumHit(ctx, dest, kind, when, noise));
    },
    []
  );

  const scheduleChord = useCallback(
    (when: number) => {
      const ctx = ctxRef.current;
      const dest = voiceBusRef.current;
      if (!ctx || !dest) return;
      const list = chordsRef.current;
      if (!list.length) return;
      const index = chordIndexRef.current % list.length;
      chordIndexRef.current = index;
      const chord = list[index];
      const barSec = (4 * 60) / bpmRef.current;
      const currentInstrument = instrumentRef.current;

      if (currentInstrument === "drums") {
        const beat = barSec / 4;
        for (let step = 0; step < 8; step += 1) {
          const t = when + step * (beat / 2);
          playDrum(ctx, dest, "hat", t);
          if (step % 2 === 0) {
            playDrum(ctx, dest, step % 4 === 0 ? "kick" : "snare", t);
          }
        }
        playTone(ctx, dest, chord.midi[0], when, barSec * 0.35, 0, "bass");
      } else {
        const notes =
          currentInstrument === "bass"
            ? [chord.midi[0]]
            : currentInstrument === "guitar"
              ? chord.midi.slice(0, 4)
              : chord.midi;
        if (grooveRef.current === "arpeggio") {
          const step = barSec / Math.max(4, notes.length * 2);
          notes.forEach((midi, i) => {
            const pan = notes.length === 1 ? 0 : (i / (notes.length - 1)) * 1.2 - 0.6;
            playTone(
              ctx,
              dest,
              midi,
              when + i * step,
              step * 1.6,
              pan,
              currentInstrument
            );
          });
        } else {
          notes.forEach((midi, i) => {
            const pan = (i / Math.max(1, notes.length - 1)) * 1.1 - 0.55;
            const strum = currentInstrument === "guitar" ? i * 0.024 : 0;
            const hold =
              currentInstrument === "guitar" ? barSec * 0.5 : barSec * 0.92;
            playTone(ctx, dest, midi, when + strum, hold, pan, currentInstrument);
          });
        }
      }

      const wait = Math.max(0, (when - ctx.currentTime) * 1000);
      const id = window.setTimeout(() => {
        if (playingRef.current) setActiveIndex(index);
      }, wait);
      timeoutsRef.current.push(id);
    },
    [playDrum, playTone]
  );

  const tick = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx || !playingRef.current) return;
    const barSec = (4 * 60) / bpmRef.current;
    while (nextTimeRef.current < ctx.currentTime + 0.16) {
      scheduleChord(nextTimeRef.current);
      nextTimeRef.current += barSec;
      chordIndexRef.current =
        (chordIndexRef.current + 1) % Math.max(1, chordsRef.current.length);
    }
  }, [scheduleChord]);

  const restartVoices = useCallback(() => {
    const ctx = ctxRef.current;
    if (!playingRef.current || !ctx || !masterRef.current) return;
    const previous = voiceBusRef.current;
    if (previous) {
      previous.gain.cancelScheduledValues(ctx.currentTime);
      previous.gain.setValueAtTime(Math.max(0.0001, previous.gain.value), ctx.currentTime);
      previous.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.05);
    }
    const bus = ctx.createGain();
    bus.gain.value = 1;
    bus.connect(masterRef.current);
    voiceBusRef.current = bus;
    stopVoices(ctx.currentTime);
    const count = Math.max(1, chordsRef.current.length);
    chordIndexRef.current = (chordIndexRef.current - 1 + count) % count;
    nextTimeRef.current = ctx.currentTime + 0.03;
    tick();
  }, [stopVoices, tick]);

  const play = useCallback(async () => {
    if (!ctxRef.current || ctxRef.current.state === "closed") {
      const ctx = ensureAudioContext();
      const master = ctx.createGain();
      master.gain.value = 0.9;
      const voiceBus = ctx.createGain();
      voiceBus.gain.value = 1;
      const dry = ctx.createGain();
      const wet = ctx.createGain();
      const mix = INSTRUMENT_MIX[instrumentRef.current] ?? INSTRUMENT_MIX.piano;
      dry.gain.value = mix.dry;
      wet.gain.value = mix.wet;
      const convolver = ctx.createConvolver();
      convolver.buffer = makePadImpulse(ctx);
      voiceBus.connect(master);
      master.connect(dry);
      dry.connect(ctx.destination);
      master.connect(convolver);
      convolver.connect(wet);
      wet.connect(ctx.destination);
      ctxRef.current = ctx;
      masterRef.current = master;
      voiceBusRef.current = voiceBus;
      dryRef.current = dry;
      wetRef.current = wet;
      noiseRef.current = makeNoiseBuffer(ctx);
    }
    const ctx = ctxRef.current;
    if (ctx.state === "suspended") await ctx.resume();
    const gen = ++sampleGenRef.current;
    setSampleBusy(true);
    try {
      while (true) {
        const wanted = instrumentRef.current;
        await ensureChordSamples(ctx, wanted);
        if (sampleGenRef.current !== gen) return;
        if (instrumentRef.current === wanted) break;
      }
    } catch (err) {
      if (sampleGenRef.current !== gen) return;
      setSampleBusy(false);
      setPresetError(
        err instanceof Error ? err.message : "Не удалось загрузить сэмплы"
      );
      return;
    }
    if (sampleGenRef.current !== gen) return;
    setSampleBusy(false);
    applyMix(instrumentRef.current);
    if (masterRef.current) {
      masterRef.current.gain.setValueAtTime(0.9, ctx.currentTime);
    }
    chordIndexRef.current = 0;
    nextTimeRef.current = ctx.currentTime + 0.06;
    playingRef.current = true;
    setPlaying(true);
    beginAudioKeepAlive();
    setActiveIndex(0);
    tick();
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    intervalRef.current = window.setInterval(tick, 25);
  }, [applyMix, tick]);

  useEffect(() => {
    return () => {
      stop();
      const ctx = ctxRef.current;
      ctxRef.current = null;
      if (ctx && ctx.state !== "closed") void ctx.close();
    };
  }, [stop]);

  const changeInstrument = (next: ChordInstrument) => {
    instrumentRef.current = next;
    setInstrument(next);
    applyMix(next);
    const ctx = ctxRef.current;
    if (!playingRef.current || !ctx) return;
    const gen = ++sampleGenRef.current;
    const apply = async () => {
      setSampleBusy(true);
      try {
        await ensureChordSamples(ctx, next);
      } catch (err) {
        if (sampleGenRef.current !== gen) return;
        setSampleBusy(false);
        setPresetError(
          err instanceof Error ? err.message : "Не удалось загрузить сэмплы"
        );
        return;
      }
      if (sampleGenRef.current !== gen) return;
      setSampleBusy(false);
      restartVoices();
    };
    void apply();
  };

  const applySettings = (next: ChordLoopSettings) => {
    setRoot(next.root);
    setMode(next.mode);
    setVibe(next.vibe);
    setLength(next.length);
    setGroove(next.groove);
    setBpm(clampBpm(next.bpm));
    changeInstrument(next.instrument);
  };

  const tapTempo = () => {
    const now = Date.now();
    const taps = tapsRef.current.filter((tap) => now - tap < 2500);
    taps.push(now);
    tapsRef.current = taps;
    if (taps.length < 2) return;
    const spans: number[] = [];
    for (let i = 1; i < taps.length; i += 1) spans.push(taps[i] - taps[i - 1]);
    const avg = spans.reduce((sum, item) => sum + item, 0) / spans.length;
    setBpm(clampBpm(60000 / avg));
  };

  const onPickPreset = (id: string) => {
    setSelectedPreset(id);
    const row = presets.find((item) => item.id === id);
    if (!row) return;
    const next = presetToSettings(row);
    if (next) applySettings(next);
  };

  const onSavePreset = async () => {
    if (!user || presetBusy) return;
    const name = saveName.trim();
    if (!name) {
      setPresetError("Напишите название пресета");
      return;
    }
    setPresetBusy(true);
    setPresetError("");
    try {
      const row = await saveChordLoopPreset({ userId: user.id, name, settings });
      setPresets((current) => [row, ...current]);
      setSelectedPreset(row.id);
      setSaveOpen(false);
      setSaveName("");
    } catch (err) {
      setPresetError(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setPresetBusy(false);
    }
  };

  const onDeletePreset = async () => {
    if (!selectedPreset || presetBusy) return;
    setPresetBusy(true);
    setPresetError("");
    try {
      await deleteChordLoopPreset(selectedPreset);
      setPresets((current) => current.filter((item) => item.id !== selectedPreset));
      setSelectedPreset("");
    } catch (err) {
      setPresetError(err instanceof Error ? err.message : "Не удалось удалить");
    } finally {
      setPresetBusy(false);
    }
  };

  if (locked) {
    return (
      <section className="relative overflow-hidden rounded-3xl bg-studio-surface p-5 ring-1 ring-studio-border sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-studio-bg/40 backdrop-blur-[2px]" />
        <div className="relative z-10 flex flex-col items-center py-10 text-center">
          <Lock className="h-7 w-7 text-amber-300" />
          <h2 className="mt-4 font-display text-2xl font-semibold">
            Генератор аккордов
          </h2>
          <p className="mt-2 max-w-sm text-sm text-studio-muted">
            Инструмент доступен по тарифу администратора. Сейчас у вас:{" "}
            <span className="font-medium text-studio-text">{tier}</span>.
          </p>
          <Link href="/dashboard/student/subscription" className="mt-6 w-full max-w-xs">
            <Button fullWidth size="lg">
              <Sparkles className="h-5 w-5" />
              Купить премиум
            </Button>
          </Link>
        </div>
      </section>
    );
  }

  const pulseMs = Math.round((60 / bpm) * 1000);
  const instrumentHint =
    INSTRUMENTS.find((item) => item.id === instrument)?.hint ?? "";

  return (
    <section className="rounded-3xl bg-studio-surface p-4 ring-1 ring-studio-border sm:p-6">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-500/15 text-cyan-300">
          <Play className="h-6 w-6" />
        </div>
        <div>
          <h2 className="font-display text-2xl font-semibold">
            Генератор аккордов
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-studio-muted">
            Живой бэк-трек для распевок, импровизации и разбора песен: выберите
            тональность, вайб и инструмент — и пойте поверх готовой сетки, как
            с аккомпаниатором. Карточки показывают, какой аккорд звучит сейчас,
            а подсказка снизу даёт безопасные ноты гаммы. Сохраните любимый
            луп в свои пресеты и запускайте его в один тап на следующем занятии.
          </p>
        </div>
      </div>

      <div className="mt-5 rounded-2xl bg-studio-bg/70 p-3 ring-1 ring-cyan-400/20">
        <p className="text-xs font-medium uppercase tracking-wide text-cyan-200/80">
          Мои пресеты
        </p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <select
            value={selectedPreset}
            onChange={(event) => onPickPreset(event.target.value)}
            className="w-full rounded-xl bg-studio-bg px-3 py-2 text-sm text-studio-text ring-1 ring-studio-border"
          >
            <option value="">Новый луп — настройте ниже</option>
            {presets.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1 sm:flex-none"
              onClick={() => {
                setSaveName(
                  `${root}${mode === "minor" ? "m" : ""} · ${
                    INSTRUMENTS.find((item) => item.id === instrument)?.label ?? ""
                  }`
                );
                setSaveOpen(true);
              }}
              disabled={!user}
            >
              <BookmarkPlus className="h-4 w-4" />
              Сохранить
            </Button>
            <Button
              variant="ghost"
              onClick={() => void onDeletePreset()}
              disabled={!selectedPreset || presetBusy}
              aria-label="Удалить пресет"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {presetError && (
          <p className="mt-2 text-sm text-rose-300">{presetError}</p>
        )}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-studio-muted">
          Тональность
          <select
            value={root}
            onChange={(event) => setRoot(event.target.value as RootKey)}
            className="mt-1 w-full rounded-xl bg-studio-bg px-3 py-2 text-studio-text ring-1 ring-studio-border"
          >
            {ROOTS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-studio-muted">
          Лад
          <select
            value={mode}
            onChange={(event) => setMode(event.target.value as ScaleMode)}
            className="mt-1 w-full rounded-xl bg-studio-bg px-3 py-2 text-studio-text ring-1 ring-studio-border"
          >
            <option value="major">Мажор</option>
            <option value="minor">Минор</option>
          </select>
        </label>
        <label className="text-sm text-studio-muted">
          Вайб
          <select
            value={vibe}
            onChange={(event) => {
              const next = event.target.value as ChordVibe;
              setVibe(next);
              setGroove(defaultGroove(next));
            }}
            className="mt-1 w-full rounded-xl bg-studio-bg px-3 py-2 text-studio-text ring-1 ring-studio-border"
          >
            {VIBES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-studio-muted">
          Сэмпл / инструмент
          <select
            value={instrument}
            onChange={(event) =>
              changeInstrument(event.target.value as ChordInstrument)
            }
            className="mt-1 w-full rounded-xl bg-studio-bg px-3 py-2 text-studio-text ring-1 ring-cyan-400/40"
          >
            {INSTRUMENTS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="mt-2 text-xs text-studio-muted">{instrumentHint}</p>
      {sampleBusy && (
        <p className="mt-1 text-xs text-cyan-200">Загружаем живые сэмплы…</p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {([2, 4, 8] as LoopLength[]).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setLength(item)}
            className={`rounded-xl px-3 py-2 text-sm ring-1 ${
              length === item
                ? "bg-cyan-500/20 text-cyan-100 ring-cyan-400"
                : "text-studio-muted ring-studio-border"
            }`}
          >
            {item} аккорда
          </button>
        ))}
        {(["quarters", "arpeggio"] as Groove[]).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setGroove(item)}
            className={`rounded-xl px-3 py-2 text-sm ring-1 ${
              groove === item
                ? "bg-cyan-500/20 text-cyan-100 ring-cyan-400"
                : "text-studio-muted ring-studio-border"
            }`}
          >
            {item === "quarters" ? "Четверти" : "Арпеджио"}
          </button>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {chords.map((chord, index) => {
          const active = playing && index === activeIndex;
          return (
            <div
              key={`${chord.symbol}-${index}`}
              className={`min-w-[4.5rem] flex-1 rounded-2xl px-3 py-4 text-center ring-1 transition ${
                active
                  ? "bg-cyan-400/20 text-cyan-50 ring-cyan-300 shadow-[0_0_28px_rgba(34,211,238,0.45)]"
                  : "bg-studio-bg/70 text-studio-text ring-studio-border"
              }`}
              style={
                active
                  ? { animation: `pulse ${pulseMs}ms ease-in-out infinite` }
                  : undefined
              }
            >
              <span className="font-display text-xl font-semibold">
                {chord.symbol}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-4 rounded-2xl bg-studio-bg/70 px-4 py-3 text-sm text-studio-muted">
        Рекомендуемые ноты для импровизации:{" "}
        <span className="font-medium text-cyan-200">{scale.join(" · ")}</span>
      </p>

      <label className="mt-5 block text-sm text-studio-muted">
        Темп: {bpm} BPM
        <input
          type="range"
          min={50}
          max={140}
          value={bpm}
          onChange={(event) => setBpm(clampBpm(Number(event.target.value)))}
          className="mt-2 w-full accent-cyan-400"
        />
      </label>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button onClick={() => (playing ? stop() : void play())} disabled={sampleBusy}>
          {playing ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {playing ? "Стоп" : "Play"}
        </Button>
        <Button variant="secondary" onClick={tapTempo}>
          Tap Tempo
        </Button>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-studio-muted">
        Фортепиано и рок-гитара — FluidR3 GM (Frank Wen), CC BY 3.0.
        Акустическая гитара — University of Iowa MIS.
      </p>

      <Modal
        open={saveOpen}
        onClose={() => {
          if (!presetBusy) setSaveOpen(false);
        }}
        title="Сохранить пресет"
        size="sm"
      >
        <label className="block text-sm">
          <span className="mb-1.5 block text-studio-muted">Название</span>
          <input
            autoFocus
            value={saveName}
            maxLength={80}
            onChange={(event) => setSaveName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void onSavePreset();
              }
            }}
            className="w-full rounded-xl bg-studio-surface px-3 py-2.5 text-sm ring-1 ring-studio-border"
            placeholder="Am грустный поп · гитара"
          />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={presetBusy}
            onClick={() => setSaveOpen(false)}
          >
            Отмена
          </Button>
          <Button size="sm" disabled={presetBusy || !user} onClick={() => void onSavePreset()}>
            {presetBusy ? "Сохраняем…" : "Сохранить"}
          </Button>
        </div>
      </Modal>
    </section>
  );
}
