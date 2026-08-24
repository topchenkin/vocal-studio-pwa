/**
 * Deterministic calibration for the offline Vocal Archetype rasp estimator.
 * Uses the installed Meyda/Pitchfinder versions and production frame sizes.
 */
import Meyda from "meyda";
import { analyzeVoiceSamples } from "../lib/analyze-voice-buffer";
import { createYinDetector } from "../lib/pitch";
import { mapFlatnessToRasp, percentile } from "../lib/timbre-features";

const SAMPLE_RATE = 48_000;
const SPECTRAL_BUFFER = 2_048;
const PITCH_WINDOW = 4_096;
const HOP = 1_024;
const SECONDS = 3;

type Scenario = {
  name: string;
  f0: number;
  noise: number;
  breathy?: boolean;
  bursts?: boolean;
};

type Frame = {
  flatness: number;
  zcr: number;
  pitch: number | null;
  periodicity: number;
};

let randomState = 0x5eeda11;
function whiteNoise(): number {
  randomState = (Math.imul(randomState, 1_664_525) + 1_013_904_223) >>> 0;
  return (randomState / 0x1_0000_0000) * 2 - 1;
}

function makeSignal({ f0, noise, breathy = false, bursts = false }: Scenario): Float32Array {
  randomState = 0x5eeda11;
  const signal = new Float32Array(SAMPLE_RATE * SECONDS);
  let filteredNoise = 0;
  for (let i = 0; i < signal.length; i += 1) {
    const t = i / SAMPLE_RATE;
    const phrase = 0.68 + 0.22 * Math.sin(2 * Math.PI * 0.7 * t);
    const attack = Math.min(1, (i % SAMPLE_RATE) / (SAMPLE_RATE * 0.045));
    let harmonic = 0;
    for (let h = 1; h <= 18; h += 1) {
      harmonic += Math.sin(2 * Math.PI * f0 * h * t + h * 0.17) / h ** 1.35;
    }
    const rawNoise = whiteNoise();
    filteredNoise = breathy ? 0.82 * filteredNoise + 0.18 * rawNoise : rawNoise;
    let noiseGain = noise;
    if (bursts) {
      const inBurst = [0.7, 1.65, 2.8, 4.1, 5.15].some(
        (start) => t >= start && t < start + 0.12
      );
      if (inBurst) noiseGain += 0.32;
    }
    signal[i] = (0.22 * harmonic * phrase * attack + filteredNoise * noiseGain) * 0.75;
  }
  return signal;
}

function zeroCrossingRate(frame: Float32Array): number {
  let crossings = 0;
  for (let i = 1; i < frame.length; i += 1) {
    if ((frame[i - 1] ?? 0) * (frame[i] ?? 0) < 0) crossings += 1;
  }
  return crossings / Math.max(1, frame.length - 1);
}

function normalizedPeriodicity(
  frame: Float32Array,
  sampleRate: number,
  pitch: number | null
): number {
  if (!pitch || pitch <= 0) return 0;
  const lag = Math.round(sampleRate / pitch);
  if (lag < 2 || lag >= frame.length / 2) return 0;
  let xy = 0;
  let xx = 0;
  let yy = 0;
  for (let i = 0; i + lag < frame.length; i += 1) {
    const x = frame[i] ?? 0;
    const y = frame[i + lag] ?? 0;
    xy += x * y;
    xx += x * x;
    yy += y * y;
  }
  return xx > 0 && yy > 0 ? Math.max(0, xy / Math.sqrt(xx * yy)) : 0;
}

function analyze(signal: Float32Array): Frame[] {
  Meyda.bufferSize = SPECTRAL_BUFFER;
  Meyda.sampleRate = SAMPLE_RATE;
  const yin = createYinDetector(SAMPLE_RATE);
  const spectral = new Float32Array(SPECTRAL_BUFFER);
  const pitchFrame = new Float32Array(PITCH_WINDOW);
  const frames: Frame[] = [];
  for (let start = 0; start + SPECTRAL_BUFFER <= signal.length; start += HOP) {
    spectral.set(signal.subarray(start, start + SPECTRAL_BUFFER));
    const features = Meyda.extract(["spectralFlatness", "zcr", "rms"], spectral);
    const pitchStart = Math.max(0, start + SPECTRAL_BUFFER - PITCH_WINDOW);
    let pitch: number | null = null;
    if (pitchStart + PITCH_WINDOW <= signal.length) {
      pitchFrame.set(signal.subarray(pitchStart, pitchStart + PITCH_WINDOW));
      pitch = yin(pitchFrame);
    }
    if (features && (features.rms ?? 0) >= 0.0025) {
      frames.push({
        flatness: features.spectralFlatness ?? 0,
        zcr: (features.zcr ?? 0) / SPECTRAL_BUFFER,
        pitch,
        periodicity: normalizedPeriodicity(pitchFrame, SAMPLE_RATE, pitch),
      });
    }
  }
  return frames;
}

