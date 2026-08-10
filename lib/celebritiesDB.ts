/**
 * Reference database of 100 well-known singers for the "Vocal Fach + Timbre
 * Weight" celebrity matcher.
 *
 * ARCHITECTURE (replaces the previous synthetic-MFCC / cosine-similarity model
 * that this file used to implement): a voice is described by exactly two
 * professionally meaningful, independently measurable properties —
 *
 *   1. `vocalFach`     — the singer's tessitura bucket (where their voice
 *                        actually LIVES, not their extreme range). Derived on
 *                        the student's side from the take's MEDIAN F0, which
 *                        is a direct physical measurement of the vocal folds
 *                        and is essentially immune to microphone colouration.
 *   2. `timbreWeight`  — 0-100 tonal weight/brightness: 0 = very dark, heavy,
 *                        muffled (Barry White), 100 = very bright, ringing,
 *                        light (Монеточка). Derived on the student's side from
 *                        the median spectral centroid.
 *
 * Matching is a STRICT filter on (gender × vocalFach) followed by a
 * nearest-neighbour ranking on `timbreWeight`. A bass can therefore never be
 * matched against a tenor — which was the headline defect of the old MFCC
 * model, where mic distortion routinely turned basses into Justin Bieber.
 *
 * The per-artist fach/weight values are hand-authored from each singer's real,
 * documented vocal character (there is no licensed reference-audio corpus in
 * this project to measure them from), but unlike the deleted pseudo-MFCC
 * vectors they are directly interpretable and directly comparable to a real
 * measurement taken from the student's microphone.
 */

export type CelebrityGender = "male" | "female";

/**
 * Simple 2-value genre taxonomy used to group results in the UI (unchanged
 * from the previous model). Genres that don't map cleanly onto either
 * (rap/hip-hop, jazz/soul, classic Russian estrada/chanson, etc.) are folded
 * into whichever bucket fits better; `Pop` is the default for anything that
 * isn't clearly rock-oriented (guitar-driven rock/metal/punk and rock-icon
 * solo artists → `Rock`).
 */
export type CelebrityGenre = "Pop" | "Rock";

export const CELEBRITY_GENRES: CelebrityGenre[] = ["Pop", "Rock"];

/**
 * Tessitura bucket. Two per gender — deliberately coarse, because a single
 * median-F0 measurement from a 10-second phone-mic take cannot honestly
 * resolve finer distinctions (lyric vs dramatic, soprano vs mezzo, etc.).
 */
export type VocalFach =
  | "bass_baritone"
  | "tenor"
  | "contralto"
  | "mezzo_soprano";

export const VOCAL_FACH_LABEL_RU: Record<VocalFach, string> = {
  bass_baritone: "Бас-баритон",
  tenor: "Тенор",
  contralto: "Контральто",
  mezzo_soprano: "Меццо-сопрано",
};

export interface CelebrityProfile {
  id: string;
  name: string;
  gender: CelebrityGender;
  vocalFach: VocalFach;
  /** 0-100: 0 = very dark/heavy/muffled, 100 = very bright/ringing/light. */
  timbreWeight: number;
  genre: CelebrityGenre;
}

/** Cyrillic → Latin transliteration used to build stable, readable, ASCII slug ids. */
const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

