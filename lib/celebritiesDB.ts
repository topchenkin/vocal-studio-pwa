/**
 * Reference database of well-known singers for the Voice Celebrity Match
 * (Vocal Fach + timbre weight / airiness / raspiness / tessitura span).
 *
 * ARCHITECTURE: a voice is described by a tessitura bucket plus a timbre
 * vector that is independently measurable on the student's microphone —
 *
 *   1. `vocalFach`      — where the voice LIVES (median F0), not its extremes.
 *   2. `timbreWeight`   — 0 dark/heavy … 100 bright/ringing (spectral centroid).
 *   3. `airiness`       — 0 dense … 100 breathy (high-frequency energy).
 *   4. `raspiness`      — 0 clean … 100 rasp/split (spectral flatness).
 *   5. `tessituraSpan`  — 0 narrow hook … 100 very wide working range.
 *   6. `region`         — russian | western (lists and ranking are split).
 *
 * Matching is a STRICT filter on (gender × vocalFach) followed by weighted
 * nearest-neighbour ranking. A bass can never be matched against a tenor.
 *
 * DATA QUALITY: per-artist numbers are curated from well-known public
 * descriptions (voice type, typical range, dark/bright, belt vs head, grit).
 * They are not laboratory measurements — there is no licensed reference-audio
 * corpus in this project. `tessituraSpan` is an estimate of how wide the
 * singer typically works, not a measured IQR.
 */

export type CelebrityGender = "male" | "female";

export type CelebrityRegion = "russian" | "western";

export type Genre =
  | "Pop"
  | "Rock"
  | "Rap/Hip-Hop"
  | "Jazz/Soul"
  | "Estrada/Chanson";

/** @deprecated Use `Genre`. Kept so older imports keep compiling. */
export type CelebrityGenre = Genre;

/** Display order: Поп, Рок, Рэп, Шансон, Джаз. */
export const CELEBRITY_GENRES: Genre[] = [
  "Pop",
  "Rock",
  "Rap/Hip-Hop",
  "Estrada/Chanson",
  "Jazz/Soul",
];

export const CELEBRITY_REGIONS: CelebrityRegion[] = ["russian", "western"];

export const REGION_LABEL_RU: Record<CelebrityRegion, string> = {
  russian: "Россия",
  western: "Зарубежье",
};

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
  genre: Genre;
  region: CelebrityRegion;
  /** 0 dark – 100 bright. */
  timbreWeight: number;
  /** 0 dense – 100 breathy. */
  airiness: number;
  /** 0 clean – 100 rasp/split. */
  raspiness: number;
  /** 0 narrow typical range – 100 very wide (public-knowledge estimate). */
  tessituraSpan: number;
}

export type TimbreVector = {
  timbreWeight: number;
  airiness: number;
  raspiness: number;
  tessituraSpan?: number;
};

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

/**
 * Raspiness is the main style discriminator (clean pop vs grit rock), then
 * air, then brightness, then range width. Equal Euclidean on a 3-D cube made
 * every amateur take land next to the same mid-pop cluster.
 */
export const AXIS_WEIGHTS = {
  timbreWeight: 1,
  airiness: 1.2,
  raspiness: 1.85,
  tessituraSpan: 0.9,
} as const;

export const DEFAULT_USER_SPAN = 45;

