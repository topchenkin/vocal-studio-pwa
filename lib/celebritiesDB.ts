/**
 * Reference database of 100 well-known singers for the 3D Voice Celebrity
 * Match (Vocal Fach + timbre weight / airiness / raspiness).
 *
 * ARCHITECTURE: a voice is described by a tessitura bucket plus a 3-D timbre
 * vector that is independently measurable on the student's microphone —
 *
 *   1. `vocalFach`     — where the voice LIVES (median F0), not its extremes.
 *   2. `timbreWeight`  — 0 dark/heavy … 100 bright/ringing (spectral centroid).
 *   3. `airiness`      — 0 dense … 100 breathy (zero-crossing rate).
 *   4. `raspiness`     — 0 clean … 100 rasp/split (spectral flatness).
 *
 * Matching is a STRICT filter on (gender × vocalFach) followed by nearest-
 * neighbour ranking on Euclidean distance in that 3-D cube. A bass can never
 * be matched against a tenor.
 *
 * Per-artist values are hand-authored from each singer's documented vocal
 * character (there is no licensed reference-audio corpus in this project).
 */

export type CelebrityGender = "male" | "female";

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
  /** 0 dark – 100 bright. */
  timbreWeight: number;
  /** 0 dense – 100 breathy. */
  airiness: number;
  /** 0 clean – 100 rasp/split. */
  raspiness: number;
}

