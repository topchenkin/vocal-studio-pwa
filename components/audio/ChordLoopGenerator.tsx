"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Lock, Play, Square, Sparkles } from "lucide-react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import {
  ROOTS,
  VIBES,
  buildProgression,
  clampBpm,
  defaultGroove,
  midiToHz,
  scaleNoteNames,
  type ChordVibe,
  type Groove,
  type LoopLength,
  type RootKey,
  type ScaleMode,
} from "@/lib/chord-loop";

type Props = { locked?: boolean };

const ADSR = { attack: 0.05, decay: 0.3, sustain: 0.7, release: 1.2 };

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

export default function ChordLoopGenerator({ locked = false }: Props) {
  const { tier } = useAuth();
  const [root, setRoot] = useState<RootKey>("A");
  const [mode, setMode] = useState<ScaleMode>("minor");
  const [vibe, setVibe] = useState<ChordVibe>("sad-pop");
  const [length, setLength] = useState<LoopLength>(4);
  const [groove, setGroove] = useState<Groove>("quarters");
  const [bpm, setBpm] = useState(80);
  const [playing, setPlaying] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const intervalRef = useRef(0);
  const nextTimeRef = useRef(0);
  const chordIndexRef = useRef(0);
  const voicesRef = useRef<OscillatorNode[]>([]);
  const timeoutsRef = useRef<number[]>([]);
  const tapsRef = useRef<number[]>([]);
  const playingRef = useRef(false);
  const bpmRef = useRef(bpm);
  const grooveRef = useRef(groove);
  const chordsRef = useRef(buildProgression(root, mode, vibe, length));

  const chords = useMemo(
    () => buildProgression(root, mode, vibe, length),
    [root, mode, vibe, length]
  );
  const scale = useMemo(() => scaleNoteNames(root, mode), [root, mode]);
  chordsRef.current = chords;
  bpmRef.current = bpm;
  grooveRef.current = groove;
  playingRef.current = playing;

  const stopVoices = useCallback((when?: number) => {
    const time = when ?? ctxRef.current?.currentTime ?? 0;
    for (const osc of voicesRef.current) {
      try {
        osc.stop(time + ADSR.release);
      } catch {
        /* already stopped */
      }
    }
    voicesRef.current = [];
  }, []);

  const stop = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
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

  const playVoice = useCallback(
    (ctx: AudioContext, dest: AudioNode, midi: number, when: number, dur: number, pan: number) => {
      const oscA = ctx.createOscillator();
      const oscB = ctx.createOscillator();
      oscA.type = "triangle";
      oscB.type = "sine";
      oscA.frequency.value = midiToHz(midi);
      oscB.frequency.value = midiToHz(midi);
      oscB.detune.value = -8;
      const gain = ctx.createGain();
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      const peak = 0.12;
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(peak, when + ADSR.attack);
      gain.gain.exponentialRampToValueAtTime(
        Math.max(0.0002, peak * ADSR.sustain),
        when + ADSR.attack + ADSR.decay
      );
      const releaseAt = when + dur;
      gain.gain.setValueAtTime(Math.max(0.0002, peak * ADSR.sustain), releaseAt);
      gain.gain.exponentialRampToValueAtTime(0.0001, releaseAt + ADSR.release);
      oscA.connect(gain);
      oscB.connect(gain);
      gain.connect(panner);
      panner.connect(dest);
      oscA.start(when);
      oscB.start(when);
      oscA.stop(releaseAt + ADSR.release + 0.05);
      oscB.stop(releaseAt + ADSR.release + 0.05);
      voicesRef.current.push(oscA, oscB);
      oscA.onended = () => {
        voicesRef.current = voicesRef.current.filter(
          (item) => item !== oscA && item !== oscB
        );
      };
    },
    []
  );

  const scheduleChord = useCallback(
    (when: number) => {
      const ctx = ctxRef.current;
      const dest = masterRef.current;
      if (!ctx || !dest) return;
      const list = chordsRef.current;
      if (!list.length) return;
      const index = chordIndexRef.current % list.length;
      chordIndexRef.current = index;
      const chord = list[index];
      const barSec = (4 * 60) / bpmRef.current;
      if (grooveRef.current === "arpeggio") {
        const notes = chord.midi;
        const step = barSec / Math.max(4, notes.length * 2);
        notes.forEach((midi, i) => {
          const pan = notes.length === 1 ? 0 : (i / (notes.length - 1)) * 1.2 - 0.6;
          playVoice(ctx, dest, midi, when + i * step, step * 1.6, pan);
        });
      } else {
        chord.midi.forEach((midi, i) => {
          const pan = (i / Math.max(1, chord.midi.length - 1)) * 1.1 - 0.55;
          playVoice(ctx, dest, midi, when, barSec * 0.92, pan);
        });
      }
      const wait = Math.max(0, (when - ctx.currentTime) * 1000);
      const id = window.setTimeout(() => {
        if (playingRef.current) setActiveIndex(index);
      }, wait);
      timeoutsRef.current.push(id);
    },
    [playVoice]
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

  const play = useCallback(async () => {
    if (!ctxRef.current || ctxRef.current.state === "closed") {
      const ctx = ensureAudioContext();
      const master = ctx.createGain();
      master.gain.value = 0.9;
      const dry = ctx.createGain();
      dry.gain.value = 0.72;
      const wet = ctx.createGain();
      wet.gain.value = 0.28;
      const convolver = ctx.createConvolver();
      convolver.buffer = makePadImpulse(ctx);
      master.connect(dry);
      dry.connect(ctx.destination);
      master.connect(convolver);
      convolver.connect(wet);
      wet.connect(ctx.destination);
      ctxRef.current = ctx;
      masterRef.current = master;
    }
    const ctx = ctxRef.current;
    if (ctx.state === "suspended") await ctx.resume();
    if (masterRef.current) {
      masterRef.current.gain.setValueAtTime(0.9, ctx.currentTime);
    }
    chordIndexRef.current = 0;
    nextTimeRef.current = ctx.currentTime + 0.06;
    playingRef.current = true;
    setPlaying(true);
    setActiveIndex(0);
    tick();
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    intervalRef.current = window.setInterval(tick, 25);
  }, [tick]);

  useEffect(() => {
    setGroove(defaultGroove(vibe));
  }, [vibe]);

  useEffect(() => {
    return () => {
      stop();
      const ctx = ctxRef.current;
      ctxRef.current = null;
      if (ctx && ctx.state !== "closed") void ctx.close();
    };
  }, [stop]);

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

  if (locked) {
    return (
      <section className="relative overflow-hidden rounded-3xl bg-studio-surface p-5 ring-1 ring-studio-border sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-studio-bg/40 backdrop-blur-[2px]" />
        <div className="relative z-10 flex flex-col items-center py-10 text-center">
          <Lock className="h-7 w-7 text-amber-300" />
          <h2 className="mt-4 font-display text-2xl font-semibold">
            Генератор аккордовых лупов
          </h2>
          <p className="mt-2 max-w-sm text-sm text-studio-muted">
            Инструмент доступен по тарифу администратора. Сейчас у вас:{" "}
            <span className="font-medium text-studio-text">{tier}</span>.
          </p>
          <Link href="/dashboard/student" className="mt-6 w-full max-w-xs">
            <Button fullWidth size="lg">
              <Sparkles className="h-5 w-5" />
              В кабинет
            </Button>
          </Link>
        </div>
      </section>
    );
  }

  const pulseMs = Math.round((60 / bpm) * 1000);

  return (
    <section className="rounded-3xl bg-studio-surface p-4 ring-1 ring-studio-border sm:p-6">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-500/15 text-cyan-300">
          <Play className="h-6 w-6" />
        </div>
        <div>
          <h2 className="font-display text-2xl font-semibold">
            Генератор аккордовых лупов
          </h2>
          <p className="mt-1 text-sm text-studio-muted">
            Гармония для вокальных импровизаций. Синтезатор играет в браузере,
            файлы с сервера не нужны.
          </p>
        </div>
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
        <label className="text-sm text-studio-muted sm:col-span-2">
          Вайб
          <select
            value={vibe}
            onChange={(event) => setVibe(event.target.value as ChordVibe)}
            className="mt-1 w-full rounded-xl bg-studio-bg px-3 py-2 text-studio-text ring-1 ring-studio-border"
          >
            {VIBES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>

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
        <Button
          onClick={() => (playing ? stop() : void play())}
        >
          {playing ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {playing ? "Стоп" : "Play"}
        </Button>
        <Button variant="secondary" onClick={tapTempo}>
          Tap Tempo
        </Button>
      </div>
    </section>
  );
}