// prettier-ignore
const RAW_ENTRIES: RawEntry[] = [
  // ─── WESTERN MEN ─────────────────────────────────────────────────────────
  { name: "Frank Sinatra",                    gender: "male", vocalFach: "bass_baritone", genre: "Jazz/Soul",        region: "western", timbreWeight: 20, airiness: 15, raspiness: 5,  tessituraSpan: 42 },
  { name: "Louis Armstrong",                  gender: "male", vocalFach: "bass_baritone", genre: "Jazz/Soul",        region: "western", timbreWeight: 10, airiness: 30, raspiness: 100, tessituraSpan: 35 },
  { name: "Barry White",                      gender: "male", vocalFach: "bass_baritone", genre: "Jazz/Soul",        region: "western", timbreWeight: 5,  airiness: 40, raspiness: 60, tessituraSpan: 38 },
  { name: "Elvis Presley",                    gender: "male", vocalFach: "bass_baritone", genre: "Rock",             region: "western", timbreWeight: 35, airiness: 10, raspiness: 18, tessituraSpan: 62 },
  { name: "David Bowie",                      gender: "male", vocalFach: "bass_baritone", genre: "Rock",             region: "western", timbreWeight: 42, airiness: 22, raspiness: 12, tessituraSpan: 70 },
  { name: "Kurt Cobain",                      gender: "male", vocalFach: "bass_baritone", genre: "Rock",             region: "western", timbreWeight: 48, airiness: 16, raspiness: 92, tessituraSpan: 52 },
  { name: "Hozier",                           gender: "male", vocalFach: "bass_baritone", genre: "Rock",             region: "western", timbreWeight: 28, airiness: 28, raspiness: 18, tessituraSpan: 58 },
  { name: "Eddie Vedder",                     gender: "male", vocalFach: "bass_baritone", genre: "Rock",             region: "western", timbreWeight: 24, airiness: 18, raspiness: 42, tessituraSpan: 50 },
  { name: "Lewis Capaldi",                    gender: "male", vocalFach: "bass_baritone", genre: "Pop",              region: "western", timbreWeight: 38, airiness: 26, raspiness: 48, tessituraSpan: 46 },
  { name: "Snoop Dogg",                       gender: "male", vocalFach: "bass_baritone", genre: "Rap/Hip-Hop",      region: "western", timbreWeight: 25, airiness: 40, raspiness: 30, tessituraSpan: 22 },
  { name: "50 Cent",                          gender: "male", vocalFach: "bass_baritone", genre: "Rap/Hip-Hop",      region: "western", timbreWeight: 20, airiness: 10, raspiness: 40, tessituraSpan: 20 },
  { name: "Drake",                            gender: "male", vocalFach: "bass_baritone", genre: "Rap/Hip-Hop",      region: "western", timbreWeight: 35, airiness: 22, raspiness: 8,  tessituraSpan: 40 },
  { name: "Michael Jackson",                  gender: "male", vocalFach: "tenor",         genre: "Pop",              region: "western", timbreWeight: 95, airiness: 38, raspiness: 12, tessituraSpan: 88 },
  { name: "Justin Bieber",                    gender: "male", vocalFach: "tenor",         genre: "Pop",              region: "western", timbreWeight: 90, airiness: 52, raspiness: 2,  tessituraSpan: 55 },
  { name: "Ed Sheeran",                       gender: "male", vocalFach: "tenor",         genre: "Pop",              region: "western", timbreWeight: 72, airiness: 32, raspiness: 8,  tessituraSpan: 48 },
  { name: "Bruno Mars",                       gender: "male", vocalFach: "tenor",         genre: "Pop",              region: "western", timbreWeight: 84, airiness: 14, raspiness: 28, tessituraSpan: 72 },
  { name: "The Weeknd",                       gender: "male", vocalFach: "tenor",         genre: "Pop",              region: "western", timbreWeight: 88, airiness: 48, raspiness: 6,  tessituraSpan: 78 },
  { name: "Justin Timberlake",                gender: "male", vocalFach: "tenor",         genre: "Pop",              region: "western", timbreWeight: 80, airiness: 28, raspiness: 4,  tessituraSpan: 60 },
  { name: "Shawn Mendes",                     gender: "male", vocalFach: "tenor",         genre: "Pop",              region: "western", timbreWeight: 76, airiness: 36, raspiness: 10, tessituraSpan: 52 },
  { name: "Adam Levine",                      gender: "male", vocalFach: "tenor",         genre: "Pop",              region: "western", timbreWeight: 92, airiness: 18, raspiness: 16, tessituraSpan: 68 },
  { name: "Harry Styles",                     gender: "male", vocalFach: "tenor",         genre: "Pop",              region: "western", timbreWeight: 78, airiness: 40, raspiness: 6,  tessituraSpan: 54 },
  { name: "Charlie Puth",                     gender: "male", vocalFach: "tenor",         genre: "Pop",              region: "western", timbreWeight: 82, airiness: 22, raspiness: 8,  tessituraSpan: 64 },
  { name: "Sam Smith",                        gender: "male", vocalFach: "tenor",         genre: "Pop",              region: "western", timbreWeight: 70, airiness: 58, raspiness: 4,  tessituraSpan: 62 },
  { name: "Freddie Mercury",                  gender: "male", vocalFach: "tenor",         genre: "Rock",             region: "western", timbreWeight: 70, airiness: 6,  raspiness: 42, tessituraSpan: 94 },
  { name: "Chester Bennington",               gender: "male", vocalFach: "tenor",         genre: "Rock",             region: "western", timbreWeight: 66, airiness: 10, raspiness: 90, tessituraSpan: 80 },
  { name: "Paul McCartney",                   gender: "male", vocalFach: "tenor",         genre: "Rock",             region: "western", timbreWeight: 74, airiness: 16, raspiness: 8,  tessituraSpan: 58 },
  { name: "Mick Jagger",                      gender: "male", vocalFach: "tenor",         genre: "Rock",             region: "western", timbreWeight: 58, airiness: 22, raspiness: 52, tessituraSpan: 55 },
  { name: "Dan Reynolds (Imagine Dragons)",   gender: "male", vocalFach: "tenor",         genre: "Rock",             region: "western", timbreWeight: 68, airiness: 24, raspiness: 62, tessituraSpan: 60 },
  { name: "Axl Rose",                         gender: "male", vocalFach: "tenor",         genre: "Rock",             region: "western", timbreWeight: 74, airiness: 12, raspiness: 72, tessituraSpan: 86 },
  { name: "Chris Cornell",                    gender: "male", vocalFach: "tenor",         genre: "Rock",             region: "western", timbreWeight: 60, airiness: 12, raspiness: 58, tessituraSpan: 82 },
  { name: "Steven Tyler",                     gender: "male", vocalFach: "tenor",         genre: "Rock",             region: "western", timbreWeight: 80, airiness: 18, raspiness: 68, tessituraSpan: 84 },
  { name: "Robert Plant",                     gender: "male", vocalFach: "tenor",         genre: "Rock",             region: "western", timbreWeight: 86, airiness: 20, raspiness: 38, tessituraSpan: 90 },
  { name: "Billie Joe Armstrong",             gender: "male", vocalFach: "tenor",         genre: "Rock",             region: "western", timbreWeight: 64, airiness: 20, raspiness: 44, tessituraSpan: 50 },
  { name: "Eminem",                           gender: "male", vocalFach: "tenor",         genre: "Rap/Hip-Hop",      region: "western", timbreWeight: 75, airiness: 10, raspiness: 42, tessituraSpan: 28 },
  { name: "Stevie Wonder",                    gender: "male", vocalFach: "tenor",         genre: "Jazz/Soul",        region: "western", timbreWeight: 80, airiness: 15, raspiness: 22, tessituraSpan: 72 },

  // ─── RUSSIAN MEN ─────────────────────────────────────────────────────────
  { name: "Григорий Лепс",                    gender: "male", vocalFach: "bass_baritone", genre: "Estrada/Chanson",  region: "russian", timbreWeight: 35, airiness: 10, raspiness: 95, tessituraSpan: 70 },
  { name: "Михаил Круг",                      gender: "male", vocalFach: "bass_baritone", genre: "Estrada/Chanson",  region: "russian", timbreWeight: 25, airiness: 15, raspiness: 40, tessituraSpan: 32 },
  { name: "Муслим Магомаев",                  gender: "male", vocalFach: "bass_baritone", genre: "Estrada/Chanson",  region: "russian", timbreWeight: 20, airiness: 5,  raspiness: 0,  tessituraSpan: 78 },
  { name: "Филипп Киркоров",                  gender: "male", vocalFach: "bass_baritone", genre: "Pop",              region: "russian", timbreWeight: 42, airiness: 12, raspiness: 8,  tessituraSpan: 55 },
  { name: "Леонид Агутин",                    gender: "male", vocalFach: "bass_baritone", genre: "Pop",              region: "russian", timbreWeight: 46, airiness: 32, raspiness: 36, tessituraSpan: 48 },
  { name: "Баста",                            gender: "male", vocalFach: "bass_baritone", genre: "Rap/Hip-Hop",      region: "russian", timbreWeight: 30, airiness: 20, raspiness: 60, tessituraSpan: 35 },
  { name: "Скриптонит",                       gender: "male", vocalFach: "bass_baritone", genre: "Rap/Hip-Hop",      region: "russian", timbreWeight: 25, airiness: 50, raspiness: 85, tessituraSpan: 24 },
  { name: "Oxxxymiron",                       gender: "male", vocalFach: "bass_baritone", genre: "Rap/Hip-Hop",      region: "russian", timbreWeight: 40, airiness: 15, raspiness: 30, tessituraSpan: 22 },
  { name: "Macan",                            gender: "male", vocalFach: "bass_baritone", genre: "Rap/Hip-Hop",      region: "russian", timbreWeight: 35, airiness: 40, raspiness: 20, tessituraSpan: 30 },
  { name: "Михаил Горшенев (КиШ)",            gender: "male", vocalFach: "bass_baritone", genre: "Rock",             region: "russian", timbreWeight: 26, airiness: 6,  raspiness: 82, tessituraSpan: 48 },
  { name: "Виктор Цой",                       gender: "male", vocalFach: "bass_baritone", genre: "Rock",             region: "russian", timbreWeight: 32, airiness: 12, raspiness: 16, tessituraSpan: 28 },
  { name: "Вячеслав Бутусов",                 gender: "male", vocalFach: "bass_baritone", genre: "Rock",             region: "russian", timbreWeight: 28, airiness: 22, raspiness: 12, tessituraSpan: 36 },
  { name: "Илья Лагутенко",                   gender: "male", vocalFach: "bass_baritone", genre: "Rock",             region: "russian", timbreWeight: 50, airiness: 62, raspiness: 22, tessituraSpan: 40 },
  { name: "Юрий Шевчук",                      gender: "male", vocalFach: "bass_baritone", genre: "Rock",             region: "russian", timbreWeight: 30, airiness: 14, raspiness: 38, tessituraSpan: 42 },
  { name: "Константин Кинчев",                gender: "male", vocalFach: "bass_baritone", genre: "Rock",             region: "russian", timbreWeight: 22, airiness: 8,  raspiness: 58, tessituraSpan: 38 },
  { name: "Борис Гребенщиков",                gender: "male", vocalFach: "bass_baritone", genre: "Rock",             region: "russian", timbreWeight: 36, airiness: 26, raspiness: 10, tessituraSpan: 44 },
  { name: "Владимир Шахрин",                  gender: "male", vocalFach: "bass_baritone", genre: "Rock",             region: "russian", timbreWeight: 34, airiness: 12, raspiness: 32, tessituraSpan: 40 },
  { name: "Дима Билан",                       gender: "male", vocalFach: "tenor",         genre: "Pop",              region: "russian", timbreWeight: 80, airiness: 34, raspiness: 16, tessituraSpan: 62 },
  { name: "Сергей Лазарев",                   gender: "male", vocalFach: "tenor",         genre: "Pop",              region: "russian", timbreWeight: 86, airiness: 10, raspiness: 6,  tessituraSpan: 70 },
  { name: "Валерий Меладзе",                  gender: "male", vocalFach: "tenor",         genre: "Pop",              region: "russian", timbreWeight: 62, airiness: 16, raspiness: 28, tessituraSpan: 58 },
  { name: "Николай Басков",                   gender: "male", vocalFach: "tenor",         genre: "Pop",              region: "russian", timbreWeight: 74, airiness: 6,  raspiness: 2,  tessituraSpan: 80 },
  { name: "Shaman",                           gender: "male", vocalFach: "tenor",         genre: "Pop",              region: "russian", timbreWeight: 82, airiness: 14, raspiness: 42, tessituraSpan: 76 },
  { name: "Jony",                             gender: "male", vocalFach: "tenor",         genre: "Pop",              region: "russian", timbreWeight: 78, airiness: 54, raspiness: 10, tessituraSpan: 50 },
  { name: "Niletto",                          gender: "male", vocalFach: "tenor",         genre: "Pop",              region: "russian", timbreWeight: 68, airiness: 42, raspiness: 6,  tessituraSpan: 44 },
  { name: "Владимир Пресняков",               gender: "male", vocalFach: "tenor",         genre: "Pop",              region: "russian", timbreWeight: 92, airiness: 28, raspiness: 12, tessituraSpan: 72 },
  { name: "Сергей Жуков (Руки Вверх)",        gender: "male", vocalFach: "tenor",         genre: "Pop",              region: "russian", timbreWeight: 70, airiness: 12, raspiness: 4,  tessituraSpan: 32 },
  { name: "Мот",                              gender: "male", vocalFach: "tenor",         genre: "Pop",              region: "russian", timbreWeight: 66, airiness: 30, raspiness: 18, tessituraSpan: 42 },
  { name: "Артём Пивоваров",                  gender: "male", vocalFach: "tenor",         genre: "Pop",              region: "russian", timbreWeight: 76, airiness: 36, raspiness: 10, tessituraSpan: 52 },
  { name: "Егор Крид",                        gender: "male", vocalFach: "tenor",         genre: "Pop",              region: "russian", timbreWeight: 72, airiness: 26, raspiness: 14, tessituraSpan: 46 },
  { name: "Хабиб",                            gender: "male", vocalFach: "tenor",         genre: "Pop",              region: "russian", timbreWeight: 64, airiness: 44, raspiness: 8,  tessituraSpan: 38 },
  { name: "Miyagi",                           gender: "male", vocalFach: "tenor",         genre: "Rap/Hip-Hop",      region: "russian", timbreWeight: 68, airiness: 45, raspiness: 30, tessituraSpan: 36 },
  { name: "Валерий Кипелов",                  gender: "male", vocalFach: "tenor",         genre: "Rock",             region: "russian", timbreWeight: 88, airiness: 6,  raspiness: 62, tessituraSpan: 84 },
  { name: "Александр Градский",               gender: "male", vocalFach: "tenor",         genre: "Rock",             region: "russian", timbreWeight: 80, airiness: 5,  raspiness: 18, tessituraSpan: 90 },
  { name: "Глеб Самойлов",                    gender: "male", vocalFach: "tenor",         genre: "Rock",             region: "russian", timbreWeight: 56, airiness: 20, raspiness: 28, tessituraSpan: 50 },
  { name: "Александр Васильев (Сплин)",       gender: "male", vocalFach: "tenor",         genre: "Rock",             region: "russian", timbreWeight: 60, airiness: 32, raspiness: 14, tessituraSpan: 48 },
  { name: "Би-2 (Шура)",                      gender: "male", vocalFach: "tenor",         genre: "Rock",             region: "russian", timbreWeight: 58, airiness: 38, raspiness: 22, tessituraSpan: 42 },
  { name: "Найк Борзов",                      gender: "male", vocalFach: "tenor",         genre: "Rock",             region: "russian", timbreWeight: 52, airiness: 42, raspiness: 16, tessituraSpan: 44 },

  // ─── WESTERN WOMEN ───────────────────────────────────────────────────────
  { name: "Adele",                            gender: "female", vocalFach: "contralto",     genre: "Pop",              region: "western", timbreWeight: 34, airiness: 18, raspiness: 12, tessituraSpan: 58 },
  { name: "Dua Lipa",                         gender: "female", vocalFach: "contralto",     genre: "Pop",              region: "western", timbreWeight: 48, airiness: 32, raspiness: 6,  tessituraSpan: 46 },
  { name: "Lana Del Rey",                     gender: "female", vocalFach: "contralto",     genre: "Pop",              region: "western", timbreWeight: 22, airiness: 62, raspiness: 4,  tessituraSpan: 32 },
  { name: "Shakira",                          gender: "female", vocalFach: "contralto",     genre: "Pop",              region: "western", timbreWeight: 52, airiness: 18, raspiness: 42, tessituraSpan: 64 },
  { name: "Cher",                             gender: "female", vocalFach: "contralto",     genre: "Pop",              region: "western", timbreWeight: 18, airiness: 6,  raspiness: 12, tessituraSpan: 50 },
  { name: "Amy Winehouse",                    gender: "female", vocalFach: "contralto",     genre: "Jazz/Soul",        region: "western", timbreWeight: 30, airiness: 15, raspiness: 45, tessituraSpan: 48 },
  { name: "Ella Fitzgerald",                  gender: "female", vocalFach: "contralto",     genre: "Jazz/Soul",        region: "western", timbreWeight: 35, airiness: 10, raspiness: 0,  tessituraSpan: 82 },
  { name: "Miley Cyrus",                      gender: "female", vocalFach: "contralto",     genre: "Rock",             region: "western", timbreWeight: 44, airiness: 14, raspiness: 64, tessituraSpan: 62 },
  { name: "Tina Turner",                      gender: "female", vocalFach: "contralto",     genre: "Rock",             region: "western", timbreWeight: 36, airiness: 6,  raspiness: 86, tessituraSpan: 70 },
  { name: "Stevie Nicks",                     gender: "female", vocalFach: "contralto",     genre: "Rock",             region: "western", timbreWeight: 38, airiness: 42, raspiness: 28, tessituraSpan: 52 },
  { name: "Billie Eilish",                    gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              region: "western", timbreWeight: 82, airiness: 96, raspiness: 4,  tessituraSpan: 22 },
  { name: "Ariana Grande",                    gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              region: "western", timbreWeight: 96, airiness: 42, raspiness: 2,  tessituraSpan: 92 },
  { name: "Beyonce",                          gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              region: "western", timbreWeight: 76, airiness: 18, raspiness: 16, tessituraSpan: 86 },
  { name: "Lady Gaga",                        gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              region: "western", timbreWeight: 64, airiness: 14, raspiness: 28, tessituraSpan: 80 },
  { name: "Taylor Swift",                     gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              region: "western", timbreWeight: 68, airiness: 28, raspiness: 6,  tessituraSpan: 48 },
  { name: "Rihanna",                          gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              region: "western", timbreWeight: 58, airiness: 24, raspiness: 18, tessituraSpan: 50 },
  { name: "Katy Perry",                       gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              region: "western", timbreWeight: 72, airiness: 12, raspiness: 8,  tessituraSpan: 52 },
  { name: "Sia",                              gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              region: "western", timbreWeight: 80, airiness: 18, raspiness: 62, tessituraSpan: 74 },
  { name: "Celine Dion",                      gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              region: "western", timbreWeight: 84, airiness: 8,  raspiness: 6,  tessituraSpan: 88 },
  { name: "Mariah Carey",                     gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              region: "western", timbreWeight: 94, airiness: 32, raspiness: 2,  tessituraSpan: 98 },
  { name: "Whitney Houston",                  gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              region: "western", timbreWeight: 88, airiness: 14, raspiness: 12, tessituraSpan: 90 },
  { name: "Olivia Rodrigo",                   gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              region: "western", timbreWeight: 70, airiness: 26, raspiness: 22, tessituraSpan: 56 },
  { name: "Sabrina Carpenter",                gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              region: "western", timbreWeight: 78, airiness: 34, raspiness: 6,  tessituraSpan: 48 },
  { name: "Madonna",                          gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              region: "western", timbreWeight: 60, airiness: 20, raspiness: 14, tessituraSpan: 46 },
  { name: "Britney Spears",                   gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              region: "western", timbreWeight: 74, airiness: 24, raspiness: 4,  tessituraSpan: 42 },
  { name: "Christina Aguilera",               gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              region: "western", timbreWeight: 86, airiness: 16, raspiness: 22, tessituraSpan: 88 },
  { name: "Pink",                             gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              region: "western", timbreWeight: 66, airiness: 12, raspiness: 50, tessituraSpan: 72 },
  { name: "Cardi B",                          gender: "female", vocalFach: "mezzo_soprano", genre: "Rap/Hip-Hop",      region: "western", timbreWeight: 60, airiness: 5,  raspiness: 50, tessituraSpan: 24 },
  { name: "Janis Joplin",                     gender: "female", vocalFach: "mezzo_soprano", genre: "Rock",             region: "western", timbreWeight: 56, airiness: 6,  raspiness: 96, tessituraSpan: 68 },
  { name: "Avril Lavigne",                    gender: "female", vocalFach: "mezzo_soprano", genre: "Rock",             region: "western", timbreWeight: 82, airiness: 10, raspiness: 18, tessituraSpan: 46 },
  { name: "Amy Lee (Evanescence)",            gender: "female", vocalFach: "mezzo_soprano", genre: "Rock",             region: "western", timbreWeight: 75, airiness: 22, raspiness: 12, tessituraSpan: 76 },
  { name: "Hayley Williams",                  gender: "female", vocalFach: "mezzo_soprano", genre: "Rock",             region: "western", timbreWeight: 84, airiness: 16, raspiness: 30, tessituraSpan: 74 },
  { name: "Florence Welch",                   gender: "female", vocalFach: "mezzo_soprano", genre: "Rock",             region: "western", timbreWeight: 72, airiness: 32, raspiness: 14, tessituraSpan: 80 },
  { name: "Aretha Franklin",                  gender: "female", vocalFach: "mezzo_soprano", genre: "Jazz/Soul",        region: "western", timbreWeight: 70, airiness: 10, raspiness: 22, tessituraSpan: 84 },

  // ─── RUSSIAN WOMEN ───────────────────────────────────────────────────────
  { name: "Zivert",                           gender: "female", vocalFach: "contralto",     genre: "Pop",              region: "russian", timbreWeight: 48, airiness: 36, raspiness: 10, tessituraSpan: 44 },
  { name: "Слава",                            gender: "female", vocalFach: "contralto",     genre: "Pop",              region: "russian", timbreWeight: 32, airiness: 10, raspiness: 32, tessituraSpan: 40 },
  { name: "Лобода",                           gender: "female", vocalFach: "contralto",     genre: "Pop",              region: "russian", timbreWeight: 46, airiness: 24, raspiness: 22, tessituraSpan: 52 },
  { name: "Земфира",                          gender: "female", vocalFach: "contralto",     genre: "Rock",             region: "russian", timbreWeight: 40, airiness: 30, raspiness: 16, tessituraSpan: 42 },
  { name: "Диана Арбенина",                   gender: "female", vocalFach: "contralto",     genre: "Rock",             region: "russian", timbreWeight: 28, airiness: 10, raspiness: 44, tessituraSpan: 40 },
  { name: "Светлана Сурганова",               gender: "female", vocalFach: "contralto",     genre: "Rock",             region: "russian", timbreWeight: 34, airiness: 18, raspiness: 24, tessituraSpan: 44 },
  { name: "Жанна Агузарова",                  gender: "female", vocalFach: "contralto",     genre: "Rock",             region: "russian", timbreWeight: 44, airiness: 26, raspiness: 32, tessituraSpan: 50 },
  { name: "Лолита",                           gender: "female", vocalFach: "contralto",     genre: "Estrada/Chanson",  region: "russian", timbreWeight: 25, airiness: 15, raspiness: 35, tessituraSpan: 38 },
  { name: "Алла Пугачева",                    gender: "female", vocalFach: "contralto",     genre: "Estrada/Chanson",  region: "russian", timbreWeight: 35, airiness: 20, raspiness: 45, tessituraSpan: 72 },
  { name: "Ирина Аллегрова",                  gender: "female", vocalFach: "contralto",     genre: "Estrada/Chanson",  region: "russian", timbreWeight: 38, airiness: 10, raspiness: 60, tessituraSpan: 48 },
  { name: "Любовь Успенская",                 gender: "female", vocalFach: "contralto",     genre: "Estrada/Chanson",  region: "russian", timbreWeight: 28, airiness: 25, raspiness: 50, tessituraSpan: 42 },
  { name: "Надежда Кадышева",                 gender: "female", vocalFach: "contralto",     genre: "Estrada/Chanson",  region: "russian", timbreWeight: 40, airiness: 5,  raspiness: 0,  tessituraSpan: 55 },
  { name: "Полина Гагарина",                  gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              region: "russian", timbreWeight: 80, airiness: 14, raspiness: 26, tessituraSpan: 78 },
  { name: "Anna Asti",                        gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              region: "russian", timbreWeight: 56, airiness: 40, raspiness: 36, tessituraSpan: 52 },
  { name: "Монеточка",                        gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              region: "russian", timbreWeight: 98, airiness: 48, raspiness: 0,  tessituraSpan: 36 },
  { name: "Клава Кока",                       gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              region: "russian", timbreWeight: 92, airiness: 38, raspiness: 8,  tessituraSpan: 44 },
  { name: "Нюша",                             gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              region: "russian", timbreWeight: 84, airiness: 30, raspiness: 2,  tessituraSpan: 50 },
  { name: "МакSим",                           gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              region: "russian", timbreWeight: 78, airiness: 62, raspiness: 0,  tessituraSpan: 42 },
  { name: "Мари Краймбрери",                  gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              region: "russian", timbreWeight: 74, airiness: 28, raspiness: 16, tessituraSpan: 46 },
  { name: "Дора",                             gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              region: "russian", timbreWeight: 90, airiness: 50, raspiness: 4,  tessituraSpan: 38 },
  { name: "Ёлка",                             gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              region: "russian", timbreWeight: 70, airiness: 24, raspiness: 12, tessituraSpan: 48 },
  { name: "Валерия",                          gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              region: "russian", timbreWeight: 76, airiness: 10, raspiness: 2,  tessituraSpan: 54 },
  { name: "Темникова",                        gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              region: "russian", timbreWeight: 64, airiness: 66, raspiness: 6,  tessituraSpan: 40 },
  { name: "Люся Чеботина",                    gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              region: "russian", timbreWeight: 88, airiness: 36, raspiness: 8,  tessituraSpan: 40 },
  { name: "IOWA",                             gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              region: "russian", timbreWeight: 77, airiness: 20, raspiness: 20, tessituraSpan: 56 },
  { name: "Алсу",                             gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              region: "russian", timbreWeight: 82, airiness: 18, raspiness: 4,  tessituraSpan: 62 },
  { name: "Ани Лорак",                        gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              region: "russian", timbreWeight: 85, airiness: 16, raspiness: 14, tessituraSpan: 70 },
  { name: "Ханна",                            gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              region: "russian", timbreWeight: 89, airiness: 44, raspiness: 6,  tessituraSpan: 38 },
  { name: "Бьянка",                           gender: "female", vocalFach: "mezzo_soprano", genre: "Rap/Hip-Hop",      region: "russian", timbreWeight: 70, airiness: 15, raspiness: 20, tessituraSpan: 34 },
  { name: "Инстасамка",                       gender: "female", vocalFach: "mezzo_soprano", genre: "Rap/Hip-Hop",      region: "russian", timbreWeight: 65, airiness: 30, raspiness: 25, tessituraSpan: 26 },
  { name: "Пелагея",                          gender: "female", vocalFach: "mezzo_soprano", genre: "Rock",             region: "russian", timbreWeight: 78, airiness: 10, raspiness: 2,  tessituraSpan: 82 },
  { name: "Юлия Чичерина",                    gender: "female", vocalFach: "mezzo_soprano", genre: "Rock",             region: "russian", timbreWeight: 68, airiness: 18, raspiness: 38, tessituraSpan: 50 },
  { name: "Юлия Санина",                      gender: "female", vocalFach: "mezzo_soprano", genre: "Rock",             region: "russian", timbreWeight: 80, airiness: 14, raspiness: 42, tessituraSpan: 74 },
  { name: "Моя Мишель",                       gender: "female", vocalFach: "mezzo_soprano", genre: "Rock",             region: "russian", timbreWeight: 86, airiness: 46, raspiness: 8,  tessituraSpan: 40 },
  { name: "Лусинэ Геворкян (Louna)",          gender: "female", vocalFach: "mezzo_soprano", genre: "Rock",             region: "russian", timbreWeight: 62, airiness: 10, raspiness: 72, tessituraSpan: 66 },
  { name: "Лариса Долина",                    gender: "female", vocalFach: "mezzo_soprano", genre: "Jazz/Soul",        region: "russian", timbreWeight: 75, airiness: 10, raspiness: 15, tessituraSpan: 76 },
];

