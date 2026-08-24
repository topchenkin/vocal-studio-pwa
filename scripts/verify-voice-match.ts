/**
 * Deterministic Vocal Archetype sanity suite.
 * Run: npx tsx scripts/verify-voice-match.ts
 */
import { readFileSync } from "node:fs";
import {
  CELEBRITIES_DB,
  FEMALE_FACH_SPLIT_HZ,
  MALE_FACH_SPLIT_HZ,
  classifyVocalFach,
  type CelebrityProfile,
} from "../lib/celebritiesDB";
import {
  FEATURE_BIN_HIGH_START,
  FEATURE_BIN_MID_START,
  archetypeName,
  deriveVocalArchetype,
  featureBin,
  pitchHeight,
  rankCelebrityCandidates,
  selectArchetypeRepresentatives,
} from "../lib/vocal-archetype";
import {
  VoiceMeasurementAccumulator,
  calibrateRaspEvidence,
  clampAndMap,
  centroidHzToWeight,
  flatnessToRaspiness,
  mapFlatnessToRasp,
} from "../lib/timbre-features";

let failed = 0;
function check(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    failed += 1;
  }
}

// Fixed normalization is strictly clamped to 0–100.
check(clampAndMap(-1, 0, 1) === 0, "normalization lower clamp");
check(clampAndMap(2, 0, 1) === 100, "normalization upper clamp");
check(
  centroidHzToWeight(150) === 0 && centroidHzToWeight(2000) === 100,
  "centroid normalization"
);
check(
  flatnessToRaspiness(0) === 0 && flatnessToRaspiness(0.16) === 100,
  "flatness normalization"
);
check(
  mapFlatnessToRasp(0.004).label === "Чистый" &&
    mapFlatnessToRasp(0.00401).label === "С лёгкой хрипотцой" &&
    mapFlatnessToRasp(0.05).label === "С лёгкой хрипотцой" &&
    mapFlatnessToRasp(0.05001).label === "Выраженная хрипотца",
  "flatness category boundaries"
);
check(
  mapFlatnessToRasp(0.0015).label === "Чистый" &&
    mapFlatnessToRasp(0.016).label === "С лёгкой хрипотцой" &&
    mapFlatnessToRasp(0.08).label === "Выраженная хрипотца",
  "clean, moderate and strong harmonic-noise calibration"
);
const femaleCleanCalibration = calibrateRaspEvidence(0.015, "female", 440);
const femaleLightCalibration = calibrateRaspEvidence(0.04, "female", 440);
const femaleStrongCalibration = calibrateRaspEvidence(0.09, "female", 440);
check(
  mapFlatnessToRasp(femaleCleanCalibration.compensatedEvidence).label ===
    "Чистый" &&
    mapFlatnessToRasp(femaleLightCalibration.compensatedEvidence).label ===
      "С лёгкой хрипотцой" &&
    mapFlatnessToRasp(femaleStrongCalibration.compensatedEvidence).label ===
      "Выраженная хрипотца",
  "female F0-aware clean/light/strong calibration"
);
check(
  calibrateRaspEvidence(0.015, "male", 140).compensatedEvidence === 0.015 &&
    calibrateRaspEvidence(0.09, "male", 140).compensatedEvidence === 0.09,
  "male rasp calibration remains identity"
);

// Stable feature thirds: 0–33 / 34–66 / 67–100.
check(featureBin(0) === "low" && featureBin(33) === "low", "low bin");
check(
  featureBin(FEATURE_BIN_MID_START) === "mid" &&
    featureBin(66) === "mid",
  "mid bin"
);
check(
  featureBin(FEATURE_BIN_HIGH_START) === "high" &&
    featureBin(100) === "high",
  "high bin"
);

