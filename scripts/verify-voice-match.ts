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
  selectArchetypeRepresentatives,
} from "../lib/vocal-archetype";
import {
  clampAndMap,
  centroidHzToWeight,
  flatnessToRaspiness,
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
  flatnessToRaspiness(0) === 0 && flatnessToRaspiness(0.1) === 100,
  "flatness normalization"
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
    brightness: "high",
    rasp: "high",
    region: "western",
    genre: "Rock",
    limit: 5,
  },
  fixture
);
check(selected.map((star) => star.id).join(",") === "exact,fallback", "exact categorical priority and fallback");
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
check(!componentSource.includes(".percent"), "UI does not render match percentages");
check(!componentSource.includes("Ближайший двойник"), "UI makes no celebrity-match claim");

if (failed > 0) process.exit(1);
console.log(
  "OK: normalization, Fach, bins, archetype names and reference filtering"
);
