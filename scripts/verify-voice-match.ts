/**
 * Deterministic DSP/ranking sanity suite.
 * Run: npx tsx scripts/verify-voice-match.ts
 */
import {
  CELEBRITIES_DB,
  FACH_MISMATCH_PENALTY,
  MIN_DISPLAY_PERCENT,
  RAW_DISTANCE_GARBAGE_THRESHOLD,
  RECALIBRATION_BEST_MAX_PERCENT,
  RECALIBRATION_BEST_MIN_PERCENT,
  RECALIBRATION_OTHERS_MAX_PERCENT,
  RECALIBRATION_OTHERS_MIN_PERCENT,
  distanceToPercent,
  groupMatchesByDecadeAndGenre,
  matchCelebrities,
  rankCelebrities,
  weightedDistance,
  type CelebrityProfile,
  type TimbreVector,
} from "../lib/celebritiesDB";
import {
  clampAndMap,
  centroidHzToWeight,
  flatnessToRaspiness,
  zcrCountToRate,
  zcrRateToAiriness,
} from "../lib/timbre-features";

let failed = 0;

function check(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    failed += 1;
  }
}

function close(actual: number, expected: number, message: string): void {
  check(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} != ${expected}`);
}

// Fixed linear normalization and strict clamping.
close(clampAndMap(150, 150, 1500), 0, "centroid lower boundary");
close(clampAndMap(825, 150, 1500), 50, "centroid midpoint");
close(clampAndMap(1500, 150, 1500), 100, "centroid upper boundary");
close(clampAndMap(-999, 0, 0.1), 0, "strict low clamp");
close(clampAndMap(999, 0, 0.1), 100, "strict high clamp");
check(centroidHzToWeight(150) === 0 && centroidHzToWeight(1500) === 100, "centroid map");
check(flatnessToRaspiness(0) === 0 && flatnessToRaspiness(0.1) === 100, "flatness map");

// Meyda 5.6.3 returns crossing count/frame. 80 / 2048 is the actual rate.
close(zcrCountToRate(80, 2048), 80 / 2048, "ZCR count-to-rate");
check(zcrRateToAiriness(0) === 0, "ZCR air lower boundary");
check(zcrRateToAiriness(0.1) === 50, "ZCR air midpoint");
check(zcrRateToAiriness(0.2) === 100, "ZCR air upper boundary");
check(zcrRateToAiriness(80) === 100, "ZCR air strict high clamp");

const origin: TimbreVector = {
  timbreWeight: 0,
  airiness: 0,
  raspiness: 0,
};
const tenEach = {
  ...origin,
  timbreWeight: 10,
  airiness: 10,
  raspiness: 10,
} as CelebrityProfile;
close(weightedDistance(origin, tenEach), 10, "weighted Euclidean sum");
close(
  weightedDistance(origin, { ...tenEach, airiness: 0, raspiness: 0 }),
  Math.sqrt(0.6 * 100),
  "60% timbre coefficient"
);

const mockBase: CelebrityProfile = {
  id: "same",
  name: "Same",
  gender: "male",
  vocalFach: "tenor",
  genre: "Pop",
  region: "western",
  decade: "2010s",
  timbreWeight: 50,
  airiness: 50,
  raspiness: 50,
  tessituraSpan: 50,
};
const fachRank = rankCelebrities(
  [
    mockBase,
    { ...mockBase, id: "cross", name: "Cross", vocalFach: "bass_baritone" },
  ],
  { timbreWeight: 50, airiness: 50, raspiness: 50 },
  { userFach: "tenor" }
);
close(fachRank[0]?.distance ?? -1, 0, "same fach distance");
close(fachRank[1]?.distance ?? -1, FACH_MISMATCH_PENALTY, "soft fach prior");

check(distanceToPercent(5) > distanceToPercent(15), "raw similarity monotonicity");
check(distanceToPercent(15) > distanceToPercent(30), "raw similarity monotonicity 2");

const bieberLike: TimbreVector = {
  timbreWeight: 90,
  airiness: 52,
  raspiness: 2,
  tessituraSpan: 5, // deliberately irrelevant to required 3-D geometry
};
const deepRaspy: TimbreVector = {
  timbreWeight: 35,
  airiness: 10,
  raspiness: 92,
  tessituraSpan: 100,
};
const malePool = CELEBRITIES_DB.filter((c) => c.gender === "male");
const byName = (name: string) => {
  const star = malePool.find((c) => c.name === name);
  if (!star) throw new Error(`Missing required DB fixture: ${name}`);
  return star;
};
const bieber = byName("Justin Bieber");
const leps = byName("Григорий Лепс");
const kipelov = byName("Валерий Кипелов");

const lightDistances = {
  bieber: weightedDistance(bieberLike, bieber),
  leps: weightedDistance(bieberLike, leps),
  kipelov: weightedDistance(bieberLike, kipelov),
};
check(lightDistances.bieber < lightDistances.leps, "Bieber-like ranks ahead of Leps");
check(lightDistances.bieber < lightDistances.kipelov, "Bieber-like ranks ahead of Kipelov");
check(
  lightDistances.kipelov > RAW_DISTANCE_GARBAGE_THRESHOLD,
  "Kipelov rejected for light/airy/clean vector"
);

const deepDistances = {
  bieber: weightedDistance(deepRaspy, bieber),
  leps: weightedDistance(deepRaspy, leps),
  kipelov: weightedDistance(deepRaspy, kipelov),
};
check(deepDistances.leps < deepDistances.bieber, "deep/raspy ranks Leps ahead of Bieber");
check(deepDistances.kipelov < deepDistances.bieber, "deep/raspy ranks Kipelov ahead of Bieber");

// DB semantic audit: larger timbreWeight is brighter/lighter, matching centroid.
check(bieber.timbreWeight > leps.timbreWeight, "DB brightness direction Bieber > Leps");
check(kipelov.timbreWeight > leps.timbreWeight, "DB bright ringing tenor > dark Leps");

for (const [label, vector, fach] of [
  ["light", bieberLike, "tenor"],
  ["deep", deepRaspy, "bass_baritone"],
] as const) {
  const matches = matchCelebrities("male", vector, { userFach: fach });
  check(matches.length > 0, `${label}: eligible cohort exists`);
  check(
    matches.every((m) => m.distance <= RAW_DISTANCE_GARBAGE_THRESHOLD),
    `${label}: garbage rejected before UX calibration`
  );
  check(
    matches.every((m) => m.percent >= MIN_DISPLAY_PERCENT && m.percent <= 100),
    `${label}: displayed percent bounds`
  );
  check(
    (matches[0]?.percent ?? 0) >= RECALIBRATION_BEST_MIN_PERCENT &&
      (matches[0]?.percent ?? 101) <= RECALIBRATION_BEST_MAX_PERCENT,
    `${label}: best in 85-96`
  );
  check(
    matches.slice(1, 5).every(
      (m) =>
        m.percent >= RECALIBRATION_OTHERS_MIN_PERCENT &&
        m.percent <= RECALIBRATION_OTHERS_MAX_PERCENT
    ),
    `${label}: remaining top-5 in 70-85`
  );
  check(
    matches.every((m, i) => i === 0 || matches[i - 1]!.distance <= m.distance),
    `${label}: distance ordering preserved`
  );

  const grouped = groupMatchesByDecadeAndGenre(matches, 5);
  for (const eras of Object.values(grouped)) {
    for (const bucket of Object.values(eras ?? {})) {
      check((bucket?.length ?? 0) <= 5, `${label}: bucket is up to five`);
      check(
        (bucket ?? []).every((m) => m.distance <= RAW_DISTANCE_GARBAGE_THRESHOLD),
        `${label}: no garbage bucket padding`
      );
    }
  }
}

console.log("Bieber-like distances:", lightDistances);
console.log("Deep/raspy distances:", deepDistances);

if (failed > 0) process.exit(1);
console.log("OK: DSP normalization, 3-D ranking, fach prior, UX calibration, DB semantics");