// Median F0 drives deterministic selected-gender Fach and height.
check(
  classifyVocalFach("male", MALE_FACH_SPLIT_HZ - 0.01) ===
    "bass_baritone" &&
    classifyVocalFach("male", MALE_FACH_SPLIT_HZ) === "tenor",
  "male Fach boundary"
);
check(
  classifyVocalFach("female", FEMALE_FACH_SPLIT_HZ - 0.01) ===
    "contralto" &&
    classifyVocalFach("female", FEMALE_FACH_SPLIT_HZ) === "mezzo_soprano",
  "female Fach boundary"
);
check(
  pitchHeight("male", 120) === "low" &&
    pitchHeight("male", 165) === "mid" &&
    pitchHeight("male", 200) === "high",
  "male pitch-height bands"
);
check(
  pitchHeight("female", 180) === "low" &&
    pitchHeight("female", 220) === "mid" &&
    pitchHeight("female", 270) === "high",
  "female pitch-height bands"
);

check(
  archetypeName("bass_baritone", "low", "mid") ===
    "Драматический бас-баритон",
  "archetype naming matrix"
);
const changedGender = deriveVocalArchetype("female", 180, 20, 50);
check(
  changedGender.fach === "contralto" &&
    changedGender.name === "Драматический контральто",
  "archetype derives entirely from stored metrics and selected gender"
);

const syntheticTakes = {
  A: deriveVocalArchetype("male", 190, 90, 10),
  B: deriveVocalArchetype("male", 190, 10, 90),
  C: deriveVocalArchetype("male", 190, 50, 50),
};
check(
  syntheticTakes.A.name === "Звонкий тенор" &&
    syntheticTakes.B.name === "Хриплый тенор" &&
    syntheticTakes.C.name === "Характерный тенор",
  "opposite A/B/C feature vectors produce distinct tenor archetypes"
);
check(
  Object.values(syntheticTakes).every((take) => take.fach === "tenor"),
  "A/B/C remain inside exact male tenor Fach"
);

const syntheticRepresentatives = Object.fromEntries(
  Object.entries(syntheticTakes).map(([key, take]) => [
    key,
    selectArchetypeRepresentatives({
      gender: "male",
      fach: take.fach,
      userWeight: key === "A" ? 90 : key === "B" ? 10 : 50,
      userRaspiness: key === "A" ? 10 : key === "B" ? 90 : 50,
      region: "western",
      genre: "Pop",
      limit: 5,
    }),
  ])
) as Record<keyof typeof syntheticTakes, CelebrityProfile[]>;
const representativeIds = (key: keyof typeof syntheticTakes) =>
  syntheticRepresentatives[key].map((star) => star.id).join(",");
check(
  representativeIds("A") !== representativeIds("B"),
  "bright-clean and dark-raspy tenor representative ordering/lists differ"
);
check(
  Object.values(syntheticRepresentatives)
    .flat()
    .every((star) => star.gender === "male" && star.vocalFach === "tenor"),
  "A/B/C representative fallback never leaves exact gender and Fach"
);

function measuredTake(
  centroidHz: number,
  flatness: number,
  periodicity: number
) {
  const sampleRate = 48_000;
  const bufferSize = 2_048;
  const centroidBin = (centroidHz * bufferSize) / sampleRate;
  const accumulator = new VoiceMeasurementAccumulator(sampleRate, bufferSize);
  for (let frame = 0; frame < 20; frame += 1) {
    accumulator.addFrame(
      centroidBin,
      0.02,
      190 + (frame % 3),
      flatness,
      0.02,
      periodicity
    );
  }
  return accumulator.finalize();
}

const firstSequentialTake = measuredTake(1_800, 0.09, 0.5);
const secondSequentialTake = measuredTake(300, 0.005, 0.999);
check(
  firstSequentialTake?.userWeight === 89 &&
    firstSequentialTake.userRaspiness >= 67,
  "first sequential accumulator records bright/raspy data"
);
check(
  secondSequentialTake?.userWeight === 8 &&
    secondSequentialTake.userRaspiness <= 30,
  "second sequential accumulator contains only fresh dark/clean data"
);
check(
  firstSequentialTake?.frameCount === 20 &&
    secondSequentialTake?.frameCount === 20,
  "per-take feature frame arrays reset instead of accumulating"
);

