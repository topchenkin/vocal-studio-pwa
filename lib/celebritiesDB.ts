/**
 * "Вокальное ДНК" reference database — 100 well-known singers, each described by
 * 5 hand-authored acoustic traits (depth/brightness/airiness/raspiness/centroidHz)
 * rather than raw MFCC numbers. `generateTargetVector()` below turns those traits
 * into a deterministic 13-coefficient pseudo-MFCC vector (matching Meyda's default
 * coefficient count) so every profile can be compared against the student's live
 * fingerprint with plain Euclidean distance.
 *
 * IMPORTANT: like the file this replaces (`lib/celebrity-timbre-db.ts`, now
 * deleted), these vectors are illustrative/approximate — there's no licensed
 * reference-audio corpus in this project to run through the real Meyda pipeline.
 * The 5 traits per artist are a plausible, clearly-differentiated summary of each
 * artist's real vocal character; `generateTargetVector` is a documented, pure
 * (no randomness) function so the mapping is stable and reproducible.
 */

export type CelebrityGender = "male" | "female";

export interface AcousticTraits {
  /** 0-100: chest-voice weight / low-end richness. Higher = darker, heavier voice. */
  depth: number;
  /** 0-100: perceived brilliance/forwardness of the tone. */
  brightness: number;
  /** 0-100: breathiness / non-tonal "air" mixed into the tone. */
  airiness: number;
  /** 0-100: hoarseness / vocal-fry / distortion in the tone. */
  raspiness: number;
  /** Mean spectral centroid in Hz — roughly, the voice's overall register/color. */
  centroidHz: number;
}