export type TimbreVector = {
  timbreWeight: number;
  airiness: number;
  raspiness: number;
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

// prettier-ignore
const RAW_ENTRIES: RawEntry[] = [
  // WESTERN MEN (25)
  { name: "Frank Sinatra",                    gender: "male", vocalFach: "bass_baritone", genre: "Jazz/Soul",        timbreWeight: 20, airiness: 15, raspiness: 5   },
  { name: "Louis Armstrong",                  gender: "male", vocalFach: "bass_baritone", genre: "Jazz/Soul",        timbreWeight: 10, airiness: 30, raspiness: 100 },
  { name: "Barry White",                      gender: "male", vocalFach: "bass_baritone", genre: "Jazz/Soul",        timbreWeight: 5,  airiness: 40, raspiness: 60  },
  { name: "Elvis Presley",                    gender: "male", vocalFach: "bass_baritone", genre: "Rock",             timbreWeight: 35, airiness: 10, raspiness: 15  },
  { name: "David Bowie",                      gender: "male", vocalFach: "bass_baritone", genre: "Rock",             timbreWeight: 40, airiness: 20, raspiness: 10  },
  { name: "Kurt Cobain",                      gender: "male", vocalFach: "bass_baritone", genre: "Rock",             timbreWeight: 45, airiness: 15, raspiness: 95  },
  { name: "Hozier",                           gender: "male", vocalFach: "bass_baritone", genre: "Rock",             timbreWeight: 30, airiness: 25, raspiness: 15  },
  { name: "Snoop Dogg",                       gender: "male", vocalFach: "bass_baritone", genre: "Rap/Hip-Hop",      timbreWeight: 25, airiness: 40, raspiness: 30  },
  { name: "50 Cent",                          gender: "male", vocalFach: "bass_baritone", genre: "Rap/Hip-Hop",      timbreWeight: 20, airiness: 10, raspiness: 40  },
  { name: "Drake",                            gender: "male", vocalFach: "bass_baritone", genre: "Rap/Hip-Hop",      timbreWeight: 35, airiness: 20, raspiness: 5   },
  { name: "Michael Jackson",                  gender: "male", vocalFach: "tenor",         genre: "Pop",              timbreWeight: 95, airiness: 40, raspiness: 10  },
  { name: "Justin Bieber",                    gender: "male", vocalFach: "tenor",         genre: "Pop",              timbreWeight: 90, airiness: 50, raspiness: 0   },
  { name: "Ed Sheeran",                       gender: "male", vocalFach: "tenor",         genre: "Pop",              timbreWeight: 75, airiness: 35, raspiness: 5   },
  { name: "Bruno Mars",                       gender: "male", vocalFach: "tenor",         genre: "Pop",              timbreWeight: 85, airiness: 15, raspiness: 25  },
  { name: "The Weeknd",                       gender: "male", vocalFach: "tenor",         genre: "Pop",              timbreWeight: 88, airiness: 45, raspiness: 5   },
  { name: "Justin Timberlake",                gender: "male", vocalFach: "tenor",         genre: "Pop",              timbreWeight: 82, airiness: 30, raspiness: 0   },
  { name: "Shawn Mendes",                     gender: "male", vocalFach: "tenor",         genre: "Pop",              timbreWeight: 78, airiness: 40, raspiness: 10  },
  { name: "Adam Levine",                      gender: "male", vocalFach: "tenor",         genre: "Pop",              timbreWeight: 92, airiness: 20, raspiness: 15  },
  { name: "Freddie Mercury",                  gender: "male", vocalFach: "tenor",         genre: "Rock",             timbreWeight: 70, airiness: 5,  raspiness: 40  },
  { name: "Chester Bennington",               gender: "male", vocalFach: "tenor",         genre: "Rock",             timbreWeight: 65, airiness: 10, raspiness: 90  },
  { name: "Paul McCartney",                   gender: "male", vocalFach: "tenor",         genre: "Rock",             timbreWeight: 75, airiness: 15, raspiness: 5   },
  { name: "Mick Jagger",                      gender: "male", vocalFach: "tenor",         genre: "Rock",             timbreWeight: 60, airiness: 20, raspiness: 50  },
  { name: "Dan Reynolds (Imagine Dragons)",   gender: "male", vocalFach: "tenor",         genre: "Rock",             timbreWeight: 68, airiness: 25, raspiness: 60  },
  { name: "Eminem",                           gender: "male", vocalFach: "tenor",         genre: "Rap/Hip-Hop",      timbreWeight: 75, airiness: 10, raspiness: 40  },
  { name: "Stevie Wonder",                    gender: "male", vocalFach: "tenor",         genre: "Jazz/Soul",        timbreWeight: 80, airiness: 15, raspiness: 20  },

  // RUSSIAN MEN (25)
  { name: "Григорий Лепс",                    gender: "male", vocalFach: "bass_baritone", genre: "Estrada/Chanson",  timbreWeight: 35, airiness: 10, raspiness: 95  },
  { name: "Михаил Круг",                      gender: "male", vocalFach: "bass_baritone", genre: "Estrada/Chanson",  timbreWeight: 25, airiness: 15, raspiness: 40  },
  { name: "Муслим Магомаев",                  gender: "male", vocalFach: "bass_baritone", genre: "Estrada/Chanson",  timbreWeight: 20, airiness: 5,  raspiness: 0   },
  { name: "Филипп Киркоров",                  gender: "male", vocalFach: "bass_baritone", genre: "Pop",              timbreWeight: 40, airiness: 10, raspiness: 5   },
  { name: "Леонид Агутин",                    gender: "male", vocalFach: "bass_baritone", genre: "Pop",              timbreWeight: 45, airiness: 30, raspiness: 35  },
  { name: "Баста",                            gender: "male", vocalFach: "bass_baritone", genre: "Rap/Hip-Hop",      timbreWeight: 30, airiness: 20, raspiness: 60  },
  { name: "Скриптонит",                       gender: "male", vocalFach: "bass_baritone", genre: "Rap/Hip-Hop",      timbreWeight: 25, airiness: 50, raspiness: 85  },
  { name: "Oxxxymiron",                       gender: "male", vocalFach: "bass_baritone", genre: "Rap/Hip-Hop",      timbreWeight: 40, airiness: 15, raspiness: 30  },
  { name: "Macan",                            gender: "male", vocalFach: "bass_baritone", genre: "Rap/Hip-Hop",      timbreWeight: 35, airiness: 40, raspiness: 20  },
  { name: "Михаил Горшенев (КиШ)",            gender: "male", vocalFach: "bass_baritone", genre: "Rock",             timbreWeight: 25, airiness: 5,  raspiness: 80  },
  { name: "Виктор Цой",                       gender: "male", vocalFach: "bass_baritone", genre: "Rock",             timbreWeight: 30, airiness: 10, raspiness: 15  },
  { name: "Вячеслав Бутусов",                 gender: "male", vocalFach: "bass_baritone", genre: "Rock",             timbreWeight: 28, airiness: 20, raspiness: 10  },
  { name: "Илья Лагутенко",                   gender: "male", vocalFach: "bass_baritone", genre: "Rock",             timbreWeight: 48, airiness: 60, raspiness: 20  },
  { name: "Дима Билан",                       gender: "male", vocalFach: "tenor",         genre: "Pop",              timbreWeight: 80, airiness: 35, raspiness: 15  },
  { name: "Сергей Лазарев",                   gender: "male", vocalFach: "tenor",         genre: "Pop",              timbreWeight: 85, airiness: 10, raspiness: 5   },
  { name: "Валерий Меладзе",                  gender: "male", vocalFach: "tenor",         genre: "Pop",              timbreWeight: 65, airiness: 15, raspiness: 25  },
  { name: "Николай Басков",                   gender: "male", vocalFach: "tenor",         genre: "Pop",              timbreWeight: 75, airiness: 5,  raspiness: 0   },
  { name: "Shaman",                           gender: "male", vocalFach: "tenor",         genre: "Pop",              timbreWeight: 82, airiness: 15, raspiness: 40  },
  { name: "Jony",                             gender: "male", vocalFach: "tenor",         genre: "Pop",              timbreWeight: 78, airiness: 50, raspiness: 10  },
  { name: "Niletto",                          gender: "male", vocalFach: "tenor",         genre: "Pop",              timbreWeight: 70, airiness: 40, raspiness: 5   },
  { name: "Владимир Пресняков",               gender: "male", vocalFach: "tenor",         genre: "Pop",              timbreWeight: 92, airiness: 30, raspiness: 10  },
  { name: "Сергей Жуков (Руки Вверх)",        gender: "male", vocalFach: "tenor",         genre: "Pop",              timbreWeight: 72, airiness: 10, raspiness: 0   },
  { name: "Miyagi",                           gender: "male", vocalFach: "tenor",         genre: "Rap/Hip-Hop",      timbreWeight: 68, airiness: 45, raspiness: 30  },
  { name: "Валерий Кипелов",                  gender: "male", vocalFach: "tenor",         genre: "Rock",             timbreWeight: 88, airiness: 5,  raspiness: 60  },
  { name: "Александр Градский",               gender: "male", vocalFach: "tenor",         genre: "Rock",             timbreWeight: 80, airiness: 5,  raspiness: 15  },

  // WESTERN WOMEN (25)
  { name: "Adele",                            gender: "female", vocalFach: "contralto",     genre: "Pop",              timbreWeight: 35, airiness: 20, raspiness: 10  },
  { name: "Dua Lipa",                         gender: "female", vocalFach: "contralto",     genre: "Pop",              timbreWeight: 45, airiness: 35, raspiness: 5   },
  { name: "Lana Del Rey",                     gender: "female", vocalFach: "contralto",     genre: "Pop",              timbreWeight: 25, airiness: 60, raspiness: 5   },
  { name: "Shakira",                          gender: "female", vocalFach: "contralto",     genre: "Pop",              timbreWeight: 50, airiness: 20, raspiness: 40  },
  { name: "Cher",                             gender: "female", vocalFach: "contralto",     genre: "Pop",              timbreWeight: 20, airiness: 5,  raspiness: 10  },
  { name: "Amy Winehouse",                    gender: "female", vocalFach: "contralto",     genre: "Jazz/Soul",        timbreWeight: 30, airiness: 15, raspiness: 45  },
  { name: "Ella Fitzgerald",                  gender: "female", vocalFach: "contralto",     genre: "Jazz/Soul",        timbreWeight: 35, airiness: 10, raspiness: 0   },
  { name: "Miley Cyrus",                      gender: "female", vocalFach: "contralto",     genre: "Rock",             timbreWeight: 40, airiness: 15, raspiness: 60  },
  { name: "Tina Turner",                      gender: "female", vocalFach: "contralto",     genre: "Rock",             timbreWeight: 35, airiness: 5,  raspiness: 85  },
  { name: "Billie Eilish",                    gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              timbreWeight: 85, airiness: 95, raspiness: 5   },
  { name: "Ariana Grande",                    gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              timbreWeight: 95, airiness: 40, raspiness: 0   },
  { name: "Beyonce",                          gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              timbreWeight: 75, airiness: 20, raspiness: 15  },
  { name: "Lady Gaga",                        gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              timbreWeight: 65, airiness: 15, raspiness: 25  },
  { name: "Taylor Swift",                     gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              timbreWeight: 70, airiness: 30, raspiness: 5   },
  { name: "Rihanna",                          gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              timbreWeight: 60, airiness: 25, raspiness: 15  },
  { name: "Katy Perry",                       gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              timbreWeight: 68, airiness: 15, raspiness: 5   },
  { name: "Sia",                              gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              timbreWeight: 78, airiness: 20, raspiness: 60  },
  { name: "Celine Dion",                      gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              timbreWeight: 82, airiness: 10, raspiness: 5   },
  { name: "Mariah Carey",                     gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              timbreWeight: 92, airiness: 30, raspiness: 0   },
  { name: "Whitney Houston",                  gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              timbreWeight: 88, airiness: 15, raspiness: 10  },
  { name: "Cardi B",                          gender: "female", vocalFach: "mezzo_soprano", genre: "Rap/Hip-Hop",      timbreWeight: 60, airiness: 5,  raspiness: 50  },
  { name: "Janis Joplin",                     gender: "female", vocalFach: "mezzo_soprano", genre: "Rock",             timbreWeight: 58, airiness: 5,  raspiness: 95  },
  { name: "Avril Lavigne",                    gender: "female", vocalFach: "mezzo_soprano", genre: "Rock",             timbreWeight: 82, airiness: 10, raspiness: 15  },
  { name: "Amy Lee (Evanescence)",            gender: "female", vocalFach: "mezzo_soprano", genre: "Rock",             timbreWeight: 75, airiness: 20, raspiness: 10  },
  { name: "Aretha Franklin",                  gender: "female", vocalFach: "mezzo_soprano", genre: "Jazz/Soul",        timbreWeight: 70, airiness: 10, raspiness: 20  },

  // RUSSIAN WOMEN (25)
  { name: "Zivert",                           gender: "female", vocalFach: "contralto",     genre: "Pop",              timbreWeight: 48, airiness: 35, raspiness: 10  },
  { name: "Слава",                            gender: "female", vocalFach: "contralto",     genre: "Pop",              timbreWeight: 32, airiness: 10, raspiness: 30  },
  { name: "Лобода",                           gender: "female", vocalFach: "contralto",     genre: "Pop",              timbreWeight: 45, airiness: 25, raspiness: 20  },
  { name: "Земфира",                          gender: "female", vocalFach: "contralto",     genre: "Rock",             timbreWeight: 40, airiness: 30, raspiness: 15  },
  { name: "Диана Арбенина",                   gender: "female", vocalFach: "contralto",     genre: "Rock",             timbreWeight: 30, airiness: 10, raspiness: 40  },
  { name: "Лолита",                           gender: "female", vocalFach: "contralto",     genre: "Estrada/Chanson",  timbreWeight: 25, airiness: 15, raspiness: 35  },
  { name: "Алла Пугачева",                    gender: "female", vocalFach: "contralto",     genre: "Estrada/Chanson",  timbreWeight: 35, airiness: 20, raspiness: 45  },
  { name: "Ирина Аллегрова",                  gender: "female", vocalFach: "contralto",     genre: "Estrada/Chanson",  timbreWeight: 38, airiness: 10, raspiness: 60  },
  { name: "Любовь Успенская",                 gender: "female", vocalFach: "contralto",     genre: "Estrada/Chanson",  timbreWeight: 28, airiness: 25, raspiness: 50  },
  { name: "Надежда Кадышева",                 gender: "female", vocalFach: "contralto",     genre: "Estrada/Chanson",  timbreWeight: 40, airiness: 5,  raspiness: 0   },
  { name: "Полина Гагарина",                  gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              timbreWeight: 80, airiness: 15, raspiness: 25  },
  { name: "Anna Asti",                        gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              timbreWeight: 58, airiness: 40, raspiness: 35  },
  { name: "Монеточка",                        gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              timbreWeight: 100,airiness: 50, raspiness: 0   },
  { name: "Клава Кока",                       gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              timbreWeight: 93, airiness: 45, raspiness: 5   },
  { name: "Нюша",                             gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              timbreWeight: 89, airiness: 35, raspiness: 0   },
  { name: "МакSим",                           gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              timbreWeight: 87, airiness: 55, raspiness: 0   },
  { name: "Мари Краймбрери",                  gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              timbreWeight: 75, airiness: 30, raspiness: 15  },
  { name: "Дора",                             gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              timbreWeight: 90, airiness: 40, raspiness: 0   },
  { name: "Ёлка",                             gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              timbreWeight: 72, airiness: 25, raspiness: 10  },
  { name: "Валерия",                          gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              timbreWeight: 76, airiness: 10, raspiness: 0   },
  { name: "Темникова",                        gender: "female", vocalFach: "mezzo_soprano", genre: "Pop",              timbreWeight: 66, airiness: 60, raspiness: 5   },
  { name: "Бьянка",                           gender: "female", vocalFach: "mezzo_soprano", genre: "Rap/Hip-Hop",      timbreWeight: 70, airiness: 15, raspiness: 20  },
  { name: "Инстасамка",                       gender: "female", vocalFach: "mezzo_soprano", genre: "Rap/Hip-Hop",      timbreWeight: 65, airiness: 30, raspiness: 25  },
  { name: "Пелагея",                          gender: "female", vocalFach: "mezzo_soprano", genre: "Rock",             timbreWeight: 78, airiness: 10, raspiness: 0   },
  { name: "Лариса Долина",                    gender: "female", vocalFach: "mezzo_soprano", genre: "Jazz/Soul",        timbreWeight: 75, airiness: 10, raspiness: 15  },
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
  if (CELEBRITIES_DB.length !== 100) {
    throw new Error(`celebritiesDB: expected 100 entries, got ${CELEBRITIES_DB.length}`);
  }
  for (const c of CELEBRITIES_DB) {
    const allowed = c.gender === "male" ? MALE_FACHES : FEMALE_FACHES;
    if (!allowed.includes(c.vocalFach)) {
      throw new Error(`celebritiesDB: ${c.name} has fach ${c.vocalFach} incompatible with gender ${c.gender}`);
    }
    assertAxis(c.name, "timbreWeight", c.timbreWeight);
    assertAxis(c.name, "airiness", c.airiness);
    assertAxis(c.name, "raspiness", c.raspiness);
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
  /** Euclidean 3-D distance in the 0-100 cube. Smaller = better match. */
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
 * Distance → display percentage. Linear, strictly monotonic:
 *   percent = round(100 × (1 − clamp(d, 0, dMax) / dMax))
 * so d = 0 → 100%, d = dMax ≈ 173.2 → 0%. Fully deterministic.
 */
export function distanceToPercent(distance: number): number {
  const clamped = Math.max(0, Math.min(MAX_3D_DISTANCE, distance));
  return Math.round(100 * (1 - clamped / MAX_3D_DISTANCE));
}

/** STRICT filter: only profiles whose gender AND vocalFach both match. */
export function filterCelebrities(
  gender: CelebrityGender,
  fach: VocalFach
): CelebrityProfile[] {
  return CELEBRITIES_DB.filter((c) => c.gender === gender && c.vocalFach === fach);
}

/**
 * Rank an already-filtered pool by 3-D Euclidean distance, ascending
 * (ties broken by `id` so the order is stable and reproducible).
 */
export function rankCelebrities(
  pool: CelebrityProfile[],
  user: TimbreVector
): CelebrityMatch[] {
  return pool
    .map((celebrity) => {
      const distance = euclideanDistance3D(user, celebrity);
      return { celebrity, distance, percent: distanceToPercent(distance) };
    })
    .sort((a, b) =>
      a.distance === b.distance
        ? a.celebrity.id.localeCompare(b.celebrity.id)
        : a.distance - b.distance
    );
}

/**
 * The one and only matcher: STRICT (gender × vocalFach) filter, then 3-D
 * Euclidean rank. No fallback pool — a bass cannot surface a tenor.
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

/** Alias of `groupMatchesByGenre` — top-N per genre (5 if enough, else all). */
export const topMatchesPerGenre = groupMatchesByGenre;
