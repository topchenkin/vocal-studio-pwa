/**
 * "Вокальное ДНК" reference database — 100 well-known singers, each described by
 * 5 hand-authored acoustic traits (depth/brightness/airiness/raspiness/centroidHz)
 * rather than raw MFCC numbers. `generateTargetVector()` below turns those traits
 * into a deterministic 13-coefficient pseudo-MFCC vector (matching Meyda's default
 * coefficient count) so every profile can be compared against the student's live
 * fingerprint.
 *
 * Matching (see `rankCelebritiesByGender` below) uses COSINE SIMILARITY with
 * MFCC[0] excluded from both sides — this makes the score invariant to overall
 * loudness/gain (mic volume), which is exactly the previous version's bug
 * (Euclidean distance on raw-scale vectors let loudness dominate the metric).
 *
 * IMPORTANT: like the file this replaces (`lib/celebrity-timbre-db.ts`, now
 * deleted), these vectors are illustrative/approximate — there's no licensed
 * reference-audio corpus in this project to run through the real Meyda pipeline.
 * The 5 traits per artist are a plausible, clearly-differentiated summary of each
 * artist's real vocal character; `generateTargetVector` is a documented, pure
 * (no randomness) function so the mapping is stable and reproducible.
 */

export type CelebrityGender = "male" | "female";

/**
 * Simple 2-value genre taxonomy used to group results in the UI. Every one of
 * the 100 profiles below is assigned exactly one of these two based on their
 * real primary musical style; genres that don't map cleanly onto either
 * (rap/hip-hop, jazz/soul, classic Russian estrada/chanson, etc.) are folded
 * into whichever bucket is the closer fit — `Pop` is the sensible default for
 * anything that isn't clearly rock-oriented (raspy/distorted, guitar-driven
 * rock/metal/punk bands and rock-and-roll/rock-icon solo artists → `Rock`).
 */
export type CelebrityGenre = "Pop" | "Rock";

export const CELEBRITY_GENRES: CelebrityGenre[] = ["Pop", "Rock"];

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
  genre: CelebrityGenre;
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
  genre: CelebrityGenre;
  nationality: "western" | "russian";
  acousticTraits: AcousticTraits;
};