const reusedAccumulator = new VoiceMeasurementAccumulator(48_000, 2_048);
const addTakeFrames = (
  centroidHz: number,
  flatness: number,
  periodicity: number
) => {
  const centroidBin = (centroidHz * 2_048) / 48_000;
  for (let frame = 0; frame < 20; frame += 1) {
    reusedAccumulator.addFrame(
      centroidBin,
      0.02,
      190,
      flatness,
      0.02,
      periodicity
    );
  }
};
addTakeFrames(1_800, 0.09, 0.5);
reusedAccumulator.reset();
addTakeFrames(300, 0.005, 0.999);
const explicitlyResetTake = reusedAccumulator.finalize();
check(
  explicitlyResetTake?.frameCount === 20 &&
    explicitlyResetTake.userWeight === 8 &&
    explicitlyResetTake.userRaspiness <= 30,
  "explicit reset clears hz, centroid, flatness, RMS and counters"
);

const fixture: CelebrityProfile[] = [
  {
    id: "exact",
    name: "Exact",
    gender: "male",
    vocalFach: "tenor",
    genre: "Rock",
    region: "western",
    decade: "1990s",
    timbreWeight: 80,
    airiness: 100,
    raspiness: 80,
    tessituraSpan: 10,
  },
  {
    id: "fallback",
    name: "Fallback",
    gender: "male",
    vocalFach: "tenor",
    genre: "Rock",
    region: "western",
    decade: "2020s",
    timbreWeight: 50,
    airiness: 0,
    raspiness: 80,
    tessituraSpan: 90,
  },
  {
    id: "wrong-fach",
    name: "Wrong Fach",
    gender: "male",
    vocalFach: "bass_baritone",
    genre: "Rock",
    region: "western",
    decade: "2020s",
    timbreWeight: 80,
    airiness: 0,
    raspiness: 80,
    tessituraSpan: 90,
  },
  {
    id: "wrong-gender",
    name: "Wrong Gender",
    gender: "female",
    vocalFach: "mezzo_soprano",
    genre: "Rock",
    region: "western",
    decade: "2020s",
    timbreWeight: 80,
    airiness: 0,
    raspiness: 80,
    tessituraSpan: 90,
  },
];

const selected = selectArchetypeRepresentatives(
  {
    gender: "male",
    fach: "tenor",
    userWeight: 80,
    userRaspiness: 80,
    region: "western",
    genre: "Rock",
    limit: 5,
  },
  fixture
);
check(selected.map((star) => star.id).join(",") === "exact,fallback", "numeric distance sorting");
check(
  selected.every(
    (star) => star.gender === "male" && star.vocalFach === "tenor"
  ),
  "representatives enforce exact gender and Fach"
);
check(
  selected.every(
    (star) =>
      !("percent" in star) &&
      !("score" in star) &&
      !("similarity" in star) &&
      !("distance" in star)
  ),
  "representative result contains no similarity data"
);

const russianPopTenors = CELEBRITIES_DB.filter(
  (star) =>
    star.gender === "male" &&
    star.vocalFach === "tenor" &&
    star.region === "russian" &&
    star.genre === "Pop"
);
const cleanTenor = rankCelebrityCandidates(
  {
    gender: "male",
    fach: "tenor",
    userWeight: 76,
    userRaspiness: 2,
    region: "russian",
    genre: "Pop",
  },
  russianPopTenors
);
const raspyTenor = rankCelebrityCandidates(
  {
    gender: "male",
    fach: "tenor",
    userWeight: 82,
    userRaspiness: 42,
    region: "russian",
    genre: "Pop",
  },
  russianPopTenors
);
check(
  cleanTenor.findIndex(({ star }) => star.name === "Николай Басков") <
    cleanTenor.findIndex(({ star }) => star.name === "Shaman"),
  "clean academic tenor ranks Baskov ahead of Shaman"
);
check(
  raspyTenor[0]?.star.name === "Shaman" &&
    raspyTenor.findIndex(({ star }) => star.name === "Shaman") <
      raspyTenor.findIndex(({ star }) => star.name === "Николай Басков"),
  "raspy tenor reverses preference toward Shaman"
);

