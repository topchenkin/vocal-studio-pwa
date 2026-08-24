/**
 * Deterministic end-to-end calibration for the production rasp estimator.
 * Uses installed Meyda/Pitchfinder, production windows and realistic,
 * formant-shaped harmonic singing at both common phone sample rates.
 */
import { analyzeVoiceSamples } from "../lib/analyze-voice-buffer";
import { mapFlatnessToRasp, type RaspLabel } from "../lib/timbre-features";

const SAMPLE_RATES = [44_100, 48_000] as const;
const MALE_F0 = [100, 140, 180] as const;
const FEMALE_F0 = [200, 250, 300, 350, 440, 600] as const;
const SECONDS = 3.2;

type Texture = "clean" | "light" | "strong";

type Scenario = {
  gender: "female" | "male";
  f0: number;
  sampleRate: number;
  texture: Texture;
  bursts: boolean;
  roomNoise: number;
};

let randomState = 0x5eeda11;
function whiteNoise(): number {
  randomState = (Math.imul(randomState, 1_664_525) + 1_013_904_223) >>> 0;
  return (randomState / 0x1_0000_0000) * 2 - 1;
}

function resonance(frequency: number, center: number, width: number): number {
  const distance = (frequency - center) / width;
  return Math.exp(-0.5 * distance * distance);
}

/**
 * A repeatable /a/-to-/i/ phone-capture model:
 * - formant-shaped harmonics (not the old unfiltered 1/h comb)
 * - 5.2 Hz vibrato, phrase envelope and soft attacks
 * - modest stationary room/mic floor on every clean signal
 * - short breath-consonant bursts on requested clean cases
 * - aspiration-like noise modulated by glottal phase for rasp cases
 */
function makeSignal({
  gender,
  f0,
  sampleRate,
  texture,
  bursts,
  roomNoise,
}: Scenario): Float32Array {
  randomState =
    (0x5eeda11 ^ Math.round(f0 * 31) ^ sampleRate ^ texture.length * 65_537) >>> 0;
  const signal = new Float32Array(Math.round(sampleRate * SECONDS));
  let phase = 0;
  let pinkish = 0;
  let previous = 0;
  const raspNoise =
    texture === "light"
      ? gender === "male"
        ? 0.016
        : 0.022
      : texture === "strong"
        ? gender === "male"
          ? f0 >= 170
            ? 0.028
            : 0.04
          : f0 < 250
            ? 0.06
            : 0.075
        : 0;

  for (let index = 0; index < signal.length; index += 1) {
    const time = index / sampleRate;
    const vibratoHz = f0 * (2 ** ((0.32 * Math.sin(2 * Math.PI * 5.2 * time)) / 12));
    phase += (2 * Math.PI * vibratoHz) / sampleRate;
    const phrase = 0.72 + 0.17 * Math.sin(2 * Math.PI * 0.63 * time);
    const phrasePosition = (time % 1.05) / 1.05;
    const attack = Math.min(1, phrasePosition / 0.055);
    const release = Math.min(1, (1 - phrasePosition) / 0.07);
    const envelope = phrase * Math.max(0, Math.min(attack, release));
    const vowelBlend = 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.21 * time);

    let harmonic = 0;
    let harmonicNorm = 0;
    const harmonicLimit = Math.min(32, Math.floor(8_000 / f0));
    for (let order = 1; order <= harmonicLimit; order += 1) {
      const frequency = order * f0;
      const formantA =
        0.28 +
        2.1 * resonance(frequency, 800, 190) +
        1.45 * resonance(frequency, 1_250, 260) +
        0.8 * resonance(frequency, 2_800, 430);
      const formantI =
        0.24 +
        1.7 * resonance(frequency, 330, 120) +
        1.7 * resonance(frequency, 2_250, 330) +
        0.7 * resonance(frequency, 3_050, 480);
      const gain =
        ((1 - vowelBlend) * formantA + vowelBlend * formantI) /
        order ** 1.18;
      harmonic += gain * Math.sin(order * phase + order * 0.13);
      harmonicNorm += gain * gain;
    }
    harmonic /= Math.max(0.35, Math.sqrt(harmonicNorm) * 0.82);

    const rawNoise = whiteNoise();
    pinkish = 0.86 * pinkish + 0.14 * rawNoise;
    const aspiration = (0.45 * rawNoise + 0.55 * pinkish) *
      (0.38 + 0.62 * Math.abs(Math.sin(phase / 2)));
    const inBurst =
      bursts &&
      [0.62, 1.58, 2.52].some(
        (start) => time >= start && time < start + 0.085
      );
    const burstNoise = inBurst ? rawNoise * 0.12 : 0;

    // Simple phone-like DC/high-pass response and soft limiter.
    const mixed =
      0.19 * harmonic * envelope +
      roomNoise * rawNoise +
      raspNoise * aspiration * envelope +
      burstNoise;
    const highPassed = mixed - previous * 0.94;
    previous = mixed;
    signal[index] = Math.tanh((mixed * 0.82 + highPassed * 0.18) * 1.35);
  }
  return signal;
}