// prettier-ignore
const RAW_ENTRIES: RawEntry[] = [
  // ЗАРУБЕЖНЫЕ ЖЕНЩИНЫ (western, female)
  { name: "Adele", gender: "female", genre: "Pop", nationality: "western", acousticTraits: { depth: 85, brightness: 60, airiness: 40, raspiness: 20, centroidHz: 320 } },
  { name: "Billie Eilish", gender: "female", genre: "Pop", nationality: "western", acousticTraits: { depth: 30, brightness: 40, airiness: 95, raspiness: 10, centroidHz: 280 } },
  { name: "Ariana Grande", gender: "female", genre: "Pop", nationality: "western", acousticTraits: { depth: 40, brightness: 95, airiness: 60, raspiness: 0, centroidHz: 450 } },
  { name: "Whitney Houston", gender: "female", genre: "Pop", nationality: "western", acousticTraits: { depth: 80, brightness: 90, airiness: 20, raspiness: 10, centroidHz: 400 } },
  { name: "Amy Winehouse", gender: "female", genre: "Pop", nationality: "western", acousticTraits: { depth: 85, brightness: 40, airiness: 30, raspiness: 80, centroidHz: 250 } },
  { name: "Beyonce", gender: "female", genre: "Pop", nationality: "western", acousticTraits: { depth: 75, brightness: 85, airiness: 25, raspiness: 30, centroidHz: 350 } },
  { name: "Lady Gaga", gender: "female", genre: "Pop", nationality: "western", acousticTraits: { depth: 70, brightness: 80, airiness: 20, raspiness: 40, centroidHz: 340 } },
  { name: "Mariah Carey", gender: "female", genre: "Pop", nationality: "western", acousticTraits: { depth: 60, brightness: 95, airiness: 50, raspiness: 0, centroidHz: 420 } },
  { name: "Celine Dion", gender: "female", genre: "Pop", nationality: "western", acousticTraits: { depth: 70, brightness: 90, airiness: 15, raspiness: 5, centroidHz: 380 } },
  { name: "Sia", gender: "female", genre: "Pop", nationality: "western", acousticTraits: { depth: 65, brightness: 85, airiness: 30, raspiness: 70, centroidHz: 360 } },
  { name: "Taylor Swift", gender: "female", genre: "Pop", nationality: "western", acousticTraits: { depth: 50, brightness: 70, airiness: 40, raspiness: 5, centroidHz: 330 } },
  { name: "Dua Lipa", gender: "female", genre: "Pop", nationality: "western", acousticTraits: { depth: 75, brightness: 65, airiness: 35, raspiness: 20, centroidHz: 290 } },
  { name: "Lana Del Rey", gender: "female", genre: "Pop", nationality: "western", acousticTraits: { depth: 85, brightness: 30, airiness: 60, raspiness: 10, centroidHz: 230 } },
  { name: "Shakira", gender: "female", genre: "Pop", nationality: "western", acousticTraits: { depth: 60, brightness: 75, airiness: 20, raspiness: 50, centroidHz: 310 } },
  { name: "Miley Cyrus", gender: "female", genre: "Pop", nationality: "western", acousticTraits: { depth: 80, brightness: 60, airiness: 20, raspiness: 85, centroidHz: 260 } },
  { name: "Rihanna", gender: "female", genre: "Pop", nationality: "western", acousticTraits: { depth: 75, brightness: 70, airiness: 30, raspiness: 40, centroidHz: 300 } },
  { name: "Janis Joplin", gender: "female", genre: "Rock", nationality: "western", acousticTraits: { depth: 70, brightness: 60, airiness: 10, raspiness: 100, centroidHz: 310 } },
  { name: "Cher", gender: "female", genre: "Pop", nationality: "western", acousticTraits: { depth: 95, brightness: 40, airiness: 10, raspiness: 20, centroidHz: 210 } },
  { name: "Tina Turner", gender: "female", genre: "Rock", nationality: "western", acousticTraits: { depth: 90, brightness: 50, airiness: 10, raspiness: 80, centroidHz: 220 } },
  { name: "Katy Perry", gender: "female", genre: "Pop", nationality: "western", acousticTraits: { depth: 70, brightness: 75, airiness: 20, raspiness: 30, centroidHz: 280 } },

  // РОССИЙСКИЕ ЖЕНЩИНЫ (russian, female)
  { name: "Полина Гагарина", gender: "female", genre: "Pop", nationality: "russian", acousticTraits: { depth: 65, brightness: 95, airiness: 20, raspiness: 30, centroidHz: 390 } },
  { name: "Zivert", gender: "female", genre: "Pop", nationality: "russian", acousticTraits: { depth: 80, brightness: 60, airiness: 30, raspiness: 40, centroidHz: 260 } },
  { name: "Anna Asti", gender: "female", genre: "Pop", nationality: "russian", acousticTraits: { depth: 75, brightness: 70, airiness: 40, raspiness: 50, centroidHz: 280 } },
  { name: "Земфира", gender: "female", genre: "Rock", nationality: "russian", acousticTraits: { depth: 70, brightness: 50, airiness: 45, raspiness: 30, centroidHz: 270 } },
  { name: "Алла Пугачева", gender: "female", genre: "Pop", nationality: "russian", acousticTraits: { depth: 90, brightness: 60, airiness: 20, raspiness: 60, centroidHz: 240 } },
  { name: "Пелагея", gender: "female", genre: "Pop", nationality: "russian", acousticTraits: { depth: 60, brightness: 90, airiness: 15, raspiness: 0, centroidHz: 400 } },
  { name: "Лолита", gender: "female", genre: "Pop", nationality: "russian", acousticTraits: { depth: 85, brightness: 55, airiness: 20, raspiness: 50, centroidHz: 250 } },
  { name: "Монеточка", gender: "female", genre: "Pop", nationality: "russian", acousticTraits: { depth: 20, brightness: 90, airiness: 70, raspiness: 0, centroidHz: 430 } },
  { name: "Слава", gender: "female", genre: "Pop", nationality: "russian", acousticTraits: { depth: 90, brightness: 50, airiness: 10, raspiness: 70, centroidHz: 230 } },
  { name: "МакSим", gender: "female", genre: "Pop", nationality: "russian", acousticTraits: { depth: 40, brightness: 80, airiness: 60, raspiness: 5, centroidHz: 350 } },
  { name: "Нюша", gender: "female", genre: "Pop", nationality: "russian", acousticTraits: { depth: 35, brightness: 85, airiness: 50, raspiness: 0, centroidHz: 380 } },
  { name: "Клава Кока", gender: "female", genre: "Pop", nationality: "russian", acousticTraits: { depth: 25, brightness: 85, airiness: 65, raspiness: 0, centroidHz: 410 } },
  { name: "Ёлка", gender: "female", genre: "Pop", nationality: "russian", acousticTraits: { depth: 60, brightness: 80, airiness: 30, raspiness: 10, centroidHz: 340 } },
  { name: "Лариса Долина", gender: "female", genre: "Pop", nationality: "russian", acousticTraits: { depth: 80, brightness: 85, airiness: 15, raspiness: 40, centroidHz: 310 } },
  { name: "Любовь Успенская", gender: "female", genre: "Pop", nationality: "russian", acousticTraits: { depth: 85, brightness: 70, airiness: 10, raspiness: 50, centroidHz: 260 } },
  { name: "Темникова", gender: "female", genre: "Pop", nationality: "russian", acousticTraits: { depth: 65, brightness: 60, airiness: 50, raspiness: 20, centroidHz: 290 } },
  { name: "Mary Gu", gender: "female", genre: "Pop", nationality: "russian", acousticTraits: { depth: 70, brightness: 65, airiness: 40, raspiness: 30, centroidHz: 280 } },
  { name: "Диана Арбенина", gender: "female", genre: "Rock", nationality: "russian", acousticTraits: { depth: 80, brightness: 50, airiness: 20, raspiness: 60, centroidHz: 250 } },
  { name: "Instasamka", gender: "female", genre: "Pop", nationality: "russian", acousticTraits: { depth: 40, brightness: 70, airiness: 50, raspiness: 20, centroidHz: 320 } },
  { name: "Валерия", gender: "female", genre: "Pop", nationality: "russian", acousticTraits: { depth: 75, brightness: 85, airiness: 15, raspiness: 30, centroidHz: 350 } },

  // ЗАРУБЕЖНЫЕ МУЖЧИНЫ (western, male)
  { name: "Freddie Mercury", gender: "male", genre: "Rock", nationality: "western", acousticTraits: { depth: 75, brightness: 90, airiness: 10, raspiness: 40, centroidHz: 250 } },
  { name: "Frank Sinatra", gender: "male", genre: "Pop", nationality: "western", acousticTraits: { depth: 85, brightness: 60, airiness: 20, raspiness: 10, centroidHz: 160 } },
  { name: "Elvis Presley", gender: "male", genre: "Rock", nationality: "western", acousticTraits: { depth: 80, brightness: 65, airiness: 15, raspiness: 20, centroidHz: 180 } },
  { name: "Michael Jackson", gender: "male", genre: "Pop", nationality: "western", acousticTraits: { depth: 30, brightness: 95, airiness: 40, raspiness: 15, centroidHz: 320 } },
  { name: "Bruno Mars", gender: "male", genre: "Pop", nationality: "western", acousticTraits: { depth: 50, brightness: 90, airiness: 20, raspiness: 30, centroidHz: 280 } },
  { name: "Ed Sheeran", gender: "male", genre: "Pop", nationality: "western", acousticTraits: { depth: 60, brightness: 70, airiness: 40, raspiness: 15, centroidHz: 200 } },
  { name: "The Weeknd", gender: "male", genre: "Pop", nationality: "western", acousticTraits: { depth: 40, brightness: 90, airiness: 50, raspiness: 10, centroidHz: 290 } },
  { name: "Kurt Cobain", gender: "male", genre: "Rock", nationality: "western", acousticTraits: { depth: 70, brightness: 60, airiness: 10, raspiness: 100, centroidHz: 220 } },
  { name: "Chester Bennington", gender: "male", genre: "Rock", nationality: "western", acousticTraits: { depth: 65, brightness: 85, airiness: 10, raspiness: 95, centroidHz: 260 } },
  { name: "Louis Armstrong", gender: "male", genre: "Pop", nationality: "western", acousticTraits: { depth: 95, brightness: 30, airiness: 20, raspiness: 100, centroidHz: 110 } },
  { name: "Andrea Bocelli", gender: "male", genre: "Pop", nationality: "western", acousticTraits: { depth: 85, brightness: 80, airiness: 10, raspiness: 0, centroidHz: 210 } },
  { name: "Barry White", gender: "male", genre: "Pop", nationality: "western", acousticTraits: { depth: 100, brightness: 20, airiness: 30, raspiness: 60, centroidHz: 80 } },
  { name: "Eminem", gender: "male", genre: "Pop", nationality: "western", acousticTraits: { depth: 60, brightness: 75, airiness: 10, raspiness: 40, centroidHz: 230 } },
  { name: "Sam Smith", gender: "male", genre: "Pop", nationality: "western", acousticTraits: { depth: 50, brightness: 85, airiness: 45, raspiness: 5, centroidHz: 270 } },
  { name: "Hozier", gender: "male", genre: "Rock", nationality: "western", acousticTraits: { depth: 80, brightness: 60, airiness: 20, raspiness: 30, centroidHz: 150 } },
  { name: "Elton John", gender: "male", genre: "Pop", nationality: "western", acousticTraits: { depth: 75, brightness: 70, airiness: 15, raspiness: 40, centroidHz: 180 } },
  { name: "Steven Tyler", gender: "male", genre: "Rock", nationality: "western", acousticTraits: { depth: 80, brightness: 75, airiness: 10, raspiness: 95, centroidHz: 240 } },
  { name: "Paul McCartney", gender: "male", genre: "Rock", nationality: "western", acousticTraits: { depth: 70, brightness: 65, airiness: 20, raspiness: 25, centroidHz: 190 } },
  { name: "David Bowie", gender: "male", genre: "Rock", nationality: "western", acousticTraits: { depth: 65, brightness: 70, airiness: 25, raspiness: 35, centroidHz: 210 } },
  { name: "Mick Jagger", gender: "male", genre: "Rock", nationality: "western", acousticTraits: { depth: 70, brightness: 75, airiness: 20, raspiness: 40, centroidHz: 200 } },

  // РОССИЙСКИЕ МУЖЧИНЫ (russian, male)
  { name: "Муслим Магомаев", gender: "male", genre: "Pop", nationality: "russian", acousticTraits: { depth: 95, brightness: 80, airiness: 5, raspiness: 0, centroidHz: 140 } },
  { name: "Дмитрий Хворостовский", gender: "male", genre: "Pop", nationality: "russian", acousticTraits: { depth: 100, brightness: 70, airiness: 5, raspiness: 0, centroidHz: 120 } },
  { name: "Григорий Лепс", gender: "male", genre: "Pop", nationality: "russian", acousticTraits: { depth: 80, brightness: 85, airiness: 10, raspiness: 95, centroidHz: 240 } },
  { name: "Дима Билан", gender: "male", genre: "Pop", nationality: "russian", acousticTraits: { depth: 60, brightness: 85, airiness: 30, raspiness: 20, centroidHz: 260 } },
  { name: "Сергей Лазарев", gender: "male", genre: "Pop", nationality: "russian", acousticTraits: { depth: 55, brightness: 90, airiness: 25, raspiness: 15, centroidHz: 270 } },
  { name: "Баста", gender: "male", genre: "Pop", nationality: "russian", acousticTraits: { depth: 85, brightness: 50, airiness: 20, raspiness: 60, centroidHz: 160 } },
  { name: "Леонид Агутин", gender: "male", genre: "Pop", nationality: "russian", acousticTraits: { depth: 75, brightness: 65, airiness: 30, raspiness: 40, centroidHz: 190 } },
  { name: "Валерий Меладзе", gender: "male", genre: "Pop", nationality: "russian", acousticTraits: { depth: 80, brightness: 75, airiness: 15, raspiness: 30, centroidHz: 180 } },
  { name: "Niletto", gender: "male", genre: "Pop", nationality: "russian", acousticTraits: { depth: 65, brightness: 70, airiness: 40, raspiness: 20, centroidHz: 220 } },
  { name: "Владимир Пресняков", gender: "male", genre: "Pop", nationality: "russian", acousticTraits: { depth: 40, brightness: 95, airiness: 20, raspiness: 15, centroidHz: 300 } },
  { name: "Николай Басков", gender: "male", genre: "Pop", nationality: "russian", acousticTraits: { depth: 70, brightness: 85, airiness: 10, raspiness: 0, centroidHz: 240 } },
  { name: "Филипп Киркоров", gender: "male", genre: "Pop", nationality: "russian", acousticTraits: { depth: 75, brightness: 80, airiness: 15, raspiness: 10, centroidHz: 210 } },
  { name: "Валерий Кипелов", gender: "male", genre: "Rock", nationality: "russian", acousticTraits: { depth: 75, brightness: 95, airiness: 5, raspiness: 70, centroidHz: 280 } },
  { name: "Михаил Горшенев (Король и Шут)", gender: "male", genre: "Rock", nationality: "russian", acousticTraits: { depth: 85, brightness: 60, airiness: 10, raspiness: 85, centroidHz: 170 } },
  { name: "Shaman", gender: "male", genre: "Pop", nationality: "russian", acousticTraits: { depth: 65, brightness: 90, airiness: 15, raspiness: 50, centroidHz: 270 } },
  { name: "Macan", gender: "male", genre: "Pop", nationality: "russian", acousticTraits: { depth: 75, brightness: 55, airiness: 30, raspiness: 60, centroidHz: 180 } },
  { name: "Feduk", gender: "male", genre: "Pop", nationality: "russian", acousticTraits: { depth: 65, brightness: 70, airiness: 45, raspiness: 10, centroidHz: 210 } },
  { name: "Jony", gender: "male", genre: "Pop", nationality: "russian", acousticTraits: { depth: 60, brightness: 75, airiness: 40, raspiness: 15, centroidHz: 230 } },
  { name: "Александр Градский", gender: "male", genre: "Rock", nationality: "russian", acousticTraits: { depth: 80, brightness: 85, airiness: 10, raspiness: 30, centroidHz: 200 } },
  { name: "Скриптонит", gender: "male", genre: "Pop", nationality: "russian", acousticTraits: { depth: 80, brightness: 40, airiness: 40, raspiness: 80, centroidHz: 150 } },

  // +20 more, chosen to round out the roster to exactly 100 with a mixed
  // gender/nationality/genre spread (pop, rock, rap, R&B) not already covered above.
  { name: "Christina Aguilera", gender: "female", genre: "Pop", nationality: "western", acousticTraits: { depth: 65, brightness: 90, airiness: 25, raspiness: 30, centroidHz: 380 } },
  { name: "Alicia Keys", gender: "female", genre: "Pop", nationality: "western", acousticTraits: { depth: 70, brightness: 70, airiness: 20, raspiness: 15, centroidHz: 290 } },
  { name: "Doja Cat", gender: "female", genre: "Pop", nationality: "western", acousticTraits: { depth: 55, brightness: 80, airiness: 35, raspiness: 25, centroidHz: 320 } },
  { name: "Camila Cabello", gender: "female", genre: "Pop", nationality: "western", acousticTraits: { depth: 60, brightness: 75, airiness: 30, raspiness: 15, centroidHz: 310 } },
  { name: "Stevie Wonder", gender: "male", genre: "Pop", nationality: "western", acousticTraits: { depth: 65, brightness: 80, airiness: 20, raspiness: 15, centroidHz: 260 } },
  { name: "Bob Dylan", gender: "male", genre: "Rock", nationality: "western", acousticTraits: { depth: 55, brightness: 55, airiness: 15, raspiness: 90, centroidHz: 190 } },
  { name: "Bruce Springsteen", gender: "male", genre: "Rock", nationality: "western", acousticTraits: { depth: 70, brightness: 65, airiness: 15, raspiness: 55, centroidHz: 200 } },
  { name: "Axl Rose", gender: "male", genre: "Rock", nationality: "western", acousticTraits: { depth: 55, brightness: 90, airiness: 15, raspiness: 75, centroidHz: 310 } },
  { name: "Adam Levine", gender: "male", genre: "Pop", nationality: "western", acousticTraits: { depth: 40, brightness: 85, airiness: 45, raspiness: 20, centroidHz: 300 } },
  { name: "Justin Bieber", gender: "male", genre: "Pop", nationality: "western", acousticTraits: { depth: 45, brightness: 80, airiness: 35, raspiness: 15, centroidHz: 280 } },
  { name: "Drake", gender: "male", genre: "Pop", nationality: "western", acousticTraits: { depth: 55, brightness: 60, airiness: 25, raspiness: 25, centroidHz: 200 } },
  { name: "Post Malone", gender: "male", genre: "Pop", nationality: "western", acousticTraits: { depth: 60, brightness: 55, airiness: 30, raspiness: 45, centroidHz: 210 } },
  { name: "Ozzy Osbourne", gender: "male", genre: "Rock", nationality: "western", acousticTraits: { depth: 65, brightness: 70, airiness: 15, raspiness: 65, centroidHz: 220 } },
  { name: "Юрий Шатунов", gender: "male", genre: "Pop", nationality: "russian", acousticTraits: { depth: 55, brightness: 80, airiness: 30, raspiness: 15, centroidHz: 260 } },
  { name: "Вячеслав Бутусов", gender: "male", genre: "Rock", nationality: "russian", acousticTraits: { depth: 75, brightness: 55, airiness: 15, raspiness: 45, centroidHz: 170 } },
  { name: "Гарик Сукачёв", gender: "male", genre: "Rock", nationality: "russian", acousticTraits: { depth: 75, brightness: 50, airiness: 15, raspiness: 70, centroidHz: 160 } },
  { name: "Тимати", gender: "male", genre: "Pop", nationality: "russian", acousticTraits: { depth: 60, brightness: 60, airiness: 20, raspiness: 40, centroidHz: 190 } },
  { name: "Ирина Аллегрова", gender: "female", genre: "Pop", nationality: "russian", acousticTraits: { depth: 75, brightness: 75, airiness: 15, raspiness: 35, centroidHz: 300 } },
  { name: "Юта", gender: "female", genre: "Pop", nationality: "russian", acousticTraits: { depth: 60, brightness: 80, airiness: 25, raspiness: 20, centroidHz: 330 } },
  { name: "Ани Лорак", gender: "female", genre: "Pop", nationality: "russian", acousticTraits: { depth: 65, brightness: 85, airiness: 20, raspiness: 15, centroidHz: 360 } },
];

