/**
 * Sanity-check gender-only matching + style separation + ≥50% display floor.
 * Run: npx tsx scripts/verify-voice-match.ts
 */
import {
  CELEBRITIES_DB,
  matchCelebrities,
  groupMatchesByDecadeAndGenre,
  MIN_DISPLAY_PERCENT,
  RECALIBRATION_CAP_PERCENT,
  recalibratePercentsIfEmpty,
  distanceToPercent,
  weightedDistance,
  FACH_MISMATCH_SIMILARITY,
  type TimbreVector,
  type VocalFach,
  type CelebrityGender,
} from "../lib/celebritiesDB";

function topNames(
  gender: CelebrityGender,
  user: TimbreVector,
  fach: VocalFach | null,
  n = 3
) {
  return matchCelebrities(gender, user, { userFach: fach })
    .slice(0, n)
    .map((m) => m.celebrity.name);
}

const cleanPop: TimbreVector = {
  timbreWeight: 78,
  airiness: 38,
  raspiness: 8,
  tessituraSpan: 42,
};
const gritRock: TimbreVector = {
  timbreWeight: 58,
  airiness: 14,
  raspiness: 78,
  tessituraSpan: 62,
};
const breathy: TimbreVector = {
  timbreWeight: 84,
  airiness: 88,
  raspiness: 6,
  tessituraSpan: 24,
};
/** Mid-range laptop take that used to hard-filter into tiny rock pools. */
const midNoisy: TimbreVector = {
  timbreWeight: 70,
  airiness: 22,
  raspiness: 48,
  tessituraSpan: 28,
};

const cases: Array<[string, CelebrityGender, VocalFach | null, TimbreVector]> = [
  ["female mezzo clean pop", "female", "mezzo_soprano", cleanPop],
  ["female mezzo grit rock", "female", "mezzo_soprano", gritRock],
  ["female mezzo breathy", "female", "mezzo_soprano", breathy],
  ["female contralto mid-noisy", "female", "contralto", midNoisy],
  ["male tenor clean pop", "male", "tenor", cleanPop],
  ["male tenor grit rock", "male", "tenor", gritRock],
  ["male baritone grit rock", "male", "bass_baritone", gritRock],
];

let failed = 0;
for (const [label, gender, fach, vec] of cases) {
  const names = topNames(gender, vec, fach, 5);
  console.log(label + ":", names.join(", "));
}

const popTop = topNames("female", cleanPop, "mezzo_soprano", 1)[0];
const rockTop = topNames("female", gritRock, "mezzo_soprano", 1)[0];
const breathTop = topNames("female", breathy, "mezzo_soprano", 1)[0];
if (popTop === rockTop) {
  console.error("FAIL: clean pop and grit rock share top star", popTop);
  failed += 1;
}
if (popTop === breathTop) {
  console.error("FAIL: clean pop and breathy share top star", popTop);
  failed += 1;
}

const malePop = topNames("male", cleanPop, "tenor", 1)[0];
const maleRock = topNames("male", gritRock, "tenor", 1)[0];
if (malePop === maleRock) {
  console.error("FAIL: male pop/rock share top star", malePop);
  failed += 1;
}

// Opposite gender must never appear
const femaleMatches = matchCelebrities("female", cleanPop);
if (femaleMatches.some((m) => m.celebrity.gender !== "female")) {
  console.error("FAIL: opposite gender leaked into female pool");
  failed += 1;
}

const buckets: Record<string, number> = {};
for (const c of CELEBRITIES_DB) {
  const key = `${c.decade}/${c.region}/${c.genre}`;
  buckets[key] = (buckets[key] ?? 0) + 1;
}
console.log("\nDB size", CELEBRITIES_DB.length);
console.log("Buckets", buckets);

const midMatches = matchCelebrities("female", midNoisy, {
  userFach: "contralto",
});
const midAbove = midMatches.filter((m) => m.percent >= MIN_DISPLAY_PERCENT);
const midPop = midAbove.filter((m) => m.celebrity.genre === "Pop").length;
const midRock = midAbove.filter((m) => m.celebrity.genre === "Rock").length;
console.log(
  `\nFemale mid-noisy: above50=${midAbove.length} Pop=${midPop} Rock=${midRock}`
);
console.log(
  "  top8:",
  midMatches
    .slice(0, 8)
    .map((m) => `${m.celebrity.name} ${m.percent}% ${m.celebrity.genre}`)
    .join(" | ")
);
if (midAbove.length < 10) {
  console.error("FAIL: mid-noisy female should clear ≥50% for many neighbours", midAbove.length);
  failed += 1;
}
if (midPop === 0) {
  console.error("FAIL: mid-noisy female must surface Pop, not only Rock");
  failed += 1;
}