const arianaLike = rankCelebrityCandidates({
  gender: "female",
  fach: "mezzo_soprano",
  userWeight: 96,
  userRaspiness: 0,
  region: "western",
  genre: "Pop",
});
check(
  arianaLike[0]?.star.name === "Ariana Grande",
  "Ariana-like clean bright mezzo-soprano ranks Ariana Grande first"
);
check(
  arianaLike.findIndex(({ star }) => star.name === "Ariana Grande") <
    arianaLike.findIndex(({ star }) => star.name === "Christina Aguilera") &&
    arianaLike.findIndex(({ star }) => star.name === "Ariana Grande") <
      arianaLike.findIndex(({ star }) => star.name === "Pink"),
  "clean female mezzo-soprano ranks clean references before raspy cohorts"
);

const weightFixture = fixture.slice(0, 2).map((star, index) => ({
  ...star,
  id: `weight-${index}`,
  name: index === 0 ? "Dark" : "Bright",
  timbreWeight: index === 0 ? 20 : 80,
  raspiness: 30,
}));
const darkOrder = rankCelebrityCandidates(
  {
    gender: "male",
    fach: "tenor",
    userWeight: 20,
    userRaspiness: 30,
    region: "western",
    genre: "Rock",
  },
  weightFixture
);
const brightOrder = rankCelebrityCandidates(
  {
    gender: "male",
    fach: "tenor",
    userWeight: 80,
    userRaspiness: 30,
    region: "western",
    genre: "Rock",
  },
  weightFixture
);
check(
  darkOrder[0]?.star.name === "Dark" &&
    brightOrder[0]?.star.name === "Bright",
  "changing userWeight changes numeric order"
);

const reverseSource = [...weightFixture].reverse();
const topOne = selectArchetypeRepresentatives(
  {
    gender: "male",
    fach: "tenor",
    userWeight: 20,
    userRaspiness: 30,
    region: "western",
    genre: "Rock",
    limit: 1,
  },
  reverseSource
);
check(topOne[0]?.name === "Dark", "distance sort happens before top-N slicing");

for (const gender of ["male", "female"] as const) {
  for (const fach of gender === "male"
    ? (["bass_baritone", "tenor"] as const)
    : (["contralto", "mezzo_soprano"] as const)) {
    const pool = CELEBRITIES_DB.filter(
      (star) => star.gender === gender && star.vocalFach === fach
    );
    check(pool.length > 0, `${gender}/${fach} reference pool exists`);
  }
}

const componentSource = readFileSync(
  new URL("../components/ai/TimbreMatcher.tsx", import.meta.url),
  "utf8"
);
const captureSource = readFileSync(
  new URL("../lib/pcm-capture.ts", import.meta.url),
  "utf8"
);
check(!componentSource.includes(".percent"), "UI does not render match percentages");
check(!componentSource.includes("Ближайший двойник"), "UI makes no celebrity-match claim");
check(
  componentSource.includes("setMeasurement(null)") &&
    componentSource.indexOf("setMeasurement(null)") <
      componentSource.indexOf("getSingingMicStream()"),
  "previous result is cleared before a new microphone capture"
);
check(
  !componentSource.includes("localStorage") &&
    !componentSource.includes("sessionStorage"),
  "component does not persist audio or analysis results"
);
check(
  captureSource.includes("const chunks: TimedChunk[] = [];") &&
    captureSource.includes("chunks.length = 0;"),
  "PCM chunks are session-local and cleared on stop/abort"
);

if (failed > 0) process.exit(1);
console.log(
  `A ${syntheticTakes.A.name}: ${syntheticRepresentatives.A
    .map((star) => star.name)
    .join(", ")}`
);
console.log(
  `B ${syntheticTakes.B.name}: ${syntheticRepresentatives.B
    .map((star) => star.name)
    .join(", ")}`
);
console.log(
  `C ${syntheticTakes.C.name}: ${syntheticRepresentatives.C
    .map((star) => star.name)
    .join(", ")}`
);
console.log(
  `Clean tenor: ${cleanTenor.slice(0, 5).map(({ star }) => star.name).join(", ")}`
);
console.log(
  `Raspy tenor: ${raspyTenor.slice(0, 5).map(({ star }) => star.name).join(", ")}`
);
console.log(
  "OK: calibrated rasp, numeric representatives and sequential-take isolation"
);