function expectedLabel(texture: Texture): RaspLabel {
  if (texture === "clean") return "Чистый";
  if (texture === "light") return "С лёгкой хрипотцой";
  return "Выраженная хрипотца";
}

let failed = 0;
function expect(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    failed += 1;
  }
}

async function runScenario(scenario: Scenario): Promise<void> {
  const signal = makeSignal(scenario);
  const result = await analyzeVoiceSamples(
    signal,
    scenario.sampleRate,
    scenario.gender
  );
  const label = result
    ? mapFlatnessToRasp(result.robustRaspEvidence).label
    : "unknown";
  const prefix = [
    scenario.gender.padEnd(6),
    `${scenario.f0}`.padStart(3),
    `${scenario.sampleRate / 1_000}k`.padStart(5),
    scenario.texture.padEnd(6),
    scenario.bursts ? "bursts" : "steady",
  ].join(" ");
  if (!result) {
    console.log(`${prefix} | unknown`);
    expect(false, `${prefix}: production analysis returned unknown`);
    return;
  }
  console.log(
    `${prefix} | f0=${result.medianHz.toFixed(1)} ` +
      `flat=${result.robustFlatness.toFixed(5)} ` +
      `per=${result.p25Periodicity.toFixed(4)}/${result.medianPeriodicity.toFixed(4)} ` +
      `raw=${result.rawRobustRaspEvidence.toFixed(5)} ` +
      `factor=${result.raspCompensationFactor.toFixed(3)} ` +
      `final=${result.robustRaspEvidence.toFixed(5)} ` +
      `frames=${result.reliableRaspFrameCount}/${result.rejectedRaspFrameCount} ` +
      `=> ${label}`
  );
  expect(
    label === expectedLabel(scenario.texture),
    `${prefix}: expected ${expectedLabel(scenario.texture)}, got ${label}`
  );
}

async function main(): Promise<void> {
  console.log(
    "gender f0 sample texture content | median-f0 flatness-p35 periodicity-p25/median raw-evidence frames => label"
  );
  for (const sampleRate of SAMPLE_RATES) {
    for (const f0 of MALE_F0) {
      for (const texture of ["clean", "light", "strong"] as const) {
        await runScenario({
          gender: "male",
          f0,
          sampleRate,
          texture,
          bursts: texture === "clean",
          roomNoise: texture === "clean" ? 0.0002 : 0.0028,
        });
      }
    }
    for (const f0 of FEMALE_F0) {
      for (const texture of ["clean", "light", "strong"] as const) {
        await runScenario({
          gender: "female",
          f0,
          sampleRate,
          texture,
          bursts: texture === "clean",
          roomNoise: 0.0028,
        });
      }
    }
  }
  if (failed > 0) process.exit(1);
  console.log("OK: cross-rate female/male production rasp matrix");
}

void main();
