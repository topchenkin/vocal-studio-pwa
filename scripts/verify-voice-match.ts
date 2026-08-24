/**
 * Sanity-check that clean-pop vs gritty-rock takes no longer share a top star.
 * Run: npx tsx scripts/verify-voice-match.ts
 */
import {
  CELEBRITIES_DB,
  matchCelebrities,
  groupMatchesByDecadeAndGenre,
  MIN_DISPLAY_PERCENT,
  type TimbreVector,
  type VocalFach,
  type CelebrityGender,
} from "../lib/celebritiesDB";

function topNames(
  gender: CelebrityGender,
  fach: VocalFach,
  user: TimbreVector,
  n = 3
) {
  return matchCelebrities(gender, fach, user)
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

const cases: Array<[string, CelebrityGender, VocalFach, TimbreVector]> = [
  ["female mezzo clean pop", "female", "mezzo_soprano", cleanPop],
  ["female mezzo grit rock", "female", "mezzo_soprano", gritRock],
  ["female mezzo breathy", "female", "mezzo_soprano", breathy],
  ["male tenor clean pop", "male", "tenor", cleanPop],
  ["male tenor grit rock", "male", "tenor", gritRock],
  ["male baritone grit rock", "male", "bass_baritone", gritRock],
];

let failed = 0;
for (const [label, gender, fach, vec] of cases) {
  const names = topNames(gender, fach, vec, 5);
  console.log(label + ":", names.join(", "));
}

const popTop = topNames("female", "mezzo_soprano", cleanPop, 1)[0];
const rockTop = topNames("female", "mezzo_soprano", gritRock, 1)[0];
const breathTop = topNames("female", "mezzo_soprano", breathy, 1)[0];
if (popTop === rockTop) {
  console.error("FAIL: clean pop and grit rock share top star", popTop);
  failed += 1;
}
if (popTop === breathTop) {
  console.error("FAIL: clean pop and breathy share top star", popTop);
  failed += 1;
}

const malePop = topNames("male", "tenor", cleanPop, 1)[0];
const maleRock = topNames("male", "tenor", gritRock, 1)[0];
if (malePop === maleRock) {
  console.error("FAIL: male pop/rock share top star", malePop);
  failed += 1;
}

const buckets: Record<string, number> = {};
for (const c of CELEBRITIES_DB) {
  const key = `${c.decade}/${c.region}/${c.genre}`;
  buckets[key] = (buckets[key] ?? 0) + 1;
}
console.log("\nDB size", CELEBRITIES_DB.length);
console.log("Buckets", buckets);

const grouped = groupMatchesByDecadeAndGenre(
  matchCelebrities("female", "mezzo_soprano", cleanPop),
  5
);
for (const decade of ["1990s", "2000s", "2010s", "2020s"] as const) {
  const cell = grouped[decade];
  if (!cell) continue;
  console.log(
    `\nFemale mezzo clean — ${decade} pop`,
    cell.Pop?.map((m) => `${m.celebrity.name} ${m.percent}%`)
  );
  console.log(
    `Female mezzo clean — ${decade} rock`,
    cell.Rock?.map((m) => `${m.celebrity.name} ${m.percent}%`)
  );
}

const groupedRock = groupMatchesByDecadeAndGenre(
  matchCelebrities("female", "mezzo_soprano", gritRock),
  5
);
console.log(
  "\nFemale mezzo grit — 2010s rock",
  groupedRock["2010s"]?.Rock?.map((m) => `${m.celebrity.name} ${m.percent}%`)
);

for (const decade of Object.keys(grouped)) {
  for (const genre of Object.keys(grouped[decade as keyof typeof grouped] ?? {})) {
    const list = grouped[decade as "1990s"]?.[genre as "Pop"] ?? [];
    if (list.some((m) => m.percent < MIN_DISPLAY_PERCENT)) {
      console.error("FAIL: displayed match below 50%", decade, genre);
      failed += 1;
    }
    if (list.length > 5) {
      console.error("FAIL: more than 5 in a cell", decade, genre, list.length);
      failed += 1;
    }
  }
}

if (failed > 0) {
  process.exit(1);
}
console.log("\nOK: style vectors produce distinct top stars");