function slugify(name: string): string {
  let translit = "";
  for (const ch of name.toLowerCase()) {
    translit += CYRILLIC_TO_LATIN[ch] ?? ch;
  }
  return translit.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

type RawEntry = Omit<CelebrityProfile, "id">;

// prettier-ignore
const RAW_ENTRIES: RawEntry[] = [
  // ЗАРУБЕЖНЫЕ ЖЕНЩИНЫ
  { name: "Adele",              gender: "female", vocalFach: "contralto",     timbreWeight: 35,  genre: "Pop"  },
  { name: "Billie Eilish",      gender: "female", vocalFach: "mezzo_soprano", timbreWeight: 85,  genre: "Pop"  },
  { name: "Ariana Grande",      gender: "female", vocalFach: "mezzo_soprano", timbreWeight: 95,  genre: "Pop"  },
  { name: "Whitney Houston",    gender: "female", vocalFach: "mezzo_soprano", timbreWeight: 88,  genre: "Pop"  },
  { name: "Amy Winehouse",      gender: "female", vocalFach: "contralto",     timbreWeight: 30,  genre: "Pop"  },
  { name: "Beyonce",            gender: "female", vocalFach: "mezzo_soprano", timbreWeight: 75,  genre: "Pop"  },
  { name: "Lady Gaga",          gender: "female", vocalFach: "mezzo_soprano", timbreWeight: 65,  genre: "Pop"  },
  { name: "Mariah Carey",       gender: "female", vocalFach: "mezzo_soprano", timbreWeight: 92,  genre: "Pop"  },
  { name: "Celine Dion",        gender: "female", vocalFach: "mezzo_soprano", timbreWeight: 82,  genre: "Pop"  },
  { name: "Sia",                gender: "female", vocalFach: "mezzo_soprano", timbreWeight: 78,  genre: "Pop"  },
  { name: "Taylor Swift",       gender: "female", vocalFach: "mezzo_soprano", timbreWeight: 70,  genre: "Pop"  },
  { name: "Dua Lipa",           gender: "female", vocalFach: "contralto",     timbreWeight: 45,  genre: "Pop"  },
  { name: "Lana Del Rey",       gender: "female", vocalFach: "contralto",     timbreWeight: 22,  genre: "Pop"  },
  { name: "Shakira",            gender: "female", vocalFach: "contralto",     timbreWeight: 50,  genre: "Pop"  },
  { name: "Miley Cyrus",        gender: "female", vocalFach: "contralto",     timbreWeight: 38,  genre: "Rock" },
  { name: "Rihanna",            gender: "female", vocalFach: "mezzo_soprano", timbreWeight: 60,  genre: "Pop"  },
  { name: "Janis Joplin",       gender: "female", vocalFach: "mezzo_soprano", timbreWeight: 58,  genre: "Rock" },
  { name: "Cher",               gender: "female", vocalFach: "contralto",     timbreWeight: 20,  genre: "Pop"  },
  { name: "Tina Turner",        gender: "female", vocalFach: "contralto",     timbreWeight: 35,  genre: "Rock" },
  { name: "Katy Perry",         gender: "female", vocalFach: "mezzo_soprano", timbreWeight: 68,  genre: "Pop"  },

  // РОССИЙСКИЕ ЖЕНЩИНЫ
  { name: "Полина Гагарина",    gender: "female", vocalFach: "mezzo_soprano", timbreWeight: 80,  genre: "Pop"  },
  { name: "Zivert",             gender: "female", vocalFach: "contralto",     timbreWeight: 48,  genre: "Pop"  },
  { name: "Anna Asti",          gender: "female", vocalFach: "mezzo_soprano", timbreWeight: 58,  genre: "Pop"  },
  { name: "Земфира",            gender: "female", vocalFach: "contralto",     timbreWeight: 40,  genre: "Rock" },
  { name: "Алла Пугачева",      gender: "female", vocalFach: "mezzo_soprano", timbreWeight: 55,  genre: "Pop"  },
  { name: "Пелагея",            gender: "female", vocalFach: "mezzo_soprano", timbreWeight: 78,  genre: "Rock" },
  { name: "Лолита",             gender: "female", vocalFach: "contralto",     timbreWeight: 25,  genre: "Pop"  },
  { name: "Монеточка",          gender: "female", vocalFach: "mezzo_soprano", timbreWeight: 100, genre: "Pop"  },
  { name: "Слава",              gender: "female", vocalFach: "contralto",     timbreWeight: 32,  genre: "Pop"  },
  { name: "МакSим",             gender: "female", vocalFach: "mezzo_soprano", timbreWeight: 87,  genre: "Pop"  },
  { name: "Нюша",               gender: "female", vocalFach: "mezzo_soprano", timbreWeight: 89,  genre: "Pop"  },
  { name: "Клава Кока",         gender: "female", vocalFach: "mezzo_soprano", timbreWeight: 93,  genre: "Pop"  },
  { name: "Ёлка",               gender: "female", vocalFach: "mezzo_soprano", timbreWeight: 72,  genre: "Pop"  },
  { name: "Лариса Долина",      gender: "female", vocalFach: "contralto",     timbreWeight: 42,  genre: "Pop"  },
  { name: "Любовь Успенская",   gender: "female", vocalFach: "contralto",     timbreWeight: 28,  genre: "Pop"  },
  { name: "Темникова",          gender: "female", vocalFach: "mezzo_soprano", timbreWeight: 66,  genre: "Pop"  },
  { name: "Mary Gu",            gender: "female", vocalFach: "mezzo_soprano", timbreWeight: 84,  genre: "Pop"  },
  { name: "Диана Арбенина",     gender: "female", vocalFach: "contralto",     timbreWeight: 30,  genre: "Rock" },
  { name: "Юлия Чичерина",      gender: "female", vocalFach: "mezzo_soprano", timbreWeight: 72,  genre: "Rock" },
  { name: "Валерия",            gender: "female", vocalFach: "mezzo_soprano", timbreWeight: 76,  genre: "Pop"  },

  // ЗАРУБЕЖНЫЕ МУЖЧИНЫ
  { name: "Freddie Mercury",    gender: "male",   vocalFach: "tenor",         timbreWeight: 75,  genre: "Rock" },
  { name: "Frank Sinatra",      gender: "male",   vocalFach: "bass_baritone", timbreWeight: 30,  genre: "Pop"  },
  { name: "Elvis Presley",      gender: "male",   vocalFach: "bass_baritone", timbreWeight: 40,  genre: "Rock" },
  { name: "Michael Jackson",    gender: "male",   vocalFach: "tenor",         timbreWeight: 95,  genre: "Pop"  },
  { name: "Bruno Mars",         gender: "male",   vocalFach: "tenor",         timbreWeight: 88,  genre: "Pop"  },
  { name: "Ed Sheeran",         gender: "male",   vocalFach: "tenor",         timbreWeight: 70,  genre: "Pop"  },
  { name: "The Weeknd",         gender: "male",   vocalFach: "tenor",         timbreWeight: 89,  genre: "Pop"  },
  { name: "Kurt Cobain",        gender: "male",   vocalFach: "bass_baritone", timbreWeight: 45,  genre: "Rock" },
  { name: "Chester Bennington", gender: "male",   vocalFach: "bass_baritone", timbreWeight: 55,  genre: "Rock" },
  { name: "Louis Armstrong",    gender: "male",   vocalFach: "bass_baritone", timbreWeight: 15,  genre: "Pop"  },
  { name: "Andrea Bocelli",     gender: "male",   vocalFach: "tenor",         timbreWeight: 65,  genre: "Pop"  },
  { name: "Barry White",        gender: "male",   vocalFach: "bass_baritone", timbreWeight: 10,  genre: "Pop"  },
  { name: "Eminem",             gender: "male",   vocalFach: "tenor",         timbreWeight: 72,  genre: "Pop"  },
  { name: "Sam Smith",          gender: "male",   vocalFach: "tenor",         timbreWeight: 81,  genre: "Pop"  },
  { name: "Hozier",             gender: "male",   vocalFach: "bass_baritone", timbreWeight: 35,  genre: "Rock" },
  { name: "Elton John",         gender: "male",   vocalFach: "tenor",         timbreWeight: 60,  genre: "Pop"  },
  { name: "Steven Tyler",       gender: "male",   vocalFach: "tenor",         timbreWeight: 85,  genre: "Rock" },
  { name: "Paul McCartney",     gender: "male",   vocalFach: "tenor",         timbreWeight: 68,  genre: "Rock" },
  { name: "David Bowie",        gender: "male",   vocalFach: "bass_baritone", timbreWeight: 50,  genre: "Rock" },
  { name: "Mick Jagger",        gender: "male",   vocalFach: "tenor",         timbreWeight: 74,  genre: "Rock" },

  // РОССИЙСКИЕ МУЖЧИНЫ
  { name: "Муслим Магомаев",                gender: "male", vocalFach: "bass_baritone", timbreWeight: 20, genre: "Pop"  },
  { name: "Дмитрий Хворостовский",          gender: "male", vocalFach: "bass_baritone", timbreWeight: 12, genre: "Pop"  },
  { name: "Григорий Лепс",                  gender: "male", vocalFach: "bass_baritone", timbreWeight: 40, genre: "Pop"  },
  { name: "Дима Билан",                     gender: "male", vocalFach: "tenor",         timbreWeight: 80, genre: "Pop"  },
  { name: "Сергей Лазарев",                 gender: "male", vocalFach: "tenor",         timbreWeight: 85, genre: "Pop"  },
  { name: "Баста",                          gender: "male", vocalFach: "bass_baritone", timbreWeight: 25, genre: "Pop"  },
  { name: "Леонид Агутин",                  gender: "male", vocalFach: "bass_baritone", timbreWeight: 45, genre: "Pop"  },
  { name: "Валерий Меладзе",                gender: "male", vocalFach: "tenor",         timbreWeight: 71, genre: "Pop"  },
  { name: "Niletto",                        gender: "male", vocalFach: "tenor",         timbreWeight: 78, genre: "Pop"  },
  { name: "Владимир Пресняков",             gender: "male", vocalFach: "tenor",         timbreWeight: 92, genre: "Pop"  },
  { name: "Николай Басков",                 gender: "male", vocalFach: "tenor",         timbreWeight: 68, genre: "Pop"  },
  { name: "Филипп Киркоров",                gender: "male", vocalFach: "tenor",         timbreWeight: 62, genre: "Pop"  },
  { name: "Валерий Кипелов",                gender: "male", vocalFach: "tenor",         timbreWeight: 88, genre: "Rock" },
  { name: "Михаил Горшенев (Король и Шут)", gender: "male", vocalFach: "bass_baritone", timbreWeight: 25, genre: "Rock" },
  { name: "Shaman",                         gender: "male", vocalFach: "tenor",         timbreWeight: 82, genre: "Pop"  },
  { name: "Macan",                          gender: "male", vocalFach: "bass_baritone", timbreWeight: 42, genre: "Pop"  },
  { name: "Feduk",                          gender: "male", vocalFach: "bass_baritone", timbreWeight: 48, genre: "Pop"  },
  { name: "Jony",                           gender: "male", vocalFach: "tenor",         timbreWeight: 76, genre: "Pop"  },
  { name: "Александр Градский",             gender: "male", vocalFach: "tenor",         timbreWeight: 80, genre: "Rock" },
  { name: "Скриптонит",                     gender: "male", vocalFach: "bass_baritone", timbreWeight: 18, genre: "Pop"  },

  // СМЕШАННЫЙ БЛОК — добирает ростер ровно до 100 (поп/рок, м/ж, RU/EN)
  { name: "Christina Aguilera", gender: "female", vocalFach: "mezzo_soprano", timbreWeight: 90, genre: "Pop"  },
  { name: "Alicia Keys",        gender: "female", vocalFach: "mezzo_soprano", timbreWeight: 52, genre: "Pop"  },
  { name: "Avril Lavigne",      gender: "female", vocalFach: "mezzo_soprano", timbreWeight: 82, genre: "Rock" },
  { name: "Camila Cabello",     gender: "female", vocalFach: "mezzo_soprano", timbreWeight: 74, genre: "Pop"  },
  { name: "Stevie Wonder",      gender: "male",   vocalFach: "tenor",         timbreWeight: 79, genre: "Pop"  },
  { name: "Bob Dylan",          gender: "male",   vocalFach: "bass_baritone", timbreWeight: 38, genre: "Rock" },
  { name: "Bruce Springsteen",  gender: "male",   vocalFach: "bass_baritone", timbreWeight: 32, genre: "Rock" },
  { name: "Axl Rose",           gender: "male",   vocalFach: "tenor",         timbreWeight: 96, genre: "Rock" },
  { name: "Adam Levine",        gender: "male",   vocalFach: "tenor",         timbreWeight: 91, genre: "Pop"  },
  { name: "Justin Bieber",      gender: "male",   vocalFach: "tenor",         timbreWeight: 90, genre: "Pop"  },
  { name: "Drake",              gender: "male",   vocalFach: "bass_baritone", timbreWeight: 50, genre: "Pop"  },
  { name: "Post Malone",        gender: "male",   vocalFach: "tenor",         timbreWeight: 66, genre: "Pop"  },
  { name: "Ozzy Osbourne",      gender: "male",   vocalFach: "tenor",         timbreWeight: 73, genre: "Rock" },
  { name: "Юрий Шатунов",       gender: "male",   vocalFach: "tenor",         timbreWeight: 86, genre: "Pop"  },
  { name: "Вячеслав Бутусов",   gender: "male",   vocalFach: "bass_baritone", timbreWeight: 28, genre: "Rock" },
  { name: "Гарик Сукачёв",      gender: "male",   vocalFach: "bass_baritone", timbreWeight: 22, genre: "Rock" },
  { name: "Тимати",             gender: "male",   vocalFach: "bass_baritone", timbreWeight: 35, genre: "Pop"  },
  { name: "Ирина Аллегрова",    gender: "female", vocalFach: "contralto",     timbreWeight: 38, genre: "Pop"  },
  { name: "Юта",                gender: "female", vocalFach: "mezzo_soprano", timbreWeight: 69, genre: "Pop"  },
  { name: "Ани Лорак",          gender: "female", vocalFach: "mezzo_soprano", timbreWeight: 83, genre: "Pop"  },
];

export const CELEBRITIES_DB: CelebrityProfile[] = RAW_ENTRIES.map((entry) => ({
  id: slugify(entry.name),
  ...entry,
}));

const MALE_FACHES: VocalFach[] = ["bass_baritone", "tenor"];
const FEMALE_FACHES: VocalFach[] = ["contralto", "mezzo_soprano"];

if (process.env.NODE_ENV !== "production") {
  const ids = new Set(CELEBRITIES_DB.map((c) => c.id));
  if (ids.size !== CELEBRITIES_DB.length) {
    throw new Error("celebritiesDB: duplicate slug ids detected");
  }
  if (CELEBRITIES_DB.length !== 100) {
    throw new Error(`celebritiesDB: expected 100 entries, got ${CELEBRITIES_DB.length}`);
  }
  for (const c of CELEBRITIES_DB) {
    const allowed = c.gender === "male" ? MALE_FACHES : FEMALE_FACHES;
    if (!allowed.includes(c.vocalFach)) {
      throw new Error(`celebritiesDB: ${c.name} has fach ${c.vocalFach} incompatible with gender ${c.gender}`);
    }
    if (!Number.isFinite(c.timbreWeight) || c.timbreWeight < 0 || c.timbreWeight > 100) {
      throw new Error(`celebritiesDB: ${c.name} has out-of-range timbreWeight ${c.timbreWeight}`);
    }
  }
}

/**
 * Median-F0 → Vocal Fach thresholds. Deliberately hard cut-offs with no fuzzy
 * zone: a single number in, a single bucket out, so the result is fully
 * explainable to the student ("115 Hz < 165 Hz ⇒ баритон").
 *
 * 165 Hz ≈ E3 — the classic baritone/tenor tessitura divide for adult male
 * voices. 220 Hz = A3 — the corresponding contralto/mezzo divide for adult
 * female voices.
 */
export const MALE_FACH_SPLIT_HZ = 165;
export const FEMALE_FACH_SPLIT_HZ = 220;

/**
 * Classifies the take's median F0 into a Vocal Fach, using the gender the
 * student EXPLICITLY selected in the UI (never an auto-detected one — F0-based
 * auto gender detection is exactly what used to mislabel low male voices).
 */
export function classifyVocalFach(
  gender: CelebrityGender,
  medianHz: number
): VocalFach {
  if (gender === "male") {
    return medianHz < MALE_FACH_SPLIT_HZ ? "bass_baritone" : "tenor";
  }
  return medianHz < FEMALE_FACH_SPLIT_HZ ? "contralto" : "mezzo_soprano";
}

export type CelebrityMatch = {
  celebrity: CelebrityProfile;
  /** |userWeight − celebrity.timbreWeight|, 0-100. Smaller = better match. */
  weightDiff: number;
  /** 0-100 display score, see `weightDiffToPercent`. */
  percent: number;
};

/**
 * Worst possible displayed similarity. Everyone in the returned list already
 * passed the STRICT gender+fach filter, i.e. they genuinely share the
 * student's tessitura, so even the tonally furthest member of that pool is a
 * real (if not ideal) match and shouldn't be shown as "0% similar".
 */
const MIN_MATCH_PERCENT = 40;

/**
 * Timbre-weight distance → display percentage.
 *
 * Linear and strictly monotonic: `diff = 0 → 100%`, `diff = 100 → 40%`
 * (i.e. `percent = 100 − 0.6 × diff`). Chosen over the naive `100 − diff`
 * because the pool is already fach-filtered (see `MIN_MATCH_PERCENT`), and
 * over a steeper/exponential curve because a linear map keeps the displayed
 * number literally interpretable: 10 points of timbre-weight distance always
 * costs exactly 6 percentage points, anywhere on the scale. Fully
 * deterministic — no randomness anywhere in this module.
 */
function weightDiffToPercent(diff: number): number {
  const clamped = Math.max(0, Math.min(100, diff));
  return Math.round(MIN_MATCH_PERCENT + (100 - MIN_MATCH_PERCENT) * (1 - clamped / 100));
}

/**
 * The one and only matcher.
 *
 * 1. STRICT filter: only profiles whose `gender` AND `vocalFach` both exactly
 *    equal the student's selected gender / classified fach are ever
 *    considered. There is NO fallback to the unfiltered pool — a bass is
 *    physically incapable of being matched to a tenor here, by construction.
 * 2. Ranking inside that pool is by absolute timbre-weight distance, ascending
 *    (ties broken by `id` so the order is stable and reproducible).
 *
 * Returns the whole filtered pool ranked; the caller slices/groups it (see
 * `groupMatchesByGenre`).
 */
export function matchCelebrities(
  gender: CelebrityGender,
  fach: VocalFach,
  userWeight: number
): CelebrityMatch[] {
  return CELEBRITIES_DB.filter((c) => c.gender === gender && c.vocalFach === fach)
    .map((celebrity) => {
      const weightDiff = Math.abs(userWeight - celebrity.timbreWeight);
      return { celebrity, weightDiff, percent: weightDiffToPercent(weightDiff) };
    })
    .sort((a, b) =>
      a.weightDiff === b.weightDiff
        ? a.celebrity.id.localeCompare(b.celebrity.id)
        : a.weightDiff - b.weightDiff
    );
}

/**
 * Groups an already filtered + ranked match list by `celebrity.genre`, keeping
 * only the top `perGenreLimit` (default 5) per genre. Input order is assumed
 * ascending by `weightDiff` (as returned by `matchCelebrities`), so grouping
 * preserves rank order. Buckets with fewer than the limit are simply shorter —
 * never padded, never topped up from outside the filtered pool.
 */
export function groupMatchesByGenre(
  matches: CelebrityMatch[],
  perGenreLimit = 5
): Partial<Record<CelebrityGenre, CelebrityMatch[]>> {
  const groups: Partial<Record<CelebrityGenre, CelebrityMatch[]>> = {};
  for (const match of matches) {
    const genre = match.celebrity.genre;
    const bucket = groups[genre] ?? (groups[genre] = []);
    if (bucket.length < perGenreLimit) bucket.push(match);
  }
  return groups;
}