export const CELEBRITIES_DB: CelebrityProfile[] = RAW_ENTRIES.map((entry) => ({
  id: slugify(entry.name),
  ...entry,
}));

const MALE_FACHES: VocalFach[] = ["bass_baritone", "tenor"];
const FEMALE_FACHES: VocalFach[] = ["contralto", "mezzo_soprano"];

function assertAxis(name: string, label: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`celebritiesDB: ${name} has out-of-range ${label} ${value}`);
  }
}

/**
 * Integrity checks run only in Node (build / SSR). Never touch `process` in
 * the browser: a leftover `process.env.NODE_ENV` lookup becomes
 * `ReferenceError: process is not defined` and kills any page that loads this
 * module (admin dashboard and student AI-tools via static import / prefetch).
 */
function assertDatabaseIntegrity(): void {
  const ids = new Set(CELEBRITIES_DB.map((c) => c.id));
  if (ids.size !== CELEBRITIES_DB.length) {
    throw new Error("celebritiesDB: duplicate slug ids detected");
  }
  if (CELEBRITIES_DB.length < 100) {
    throw new Error(`celebritiesDB: expected at least 100 entries, got ${CELEBRITIES_DB.length}`);
  }
  for (const c of CELEBRITIES_DB) {
    const allowed = c.gender === "male" ? MALE_FACHES : FEMALE_FACHES;
    if (!allowed.includes(c.vocalFach)) {
      throw new Error(`celebritiesDB: ${c.name} has fach ${c.vocalFach} incompatible with gender ${c.gender}`);
    }
    if (c.region !== "russian" && c.region !== "western") {
      throw new Error(`celebritiesDB: ${c.name} has invalid region ${c.region}`);
    }
    assertAxis(c.name, "timbreWeight", c.timbreWeight);
    assertAxis(c.name, "airiness", c.airiness);
    assertAxis(c.name, "raspiness", c.raspiness);
    assertAxis(c.name, "tessituraSpan", c.tessituraSpan);
  }
}