/**
 * Deterministic traits → 13-coefficient pseudo-MFCC mapping (Meyda's default
 * coefficient count, c0..c12). Pure function of the 5 acoustic traits — no
 * randomness — so two similar trait profiles always land close together in
 * cosine-similarity space and two dissimilar ones always land far apart.
 *
 * This is an approximation of how these traits *would* shape a real MFCC
 * envelope, not a physically-modeled vocoder — there's no reference-audio
 * corpus in this project to derive real coefficients from (same caveat as
 * the rest of this file).
 *
 *  - c0  (overall level)     = centroidHz / 10 — real MFCC c0 tracks log-energy/
 *    overall spectral level, and a higher-register voice reads as "louder"
 *    at the top of the band, so we key it off the centroid. NOTE: c0 is
 *    always excluded before comparison (see `rankCelebritiesByGender`), so
 *    this coefficient's absolute scale never actually influences matching.
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
  genre: entry.genre,
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

/**
 * Standard cosine similarity: dot(a,b) / (||a|| * ||b||), in roughly [-1, 1].
 * Guards against a zero-magnitude vector (e.g. a silent/degenerate input) by
 * returning 0 instead of dividing by zero / producing NaN.
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  const n = Math.min(vecA.length, vecB.length);
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < n; i += 1) {
    const a = vecA[i] ?? 0;
    const b = vecB[i] ?? 0;
    dot += a * b;
    magA += a * a;
    magB += b * b;
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  if (denom < 1e-9) return 0;
  return dot / denom;
}

/**
 * Drop MFCC[0] (overall energy/loudness) before comparison — see the
 * "CRITICAL" note in `rankCelebritiesByGender` for why.
 */