function summary(values: number[]): string {
  return [0.1, 0.25, 0.5, 0.75]
    .map((p) => percentile(values, p).toFixed(5))
    .join("/");
}

function raspEvidence(frame: Frame): number {
  return frame.flatness * Math.sqrt(Math.max(0, 1 - frame.periodicity));
}

const scenarios: Scenario[] = [
  { name: "clean male 120", f0: 120, noise: 0 },
  { name: "clean male 180", f0: 180, noise: 0 },
  { name: "clean female 220", f0: 220, noise: 0 },
  { name: "clean Ariana-like 300", f0: 300, noise: 0 },
  { name: "clean + low noise", f0: 300, noise: 0.003 },
  { name: "clean + moderate noise", f0: 300, noise: 0.012 },
  { name: "clean + high noise", f0: 300, noise: 0.035 },
  { name: "clean + very high noise", f0: 300, noise: 0.07 },
  { name: "harmonic + dominant noise", f0: 300, noise: 0.12 },
  { name: "breathy/noisy", f0: 300, noise: 0.045, breathy: true },
  { name: "clean + consonant bursts", f0: 300, noise: 0.002, bursts: true },
];

let failed = 0;
function expect(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    failed += 1;
  }
}

async function main(): Promise<void> {
  console.log("Meyda", (Meyda as unknown as { version?: string }).version ?? "5.6.3");
  console.log("flatness p10/p25/median/p75 | evidence p25/p35/p50/p75 | zcr | pitch | periodicity p25/median | production");
  for (const scenario of scenarios) {
    const signal = makeSignal(scenario);
    const frames = analyze(signal);
    const pitched = frames.filter((frame) => frame.pitch !== null);
    const flatness = pitched.map((frame) => frame.flatness);
    const result = await analyzeVoiceSamples(
      signal,
      SAMPLE_RATE,
      scenario.f0 >= 200 ? "female" : "male"
    );
    const production = result
      ? mapFlatnessToRasp(result.robustRaspEvidence).label
      : "Недостаточно надёжных кадров";
    console.log(
      `${scenario.name.padEnd(26)} ${summary(flatness)} | ${[
        0.25,
        0.35,
        0.5,
        0.75,
      ]
        .map((p) => percentile(pitched.map(raspEvidence), p).toFixed(5))
        .join("/")} | ${percentile(
        pitched.map((frame) => frame.zcr),
        0.5
      ).toFixed(4)} | ${pitched.length}/${frames.length} | ${percentile(
        pitched.map((frame) => frame.periodicity),
        0.25
      ).toFixed(4)}/${percentile(
        pitched.map((frame) => frame.periodicity),
        0.5
      ).toFixed(4)} | ${production}`
    );

    if (scenario.name.startsWith("clean male") || scenario.name.startsWith("clean female") ||
        scenario.name === "clean Ariana-like 300" || scenario.name === "clean + low noise") {
      expect(production === "Чистый", `${scenario.name} must be clean`);
    }
    if (scenario.name === "clean + consonant bursts") {
      expect(production !== "Выраженная хрипотца", "consonant bursts must never be strong rasp");
    }
    if (scenario.name === "clean + moderate noise" || scenario.name === "breathy/noisy") {
      expect(production === "С лёгкой хрипотцой", `${scenario.name} must be light rasp`);
    }
    if (scenario.name === "clean + high noise" || scenario.name === "clean + very high noise") {
      expect(production === "Выраженная хрипотца", `${scenario.name} must be strong rasp`);
      expect((result?.reliableRaspFrameCount ?? 0) >= 16, `${scenario.name} needs enough reliable frames`);
    }
    if (scenario.name === "harmonic + dominant noise") {
      expect(result === null, "unreliable dominant noise must remain unknown");
    }
  }
  if (failed > 0) process.exit(1);
  console.log("OK: deterministic production rasp calibration");
}

void main();