if (typeof window === "undefined") {
  assertDatabaseIntegrity();
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
  /** Weighted distance in the 0-100 cube. Smaller = better match. */
  distance: number;
  /** 0-100 display score, see `distanceToPercent`. */
  percent: number;
};

/**
 * Maximum Euclidean distance in the 0-100 cube:
 *   sqrt((100-0)^2 + (100-0)^2 + (100-0)^2) = sqrt(30000) ≈ 173.205
 */
export const MAX_3D_DISTANCE = Math.sqrt(3 * 100 * 100);

/**
 * 3-D Euclidean distance between two timbre vectors:
 *   d = sqrt((uw-sw)^2 + (ua-sa)^2 + (ur-sr)^2)
 */
export function euclideanDistance3D(user: TimbreVector, star: TimbreVector): number {
  const dw = user.timbreWeight - star.timbreWeight;
  const da = user.airiness - star.airiness;
  const dr = user.raspiness - star.raspiness;
  return Math.sqrt(dw * dw + da * da + dr * dr);
}

/**
 * Style-weighted distance. Raspiness is amplified so a clean pop take and a
 * gritty rock take cannot collapse onto the same nearest neighbours.
 */
export function weightedDistance(user: TimbreVector, star: CelebrityProfile): number {
  const span = user.tessituraSpan ?? DEFAULT_USER_SPAN;
  const dw = (user.timbreWeight - star.timbreWeight) * AXIS_WEIGHTS.timbreWeight;
  const da = (user.airiness - star.airiness) * AXIS_WEIGHTS.airiness;
  const dr = (user.raspiness - star.raspiness) * AXIS_WEIGHTS.raspiness;
  const ds = (span - star.tessituraSpan) * AXIS_WEIGHTS.tessituraSpan;
  return Math.sqrt(dw * dw + da * da + dr * dr + ds * ds);
}