function dropC0(vector: number[]): number[] {
  return vector.slice(1);
}

/**
 * Cosine similarity → 0-100 display percentage.
 *
 * Mapping choice: `percent = round(clamp((cos+1)/2, 0, 1) * 100)`, i.e. the
 * full [-1, 1] range is spread across [0, 100] rather than clamping negative
 * similarities to 0. Reasoning: these are 12-dimensional vectors (MFCC[1..12])
 * whose components routinely take BOTH signs (e.g. coefficient c1 = brightness
 * − depth ranges roughly −100..+100, and the higher-order coefficients
 * alternate sign by construction — see `generateTargetVector`). Two voices
 * with opposite spectral tilt (one very bright/light, one very dark/heavy)
 * can legitimately produce a negative cosine similarity, not just "low but
 * positive" similarity. Clamping those to 0 would collapse a real, informative
 * part of the similarity range and make the whole 100-star pool look
 * artificially bunched near the bottom. The (cos+1)/2 mapping keeps the
 * output well-spread across the full 0-100 scale for typical inputs.
 */
function similarityToPercent(cosineSim: number): number {
  const clamped = Math.max(-1, Math.min(1, cosineSim));
  const normalized01 = Math.max(0, Math.min(1, (clamped + 1) / 2));
  return Math.round(normalized01 * 100);
}