export interface CelebrityProfile {
  id: string;
  name: string;
  gender: CelebrityGender;
  nationality: "western" | "russian" | string;
  acousticTraits: AcousticTraits;
  /** 13-coefficient pseudo-MFCC vector, derived once via `generateTargetVector()` at module load. */
  mfccVector?: number[];
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

type RawEntry = {
  name: string;
  gender: CelebrityGender;
  nationality: "western" | "russian";
  acousticTraits: AcousticTraits;
};

// prettier-ignore
const RAW_ENTRIES: RawEntry[] = [
  // ЗАРУБЕЖНЫЕ ЖЕНЩИНЫ (western, female)
  { name: "Adele", gender: "female", nationality: "western", acousticTraits: { depth: 85, brightness: 60, airiness: 40, raspiness: 20, centroidHz: 320 } },
  { name: "Billie Eilish", gender: "female", nationality: "western", acousticTraits: { depth: 30, brightness: 40, airiness: 95, raspiness: 10, centroidHz: 280 } },
  { name: "Ariana Grande", gender: "female", nationality: "western", acousticTraits: { depth: 40, brightness: 95, airiness: 60, raspiness: 0, centroidHz: 450 } },
  { name: "Whitney Houston", gender: "female", nationality: "western", acousticTraits: { depth: 80, brightness: 90, airiness: 20, raspiness: 10, centroidHz: 400 } },
  { name: "Amy Winehouse", gender: "female", nationality: "western", acousticTraits: { depth: 85, brightness: 40, airiness: 30, raspiness: 80, centroidHz: 250 } },
  { name: "Beyonce", gender: "female", nationality: "western", acousticTraits: { depth: 75, brightness: 85, airiness: 25, raspiness: 30, centroidHz: 350 } },
  { name: "Lady Gaga", gender: "female", nationality: "western", acousticTraits: { depth: 70, brightness: 80, airiness: 20, raspiness: 40, centroidHz: 340 } },
  { name: "Mariah Carey", gender: "female", nationality: "western", acousticTraits: { depth: 60, brightness: 95, airiness: 50, raspiness: 0, centroidHz: 420 } },
  { name: "Celine Dion", gender: "female", nationality: "western", acousticTraits: { depth: 70, brightness: 90, airiness: 15, raspiness: 5, centroidHz: 380 } },
  { name: "Sia", gender: "female", nationality: "western", acousticTraits: { depth: 65, brightness: 85, airiness: 30, raspiness: 70, centroidHz: 360 } },
  { name: "Taylor Swift", gender: "female", nationality: "western", acousticTraits: { depth: 50, brightness: 70, airiness: 40, raspiness: 5, centroidHz: 330 } },
  { name: "Dua Lipa", gender: "female", nationality: "western", acousticTraits: { depth: 75, brightness: 65, airiness: 35, raspiness: 20, centroidHz: 290 } },
  { name: "Lana Del Rey", gender: "female", nationality: "western", acousticTraits: { depth: 85, brightness: 30, airiness: 60, raspiness: 10, centroidHz: 230 } },
  { name: "Shakira", gender: "female", nationality: "western", acousticTraits: { depth: 60, brightness: 75, airiness: 20, raspiness: 50, centroidHz: 310 } },
  { name: "Miley Cyrus", gender: "female", nationality: "western", acousticTraits: { depth: 80, brightness: 60, airiness: 20, raspiness: 85, centroidHz: 260 } },
  { name: "Rihanna", gender: "female", nationality: "western", acousticTraits: { depth: 75, brightness: 70, airiness: 30, raspiness: 40, centroidHz: 300 } },
  { name: "Janis Joplin", gender: "female", nationality: "western", acousticTraits: { depth: 70, brightness: 60, airiness: 10, raspiness: 100, centroidHz: 310 } },
  { name: "Cher", gender: "female", nationality: "western", acousticTraits: { depth: 95, brightness: 40, airiness: 10, raspiness: 20, centroidHz: 210 } },
  { name: "Tina Turner", gender: "female", nationality: "western", acousticTraits: { depth: 90, brightness: 50, airiness: 10, raspiness: 80, centroidHz: 220 } },
  { name: "Katy Perry", gender: "female", nationality: "western", acousticTraits: { depth: 70, brightness: 75, airiness: 20, raspiness: 30, centroidHz: 280 } },

  // РОССИЙСКИЕ ЖЕНЩИНЫ (russian, female)
  { name: "Полина Гагарина", gender: "female", nationality: "russian", acousticTraits: { depth: 65, brightness: 95, airiness: 20, raspiness: 30, centroidHz: 390 } },
  { name: "Zivert", gender: "female", nationality: "russian", acousticTraits: { depth: 80, brightness: 60, airiness: 30, raspiness: 40, centroidHz: 260 } },
  { name: "Anna Asti", gender: "female", nationality: "russian", acousticTraits: { depth: 75, brightness: 70, airiness: 40, raspiness: 50, centroidHz: 280 } },
  { name: "Земфира", gender: "female", nationality: "russian", acousticTraits: { depth: 70, brightness: 50, airiness: 45, raspiness: 30, centroidHz: 270 } },
  { name: "Алла Пугачева", gender: "female", nationality: "russian", acousticTraits: { depth: 90, brightness: 60, airiness: 20, raspiness: 60, centroidHz: 240 } },
  { name: "Пелагея", gender: "female", nationality: "russian", acousticTraits: { depth: 60, brightness: 90, airiness: 15, raspiness: 0, centroidHz: 400 } },
  { name: "Лолита", gender: "female", nationality: "russian", acousticTraits: { depth: 85, brightness: 55, airiness: 20, raspiness: 50, centroidHz: 250 } },
  { name: "Монеточка", gender: "female", nationality: "russian", acousticTraits: { depth: 20, brightness: 90, airiness: 70, raspiness: 0, centroidHz: 430 } },
  { name: "Слава", gender: "female", nationality: "russian", acousticTraits: { depth: 90, brightness: 50, airiness: 10, raspiness: 70, centroidHz: 230 } },
  { name: "МакSим", gender: "female", nationality: "russian", acousticTraits: { depth: 40, brightness: 80, airiness: 60, raspiness: 5, centroidHz: 350 } },
  { name: "Нюша", gender: "female", nationality: "russian", acousticTraits: { depth: 35, brightness: 85, airiness: 50, raspiness: 0, centroidHz: 380 } },
  { name: "Клава Кока", gender: "female", nationality: "russian", acousticTraits: { depth: 25, brightness: 85, airiness: 65, raspiness: 0, centroidHz: 410 } },
  { name: "Ёлка", gender: "female", nationality: "russian", acousticTraits: { depth: 60, brightness: 80, airiness: 30, raspiness: 10, centroidHz: 340 } },
  { name: "Лариса Долина", gender: "female", nationality: "russian", acousticTraits: { depth: 80, brightness: 85, airiness: 15, raspiness: 40, centroidHz: 310 } },
  { name: "Любовь Успенская", gender: "female", nationality: "russian", acousticTraits: { depth: 85, brightness: 70, airiness: 10, raspiness: 50, centroidHz: 260 } },
  { name: "Темникова", gender: "female", nationality: "russian", acousticTraits: { depth: 65, brightness: 60, airiness: 50, raspiness: 20, centroidHz: 290 } },
  { name: "Mary Gu", gender: "female", nationality: "russian", acousticTraits: { depth: 70, brightness: 65, airiness: 40, raspiness: 30, centroidHz: 280 } },
  { name: "Диана Арбенина", gender: "female", nationality: "russian", acousticTraits: { depth: 80, brightness: 50, airiness: 20, raspiness: 60, centroidHz: 250 } },
  { name: "Instasamka", gender: "female", nationality: "russian", acousticTraits: { depth: 40, brightness: 70, airiness: 50, raspiness: 20, centroidHz: 320 } },
  { name: "Валерия", gender: "female", nationality: "russian", acousticTraits: { depth: 75, brightness: 85, airiness: 15, raspiness: 30, centroidHz: 350 } },

  // ЗАРУБЕЖНЫЕ МУЖЧИНЫ (western, male)
  { name: "Freddie Mercury", gender: "male", nationality: "western", acousticTraits: { depth: 75, brightness: 90, airiness: 10, raspiness: 40, centroidHz: 250 } },
  { name: "Frank Sinatra", gender: "male", nationality: "western", acousticTraits: { depth: 85, brightness: 60, airiness: 20, raspiness: 10, centroidHz: 160 } },
  { name: "Elvis Presley", gender: "male", nationality: "western", acousticTraits: { depth: 80, brightness: 65, airiness: 15, raspiness: 20, centroidHz: 180 } },
  { name: "Michael Jackson", gender: "male", nationality: "western", acousticTraits: { depth: 30, brightness: 95, airiness: 40, raspiness: 15, centroidHz: 320 } },
  { name: "Bruno Mars", gender: "male", nationality: "western", acousticTraits: { depth: 50, brightness: 90, airiness: 20, raspiness: 30, centroidHz: 280 } },
  { name: "Ed Sheeran", gender: "male", nationality: "western", acousticTraits: { depth: 60, brightness: 70, airiness: 40, raspiness: 15, centroidHz: 200 } },
  { name: "The Weeknd", gender: "male", nationality: "western", acousticTraits: { depth: 40, brightness: 90, airiness: 50, raspiness: 10, centroidHz: 290 } },
  { name: "Kurt Cobain", gender: "male", nationality: "western", acousticTraits: { depth: 70, brightness: 60, airiness: 10, raspiness: 100, centroidHz: 220 } },
  { name: "Chester Bennington", gender: "male", nationality: "western", acousticTraits: { depth: 65, brightness: 85, airiness: 10, raspiness: 95, centroidHz: 260 } },
  { name: "Louis Armstrong", gender: "male", nationality: "western", acousticTraits: { depth: 95, brightness: 30, airiness: 20, raspiness: 100, centroidHz: 110 } },
  { name: "Andrea Bocelli", gender: "male", nationality: "western", acousticTraits: { depth: 85, brightness: 80, airiness: 10, raspiness: 0, centroidHz: 210 } },
  { name: "Barry White", gender: "male", nationality: "western", acousticTraits: { depth: 100, brightness: 20, airiness: 30, raspiness: 60, centroidHz: 80 } },
  { name: "Eminem", gender: "male", nationality: "western", acousticTraits: { depth: 60, brightness: 75, airiness: 10, raspiness: 40, centroidHz: 230 } },
  { name: "Sam Smith", gender: "male", nationality: "western", acousticTraits: { depth: 50, brightness: 85, airiness: 45, raspiness: 5, centroidHz: 270 } },
  { name: "Hozier", gender: "male", nationality: "western", acousticTraits: { depth: 80, brightness: 60, airiness: 20, raspiness: 30, centroidHz: 150 } },
  { name: "Elton John", gender: "male", nationality: "western", acousticTraits: { depth: 75, brightness: 70, airiness: 15, raspiness: 40, centroidHz: 180 } },
  { name: "Steven Tyler", gender: "male", nationality: "western", acousticTraits: { depth: 80, brightness: 75, airiness: 10, raspiness: 95, centroidHz: 240 } },
  { name: "Paul McCartney", gender: "male", nationality: "western", acousticTraits: { depth: 70, brightness: 65, airiness: 20, raspiness: 25, centroidHz: 190 } },
  { name: "David Bowie", gender: "male", nationality: "western", acousticTraits: { depth: 65, brightness: 70, airiness: 25, raspiness: 35, centroidHz: 210 } },
  { name: "Mick Jagger", gender: "male", nationality: "western", acousticTraits: { depth: 70, brightness: 75, airiness: 20, raspiness: 40, centroidHz: 200 } },

  // РОССИЙСКИЕ МУЖЧИНЫ (russian, male)
  { name: "Муслим Магомаев", gender: "male", nationality: "russian", acousticTraits: { depth: 95, brightness: 80, airiness: 5, raspiness: 0, centroidHz: 140 } },
  { name: "Дмитрий Хворостовский", gender: "male", nationality: "russian", acousticTraits: { depth: 100, brightness: 70, airiness: 5, raspiness: 0, centroidHz: 120 } },
  { name: "Григорий Лепс", gender: "male", nationality: "russian", acousticTraits: { depth: 80, brightness: 85, airiness: 10, raspiness: 95, centroidHz: 240 } },
  { name: "Дима Билан", gender: "male", nationality: "russian", acousticTraits: { depth: 60, brightness: 85, airiness: 30, raspiness: 20, centroidHz: 260 } },
  { name: "Сергей Лазарев", gender: "male", nationality: "russian", acousticTraits: { depth: 55, brightness: 90, airiness: 25, raspiness: 15, centroidHz: 270 } },
  { name: "Баста", gender: "male", nationality: "russian", acousticTraits: { depth: 85, brightness: 50, airiness: 20, raspiness: 60, centroidHz: 160 } },
  { name: "Леонид Агутин", gender: "male", nationality: "russian", acousticTraits: { depth: 75, brightness: 65, airiness: 30, raspiness: 40, centroidHz: 190 } },
  { name: "Валерий Меладзе", gender: "male", nationality: "russian", acousticTraits: { depth: 80, brightness: 75, airiness: 15, raspiness: 30, centroidHz: 180 } },
  { name: "Niletto", gender: "male", nationality: "russian", acousticTraits: { depth: 65, brightness: 70, airiness: 40, raspiness: 20, centroidHz: 220 } },
  { name: "Владимир Пресняков", gender: "male", nationality: "russian", acousticTraits: { depth: 40, brightness: 95, airiness: 20, raspiness: 15, centroidHz: 300 } },
  { name: "Николай Басков", gender: "male", nationality: "russian", acousticTraits: { depth: 70, brightness: 85, airiness: 10, raspiness: 0, centroidHz: 240 } },
  { name: "Филипп Киркоров", gender: "male", nationality: "russian", acousticTraits: { depth: 75, brightness: 80, airiness: 15, raspiness: 10, centroidHz: 210 } },
  { name: "Валерий Кипелов", gender: "male", nationality: "russian", acousticTraits: { depth: 75, brightness: 95, airiness: 5, raspiness: 70, centroidHz: 280 } },
  { name: "Михаил Горшенев (Король и Шут)", gender: "male", nationality: "russian", acousticTraits: { depth: 85, brightness: 60, airiness: 10, raspiness: 85, centroidHz: 170 } },
  { name: "Shaman", gender: "male", nationality: "russian", acousticTraits: { depth: 65, brightness: 90, airiness: 15, raspiness: 50, centroidHz: 270 } },
  { name: "Macan", gender: "male", nationality: "russian", acousticTraits: { depth: 75, brightness: 55, airiness: 30, raspiness: 60, centroidHz: 180 } },
  { name: "Feduk", gender: "male", nationality: "russian", acousticTraits: { depth: 65, brightness: 70, airiness: 45, raspiness: 10, centroidHz: 210 } },
  { name: "Jony", gender: "male", nationality: "russian", acousticTraits: { depth: 60, brightness: 75, airiness: 40, raspiness: 15, centroidHz: 230 } },
  { name: "Александр Градский", gender: "male", nationality: "russian", acousticTraits: { depth: 80, brightness: 85, airiness: 10, raspiness: 30, centroidHz: 200 } },
  { name: "Скриптонит", gender: "male", nationality: "russian", acousticTraits: { depth: 80, brightness: 40, airiness: 40, raspiness: 80, centroidHz: 150 } },

  // +20 more, chosen to round out the roster to exactly 100 with a mixed
  // gender/nationality/genre spread (pop, rock, rap, R&B) not already covered above.
  { name: "Christina Aguilera", gender: "female", nationality: "western", acousticTraits: { depth: 65, brightness: 90, airiness: 25, raspiness: 30, centroidHz: 380 } },
  { name: "Alicia Keys", gender: "female", nationality: "western", acousticTraits: { depth: 70, brightness: 70, airiness: 20, raspiness: 15, centroidHz: 290 } },
  { name: "Doja Cat", gender: "female", nationality: "western", acousticTraits: { depth: 55, brightness: 80, airiness: 35, raspiness: 25, centroidHz: 320 } },
  { name: "Camila Cabello", gender: "female", nationality: "western", acousticTraits: { depth: 60, brightness: 75, airiness: 30, raspiness: 15, centroidHz: 310 } },
  { name: "Stevie Wonder", gender: "male", nationality: "western", acousticTraits: { depth: 65, brightness: 80, airiness: 20, raspiness: 15, centroidHz: 260 } },
  { name: "Bob Dylan", gender: "male", nationality: "western", acousticTraits: { depth: 55, brightness: 55, airiness: 15, raspiness: 90, centroidHz: 190 } },
  { name: "Bruce Springsteen", gender: "male", nationality: "western", acousticTraits: { depth: 70, brightness: 65, airiness: 15, raspiness: 55, centroidHz: 200 } },
  { name: "Axl Rose", gender: "male", nationality: "western", acousticTraits: { depth: 55, brightness: 90, airiness: 15, raspiness: 75, centroidHz: 310 } },
  { name: "Adam Levine", gender: "male", nationality: "western", acousticTraits: { depth: 40, brightness: 85, airiness: 45, raspiness: 20, centroidHz: 300 } },
  { name: "Justin Bieber", gender: "male", nationality: "western", acousticTraits: { depth: 45, brightness: 80, airiness: 35, raspiness: 15, centroidHz: 280 } },
  { name: "Drake", gender: "male", nationality: "western", acousticTraits: { depth: 55, brightness: 60, airiness: 25, raspiness: 25, centroidHz: 200 } },
  { name: "Post Malone", gender: "male", nationality: "western", acousticTraits: { depth: 60, brightness: 55, airiness: 30, raspiness: 45, centroidHz: 210 } },
  { name: "Ozzy Osbourne", gender: "male", nationality: "western", acousticTraits: { depth: 65, brightness: 70, airiness: 15, raspiness: 65, centroidHz: 220 } },
  { name: "Юрий Шатунов", gender: "male", nationality: "russian", acousticTraits: { depth: 55, brightness: 80, airiness: 30, raspiness: 15, centroidHz: 260 } },
  { name: "Вячеслав Бутусов", gender: "male", nationality: "russian", acousticTraits: { depth: 75, brightness: 55, airiness: 15, raspiness: 45, centroidHz: 170 } },
  { name: "Гарик Сукачёв", gender: "male", nationality: "russian", acousticTraits: { depth: 75, brightness: 50, airiness: 15, raspiness: 70, centroidHz: 160 } },
  { name: "Тимати", gender: "male", nationality: "russian", acousticTraits: { depth: 60, brightness: 60, airiness: 20, raspiness: 40, centroidHz: 190 } },
  { name: "Ирина Аллегрова", gender: "female", nationality: "russian", acousticTraits: { depth: 75, brightness: 75, airiness: 15, raspiness: 35, centroidHz: 300 } },
  { name: "Юта", gender: "female", nationality: "russian", acousticTraits: { depth: 60, brightness: 80, airiness: 25, raspiness: 20, centroidHz: 330 } },
  { name: "Ани Лорак", gender: "female", nationality: "russian", acousticTraits: { depth: 65, brightness: 85, airiness: 20, raspiness: 15, centroidHz: 360 } },
];

/**
 * Deterministic traits → 13-coefficient pseudo-MFCC mapping (Meyda's default
 * coefficient count, c0..c12). Pure function of the 5 acoustic traits — no
 * randomness — so two similar trait profiles always land close together in
 * Euclidean space and two dissimilar ones always land far apart.
 *
 * This is an approximation of how these traits *would* shape a real MFCC
 * envelope, not a physically-modeled vocoder — there's no reference-audio
 * corpus in this project to derive real coefficients from (same caveat as
 * the rest of this file).
 *
 *  - c0  (overall level)     = centroidHz / 10 — real MFCC c0 tracks log-energy/
 *    overall spectral level, and a higher-register voice reads as "louder"
 *    at the top of the band, so we key it off the centroid.
 *  - c1  (spectral balance)  = brightness − depth — this is literally the
 *    coarsest tilt of the spectrum (energy shifted up vs down), which is
 *    exactly what real c1 captures.
 *  - c2  (air/breath noise)  = airiness × 0.5 — breath noise shows up as
 *    broadband energy that first perturbs the early-mid coefficients.
 *  - c3..c12 (10 coefficients, order k = 1..10): each coefficient combines
 *    four terms that mirror how real cepstral envelopes behave:
 *      1. `alternatingSign * decayMagnitude` — real MFCC envelopes decay in
 *         magnitude as order increases and typically alternate in sign;
 *         `depth` (chest-voice weight) scales the decay's starting magnitude
 *         since darker voices carry more low-order spectral energy.
 *      2. `raspinessRipple` — hoarseness/vocal-fry breaks up the harmonic
 *         structure, which we model as a mid-band oscillation (a few periods
 *         of sine across k=1..10) scaled by `raspiness`.
 *      3. `airHighOrderBoost` — breathy/airy voices carry more broadband
 *         energy at *higher*-order (finer spectral detail) coefficients, so
 *         this term grows linearly with k, scaled by `airiness`.
 *      4. `brightnessMidBoost` — a bright, forward tone sharpens mid-order
 *         formant detail, modeled as a bump centered near k=5, scaled by how
 *         far `brightness` sits from a neutral 50.
 */
export function generateTargetVector(traits: AcousticTraits): number[] {
  const { depth, brightness, airiness, raspiness, centroidHz } = traits;

  const vector: number[] = [
    centroidHz / 10,
    brightness - depth,
    airiness * 0.5,
  ];

  for (let k = 1; k <= 10; k += 1) {
    const alternatingSign = k % 2 === 1 ? 1 : -1;
    const decayMagnitude = (depth / 10) * (1 / k);
    const raspinessRipple = (raspiness / 100) * 6 * Math.sin((k / 10) * Math.PI * 3);
    const airHighOrderBoost = (airiness / 100) * 4 * (k / 10);
    const brightnessMidBoost =
      ((brightness - 50) / 100) * 3 * Math.exp(-Math.abs(k - 5) / 4);

    vector.push(
      alternatingSign * decayMagnitude +
        raspinessRipple +
        airHighOrderBoost +
        brightnessMidBoost
    );
  }

  return vector;
}

export const CELEBRITIES_DB: CelebrityProfile[] = RAW_ENTRIES.map((entry) => ({
  id: slugify(entry.name),
  name: entry.name,
  gender: entry.gender,
  nationality: entry.nationality,
  acousticTraits: entry.acousticTraits,
  mfccVector: generateTargetVector(entry.acousticTraits),
}));

if (process.env.NODE_ENV !== "production") {
  const ids = new Set(CELEBRITIES_DB.map((c) => c.id));
  if (ids.size !== CELEBRITIES_DB.length) {
    throw new Error("celebritiesDB: duplicate slug ids detected");
  }
  if (CELEBRITIES_DB.length !== 100) {
    throw new Error(`celebritiesDB: expected 100 entries, got ${CELEBRITIES_DB.length}`);
  }
}

type DimStats = { mean: number; std: number };

function computeStats(vectors: number[][]): DimStats[] {
  const dims = vectors[0]?.length ?? 0;
  const stats: DimStats[] = [];
  for (let i = 0; i < dims; i += 1) {
    const values = vectors.map((v) => v[i] ?? 0);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance =
      values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    // Guard against a degenerate zero-spread dimension dividing by zero later.
    stats.push({ mean, std: Math.sqrt(variance) || 1 });
  }
  return stats;
}

function zScore(vector: number[], stats: DimStats[]): number[] {
  return vector.map((v, i) => {
    const s = stats[i];
    if (!s) return 0;
    return (v - s.mean) / s.std;
  });
}

function euclideanDistance(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    sum += d * d;
  }
  return Math.sqrt(sum);
}