/**
 * Distance → display percentage. Exponential so a 10-point style gap is
 * visible (the old linear map over ~173 made every mid-cluster star look
 * like 90%+).
 */
export function distanceToPercent(distance: number): number {
  const TAU = 36;
  if (!Number.isFinite(distance) || distance <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round(100 * Math.exp(-distance / TAU))));
}

/** STRICT filter: only profiles whose gender AND vocalFach both match. */
export function filterCelebrities(
  gender: CelebrityGender,
  fach: VocalFach
): CelebrityProfile[] {
  return CELEBRITIES_DB.filter((c) => c.gender === gender && c.vocalFach === fach);
}

/**
 * Rank an already-filtered pool by weighted distance, ascending
 * (ties broken by `id` so the order is stable and reproducible).
 */
export function rankCelebrities(
  pool: CelebrityProfile[],
  user: TimbreVector
): CelebrityMatch[] {
  return pool
    .map((celebrity) => {
      const distance = weightedDistance(user, celebrity);
      return { celebrity, distance, percent: distanceToPercent(distance) };
    })
    .sort((a, b) =>
      a.distance === b.distance
        ? a.celebrity.id.localeCompare(b.celebrity.id)
        : a.distance - b.distance
    );
}

/**
 * The one and only matcher: STRICT (gender × vocalFach) filter, then weighted
 * rank. No fallback pool — a bass cannot surface a tenor.
 */