const grouped = groupMatchesByDecadeAndGenre(
  matchCelebrities("female", cleanPop, { userFach: "mezzo_soprano" }),
  5
);
let erasWithHits = 0;
for (const decade of ["1990s", "2000s", "2010s", "2020s"] as const) {
  const cell = grouped[decade];
  if (!cell) continue;
  const popN = cell.Pop?.length ?? 0;
  const rockN = cell.Rock?.length ?? 0;
  if (popN + rockN > 0) erasWithHits += 1;
  console.log(
    `\nFemale clean — ${decade} pop`,
    cell.Pop?.map((m) => `${m.celebrity.name} ${m.percent}%`)
  );
  console.log(
    `Female clean — ${decade} rock`,
    cell.Rock?.map((m) => `${m.celebrity.name} ${m.percent}%`)
  );
}
if (erasWithHits < 2) {
  console.error("FAIL: clean pop should fill at least 2 eras above 50%", erasWithHits);
  failed += 1;
}

const cleanAbove = matchCelebrities("female", cleanPop, {
  userFach: "mezzo_soprano",
}).filter((m) => m.percent >= MIN_DISPLAY_PERCENT).length;
if (cleanAbove < 20) {
  console.error("FAIL: too few ≥50% neighbours for a normal pop vector", cleanAbove);
  failed += 1;
}

// Recalibration must not mint 99%s
const far: TimbreVector = {
  timbreWeight: 5,
  airiness: 5,
  raspiness: 5,
  tessituraSpan: 5,
};
const rawFar = CELEBRITIES_DB.filter((c) => c.gender === "male").map((celebrity) => {
  const distance = weightedDistance(far, celebrity);
  const rawPercent = distanceToPercent(distance);
  return {
    celebrity,
    distance,
    percent: rawPercent,
    rawPercent,
  };
});
const recal = recalibratePercentsIfEmpty(rawFar);
const maxRecal = recal.reduce((m, x) => Math.max(m, x.percent), 0);
console.log("\nFar-vector recal max%", maxRecal);
if (maxRecal > RECALIBRATION_CAP_PERCENT) {
  console.error(
    `FAIL: recalibration minted >${RECALIBRATION_CAP_PERCENT}%`,
    maxRecal
  );
  failed += 1;
}
if (maxRecal < MIN_DISPLAY_PERCENT) {
  console.error("FAIL: recalibration should lift best to ≥50%", maxRecal);
  failed += 1;
}

// Soft fach: mismatch shrinks display % by ~18%, never empties the pool
const sameFach = matchCelebrities("male", gritRock, {
  userFach: "bass_baritone",
  recalibrateIfEmpty: false,
});
const crossFach = matchCelebrities("male", gritRock, {
  userFach: "tenor",
  recalibrateIfEmpty: false,
});
const crossHit = crossFach.find(
  (m) => m.celebrity.vocalFach === "bass_baritone" && m.fachMismatch
);
if (!crossHit) {
  console.error("FAIL: fach mismatch should still keep opposite-fach stars");
  failed += 1;
} else {
  const expected = Math.round(crossHit.rawPercent * FACH_MISMATCH_SIMILARITY);
  if (crossHit.percent !== expected) {
    console.error(
      "FAIL: fach mismatch percent factor",
      crossHit.percent,
      "!=",
      expected
    );
    failed += 1;
  }
}
if (sameFach.length === 0 || crossFach.length === 0) {
  console.error("FAIL: fach prior must never empty the DB");
  failed += 1;
}

for (const decade of Object.keys(grouped)) {
  for (const genre of Object.keys(grouped[decade as keyof typeof grouped] ?? {})) {
    const list = grouped[decade as "1990s"]?.[genre as "Pop"] ?? [];
    if (list.length > 5) {
      console.error("FAIL: more than 5 in a cell", decade, genre, list.length);
      failed += 1;
    }
  }
}

if (failed > 0) {
  process.exit(1);
}
console.log(
  "\nOK: gender-only matching + style separation + soft fach + floor recalibration"
);