// Reference-database per-dimension mean/std, computed once at module load from
// all 100 profiles' `mfccVector`s. The SAME stats are later applied to the
// student's live fingerprint so every one of the 13 dimensions contributes on
// equal footing to the Euclidean distance instead of large-magnitude
// dimensions (e.g. c0, keyed off raw centroidHz/10) dominating it.
const REFERENCE_VECTORS = CELEBRITIES_DB.map((c) => c.mfccVector ?? []);
const REFERENCE_STATS = computeStats(REFERENCE_VECTORS);
const REFERENCE_NORMALIZED = REFERENCE_VECTORS.map((v) => zScore(v, REFERENCE_STATS));

export type CelebrityMatch = {
  celebrity: CelebrityProfile;
  /** Normalized Euclidean distance (lower = closer match). */
  distance: number;
  /** 0-100 display score, see `matchTopCelebrities` for the exact formula. */
  percent: number;
};

/**
 * Nearest-neighbor Euclidean match against the 100-profile reference DB.
 * Pure deterministic vector math — no randomness anywhere in the ranking.
 *
 * 1. Normalize: every one of the 13 pseudo-MFCC dimensions is z-scored using
 *    the reference DB's own per-dimension mean/std (`REFERENCE_STATS`, computed
 *    once above from all 100 profiles), and the identical stats are applied to
 *    the student's raw fingerprint — so both sides live in the same normalized
 *    space.
 * 2. Distance: plain Euclidean distance between the normalized 13-D vectors.
 * 3. Score: distances are inverted and rescaled against the min/max distance
 *    actually observed for this query's candidate pool — the closest match
 *    lands at ~97%, the farthest candidate in the pool at ~40% — so the
 *    percentages reflect genuine *relative* closeness within the reference
 *    set rather than an arbitrary fixed cutoff.
 * 4. Returns only the **top 3** closest matches, in ascending-distance
 *    (descending-similarity) order.
 */
export function matchTopCelebrities(
  studentMfcc: number[],
  options?: { gender?: CelebrityGender; genderIsConfident?: boolean }
): CelebrityMatch[] {
  const filterByGender =
    !!options?.gender && options.genderIsConfident !== false;
  const pool = filterByGender
    ? CELEBRITIES_DB.filter((c) => c.gender === options!.gender)
    : CELEBRITIES_DB;
  const activePool = pool.length > 0 ? pool : CELEBRITIES_DB;

  const studentNorm = zScore(studentMfcc, REFERENCE_STATS);

  const scored = activePool.map((celebrity) => {
    const idx = CELEBRITIES_DB.indexOf(celebrity);
    const refNorm =
      REFERENCE_NORMALIZED[idx] ?? zScore(celebrity.mfccVector ?? [], REFERENCE_STATS);
    return { celebrity, distance: euclideanDistance(studentNorm, refNorm) };
  });

  const distances = scored.map((s) => s.distance);
  const min = Math.min(...distances);
  const max = Math.max(...distances);
  const span = Math.max(1e-6, max - min);

  return scored
    .map((s) => ({
      ...s,
      percent: Math.round(97 - ((s.distance - min) / span) * 57),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3);
}