export function matchCelebrities(
  gender: CelebrityGender,
  fach: VocalFach,
  user: TimbreVector
): CelebrityMatch[] {
  return rankCelebrities(filterCelebrities(gender, fach), user);
}

/**
 * Groups an already filtered + ranked match list by `celebrity.genre`, keeping
 * only the top `perGenreLimit` (default 5) per genre. If a genre has fewer
 * than the limit, the bucket is simply shorter — never padded, never topped
 * up from outside the filtered pool. Empty genres are omitted.
 */
export function groupMatchesByGenre(
  matches: CelebrityMatch[],
  perGenreLimit = 5
): Partial<Record<Genre, CelebrityMatch[]>> {
  const groups: Partial<Record<Genre, CelebrityMatch[]>> = {};
  for (const match of matches) {
    const genre = match.celebrity.genre;
    const bucket = groups[genre] ?? (groups[genre] = []);
    if (bucket.length < perGenreLimit) bucket.push(match);
  }
  return groups;
}

export type RegionGenreGroups = Partial<
  Record<CelebrityRegion, Partial<Record<Genre, CelebrityMatch[]>>>
>;

/** Same as `groupMatchesByGenre`, but split Россия / Зарубежье first. */
export function groupMatchesByRegionAndGenre(
  matches: CelebrityMatch[],
  perLimit = 5
): RegionGenreGroups {
  const out: RegionGenreGroups = {};
  for (const match of matches) {
    const region = match.celebrity.region;
    const genre = match.celebrity.genre;
    const regionBucket = out[region] ?? (out[region] = {});
    const genreBucket = regionBucket[genre] ?? (regionBucket[genre] = []);
    if (genreBucket.length < perLimit) genreBucket.push(match);
  }
  return out;
}

/** Alias of `groupMatchesByGenre` — top-N per genre (5 if enough, else all). */
export const topMatchesPerGenre = groupMatchesByGenre;