export type CelebrityMatch = {
  celebrity: CelebrityProfile;
  /** Raw cosine similarity of the MFCC[1..12] vectors, roughly in [-1, 1]. */
  similarity: number;
  /** 0-100 display score, see `similarityToPercent`. */
  percent: number;
};

/**
 * Ranks the ENTIRE gender-matching subset of the 100-star DB against the
 * student's median MFCC vector, using cosine similarity with MFCC[0]
 * excluded from both sides.
 *
 * 1. Gender filter (STRICT): only candidates whose `gender` field equals the
 *    `gender` argument are ever scored/returned — there is no fallback to the
 *    full pool. Callers (the UI) pass either the auto-detected gender
 *    (`detectGenderFromF0`) or the student's manual override.
 * 2. MFCC[0] exclusion: both the student vector and every candidate's
 *    `mfccVector` are sliced to indices [1..12] (`dropC0`) before computing
 *    similarity — MFCC[0] tracks overall energy/loudness and must never
 *    influence the score (this is what makes the match robust to mic gain).
 * 3. Cosine similarity is inherently scale-invariant per vector (that's the
 *    whole point of using it here instead of Euclidean distance), so no
 *    additional z-score/normalization step against reference stats is
 *    needed the way the old Euclidean matcher required.
 *
 * Returns ALL matching candidates (not just top-N), sorted by descending
 * similarity — the caller decides how to slice/group (see
 * `groupMatchesByGenre` for the genre-bucketed top-5 UI requirement, or just
 * take `[0]` for the single best "Абсолютный мэтч").
 */
export function rankCelebritiesByGender(
  studentMedianMfcc: number[],
  gender: CelebrityGender
): CelebrityMatch[] {
  const pool = CELEBRITIES_DB.filter((c) => c.gender === gender);
  const studentTrimmed = dropC0(studentMedianMfcc);

  return pool
    .map((celebrity) => {
      const refTrimmed = dropC0(celebrity.mfccVector ?? []);
      const similarity = cosineSimilarity(studentTrimmed, refTrimmed);
      return { celebrity, similarity, percent: similarityToPercent(similarity) };
    })
    .sort((a, b) => b.similarity - a.similarity);
}

/**
 * Groups an already gender-filtered, similarity-ranked match list by
 * `celebrity.genre`, keeping only the top `perGenreLimit` (default 5) per
 * genre. Input order is assumed already descending by similarity (as
 * returned by `rankCelebritiesByGender`), so grouping preserves rank order.
 * Genres with zero matches after the gender filter are simply absent from
 * the returned record (never padded with fakes).
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
