/**
 * Reference database of well-known singers for the Voice Celebrity Match
 * (gender + timbre weight / airiness / raspiness / tessitura span).
 *
 * PIPELINE:
 *   1. Student picks gender → pool = that gender only (opposite excluded).
 *   2. Record → offline feature extract (meyda + YIN) after the take.
 *   3. Measure axes on the same 0–100 scale the stars are authored on.
 *   4. Required 60/20/20 weighted 3-D distance + soft fach distance prior.
 *   5. Reject raw garbage, then globally recalibrate the eligible cohort.
 *   6. UI: region tabs (Российские / Зарубежные) → decade × genre top-5.
 *      Opposite gender never appears; empty DB never shown.
 *
 * Axes:
 *   1. `vocalFach`      — display / soft prior from median F0 (not a hard filter).
 *   2. `timbreWeight`   — 0 dark/heavy … 100 bright/ringing (spectral centroid).
 *   3. `airiness`       — 0 dense … 100 airy (zero-crossing rate).
 *   4. `raspiness`      — 0 clean … 100 rasp/split (spectral flatness).
 *   5. `tessituraSpan`  — 0 narrow hook … 100 very wide working range.
 *   6. `region`         — russian | western.
 *   7. `decade`         — 1990s | 2000s | 2010s | 2020s (UI era buckets).
 *   8. `genre`          — Pop | Rock (эстрада/шансон/pop-rap live in Pop).
 *
 * DATA QUALITY: per-artist numbers are curated from well-known public
 * descriptions (voice type, typical range, dark/bright, belt vs head, grit).
 * They are not laboratory measurements — there is no licensed reference-audio
 * corpus in this project. `tessituraSpan` is an estimate of how wide the
 * singer typically works, not a measured IQR.
 */

export type CelebrityGender = "male" | "female";

export type CelebrityRegion = "russian" | "western";

export type CelebrityDecade = "1990s" | "2000s" | "2010s" | "2020s";

export type Genre = "Pop" | "Rock";

/** @deprecated Use `Genre`. Kept so older imports keep compiling. */
export type CelebrityGenre = Genre;

export const CELEBRITY_GENRES: Genre[] = ["Pop", "Rock"];

export const CELEBRITY_REGIONS: CelebrityRegion[] = ["russian", "western"];

export const CELEBRITY_DECADES: CelebrityDecade[] = [
  "1990s",
  "2000s",
  "2010s",
  "2020s",
];

export const REGION_LABEL_RU: Record<CelebrityRegion, string> = {
  russian: "Российские",
  western: "Зарубежные",
};

export const DECADE_LABEL_RU: Record<CelebrityDecade, string> = {
  "1990s": "90-е",
  "2000s": "2000-е",
  "2010s": "2010-е",
  "2020s": "2020-е",
};

export const GENRE_LABEL_RU: Record<Genre, string> = {
  Pop: "Поп",
  Rock: "Рок",
};

/** Displayed eligible candidates are recalibrated to at least 70%. */
export const MIN_DISPLAY_PERCENT = 60;

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
  decade: CelebrityDecade;
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

/** Required 3-D weighted-Euclidean coefficients; they sum to exactly 1. */
export const AXIS_WEIGHTS = {
  timbreWeight: 0.6,
  airiness: 0.2,
  raspiness: 0.2,
} as const;

/**
 * Separate soft fach prior in distance points. The current enum has only two
 * fach values per gender, so there is one mismatch severity (no honest
 * adjacent/extreme distinction is representable). It is noticeable but never
 * a hard block.
 */
export const FACH_MISMATCH_PENALTY = 12;

/** Theoretical max of sqrt(.6*dT² + .2*dA² + .2*dR²). */
export const MAX_WEIGHTED_DISTANCE = 100;

// prettier-ignore
const RAW_ENTRIES: RawEntry[] = [
  // ─── Российские женские 90-х — поп ───
  { name: "Алла Пугачева"                        , gender: "female", vocalFach: "contralto"    , genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 35 , airiness: 20 , raspiness: 45 , tessituraSpan: 72  },
  { name: "София Ротару"                         , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 80 , airiness: 18 , raspiness: 8  , tessituraSpan: 72  },
  { name: "Ирина Аллегрова"                      , gender: "female", vocalFach: "contralto"    , genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 38 , airiness: 10 , raspiness: 60 , tessituraSpan: 48  },
  { name: "Наталья Ветлицкая"                    , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 86 , airiness: 20 , raspiness: 8  , tessituraSpan: 46  },
  { name: "Татьяна Буланова"                     , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 83 , airiness: 30 , raspiness: 4  , tessituraSpan: 45  },
  { name: "Наташа Королёва"                      , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 82 , airiness: 32 , raspiness: 8  , tessituraSpan: 46  },
  { name: "Кристина Орбакайте"                   , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 78 , airiness: 23 , raspiness: 10 , tessituraSpan: 48  },
  { name: "Анжелика Варум"                       , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 84 , airiness: 24 , raspiness: 7  , tessituraSpan: 46  },
  { name: "Алёна Апина"                          , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 85 , airiness: 33 , raspiness: 5  , tessituraSpan: 54  },
  { name: "Татьяна Овсиенко"                     , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 79 , airiness: 30 , raspiness: 11 , tessituraSpan: 50  },
  { name: "Ирина Салтыкова"                      , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 77 , airiness: 25 , raspiness: 4  , tessituraSpan: 45  },
  { name: "Маша Распутина"                       , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 85 , airiness: 23 , raspiness: 5  , tessituraSpan: 51  },
  { name: "Лада Дэнс"                            , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 80 , airiness: 23 , raspiness: 1  , tessituraSpan: 45  },
  { name: "Азиза"                                , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 83 , airiness: 33 , raspiness: 6  , tessituraSpan: 47  },
  { name: "Лайма Вайкуле"                        , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 83 , airiness: 24 , raspiness: 3  , tessituraSpan: 49  },
  { name: "Лариса Долина"                        , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 75 , airiness: 10 , raspiness: 15 , tessituraSpan: 76  },
  { name: "Любовь Успенская"                     , gender: "female", vocalFach: "contralto"    , genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 28 , airiness: 25 , raspiness: 50 , tessituraSpan: 42  },
  { name: "Надежда Кадышева"                     , gender: "female", vocalFach: "contralto"    , genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 40 , airiness: 5  , raspiness: 0  , tessituraSpan: 55  },
  { name: "Наталья Сенчукова"                    , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 82 , airiness: 27 , raspiness: 2  , tessituraSpan: 48  },
  { name: "Лариса Черникова"                     , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 86 , airiness: 33 , raspiness: 5  , tessituraSpan: 52  },
  { name: "Лика Стар"                            , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 83 , airiness: 28 , raspiness: 4  , tessituraSpan: 52  },
  { name: "Каролина"                             , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 79 , airiness: 30 , raspiness: 4  , tessituraSpan: 54  },
  { name: "Анне Вески"                           , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 79 , airiness: 25 , raspiness: 5  , tessituraSpan: 49  },
  { name: "Ирина Шведова"                        , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 81 , airiness: 30 , raspiness: 8  , tessituraSpan: 53  },
  { name: "Светлана Разина"                      , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 80 , airiness: 30 , raspiness: 6  , tessituraSpan: 55  },
  { name: "Тамара Гвердцители"                   , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 82 , airiness: 25 , raspiness: 4  , tessituraSpan: 46  },
  // ─── Российские женские 90-х — рок ───
  { name: "Жанна Агузарова"                      , gender: "female", vocalFach: "contralto"    , genre: "Rock", region: "russian", decade: "1990s", timbreWeight: 44 , airiness: 26 , raspiness: 32 , tessituraSpan: 50  },
  { name: "Настя Полева"                         , gender: "female", vocalFach: "contralto"    , genre: "Rock", region: "russian", decade: "1990s", timbreWeight: 30 , airiness: 24 , raspiness: 20 , tessituraSpan: 46  },
  { name: "Линда"                                , gender: "female", vocalFach: "contralto"    , genre: "Rock", region: "russian", decade: "1990s", timbreWeight: 32 , airiness: 52 , raspiness: 22 , tessituraSpan: 44  },
  { name: "Янка Дягилева"                        , gender: "female", vocalFach: "contralto"    , genre: "Rock", region: "russian", decade: "1990s", timbreWeight: 26 , airiness: 14 , raspiness: 60 , tessituraSpan: 34  },
  { name: "Маша Макарова"                        , gender: "female", vocalFach: "contralto"    , genre: "Rock", region: "russian", decade: "1990s", timbreWeight: 41 , airiness: 12 , raspiness: 24 , tessituraSpan: 45  },
  { name: "Ольга Арефьева"                       , gender: "female", vocalFach: "contralto"    , genre: "Rock", region: "russian", decade: "1990s", timbreWeight: 33 , airiness: 18 , raspiness: 33 , tessituraSpan: 40  },
  { name: "Ольга Кормухина"                      , gender: "female", vocalFach: "contralto"    , genre: "Rock", region: "russian", decade: "1990s", timbreWeight: 36 , airiness: 14 , raspiness: 23 , tessituraSpan: 43  },
  { name: "Инна Желанная"                        , gender: "female", vocalFach: "contralto"    , genre: "Rock", region: "russian", decade: "1990s", timbreWeight: 39 , airiness: 12 , raspiness: 28 , tessituraSpan: 46  },
  // ─── Российские женские 2000-х — поп ───
  { name: "Валерия"                              , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 76 , airiness: 10 , raspiness: 2  , tessituraSpan: 54  },
  { name: "Алсу"                                 , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 82 , airiness: 18 , raspiness: 4  , tessituraSpan: 62  },
  { name: "МакSим"                               , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 78 , airiness: 62 , raspiness: 0  , tessituraSpan: 42  },
  { name: "Ани Лорак"                            , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 85 , airiness: 16 , raspiness: 14 , tessituraSpan: 70  },
  { name: "Глюкоза"                              , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 78 , airiness: 25 , raspiness: 11 , tessituraSpan: 54  },
  { name: "Юлия Савичева"                        , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 86 , airiness: 30 , raspiness: 2  , tessituraSpan: 47  },
  { name: "Виктория Дайнеко"                     , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 78 , airiness: 27 , raspiness: 3  , tessituraSpan: 55  },
  { name: "Жанна Фриске"                         , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 79 , airiness: 30 , raspiness: 9  , tessituraSpan: 46  },
  { name: "Катя Лель"                            , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 85 , airiness: 25 , raspiness: 7  , tessituraSpan: 45  },
  { name: "Юлия Началова"                        , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 85 , airiness: 29 , raspiness: 11 , tessituraSpan: 45  },
  { name: "Ирина Дубцова"                        , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 77 , airiness: 23 , raspiness: 3  , tessituraSpan: 51  },
  { name: "Лолита"                               , gender: "female", vocalFach: "contralto"    , genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 25 , airiness: 15 , raspiness: 35 , tessituraSpan: 38  },
  { name: "Слава"                                , gender: "female", vocalFach: "contralto"    , genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 32 , airiness: 10 , raspiness: 32 , tessituraSpan: 40  },
  { name: "Зара"                                 , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 80 , airiness: 24 , raspiness: 6  , tessituraSpan: 50  },
  { name: "Анита Цой"                            , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 82 , airiness: 30 , raspiness: 9  , tessituraSpan: 46  },
  { name: "Согдиана"                             , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 86 , airiness: 30 , raspiness: 1  , tessituraSpan: 54  },
  { name: "Елена Терлеева"                       , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 77 , airiness: 25 , raspiness: 5  , tessituraSpan: 51  },
  { name: "Анна Семенович"                       , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 86 , airiness: 31 , raspiness: 7  , tessituraSpan: 45  },
  { name: "Тина Кароль"                          , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 84 , airiness: 28 , raspiness: 3  , tessituraSpan: 51  },
  { name: "Елена Ваенга"                         , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 82 , airiness: 26 , raspiness: 6  , tessituraSpan: 46  },
  { name: "Ева Польна"                           , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 86 , airiness: 24 , raspiness: 5  , tessituraSpan: 52  },
  { name: "Лена Катина (t.A.T.u.)"               , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 81 , airiness: 26 , raspiness: 3  , tessituraSpan: 47  },
  { name: "Юля Волкова (t.A.T.u.)"               , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 84 , airiness: 26 , raspiness: 8  , tessituraSpan: 53  },
  { name: "Надежда Грановская"                   , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 79 , airiness: 29 , raspiness: 11 , tessituraSpan: 47  },
  { name: "Альбина Джанабаева"                   , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 87 , airiness: 27 , raspiness: 7  , tessituraSpan: 47  },
  { name: "Марина Хлебникова"                    , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 78 , airiness: 24 , raspiness: 8  , tessituraSpan: 45  },
  { name: "Жасмин"                               , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 81 , airiness: 30 , raspiness: 10 , tessituraSpan: 54  },
  { name: "Бьянка"                               , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 70 , airiness: 15 , raspiness: 20 , tessituraSpan: 34  },
  { name: "Юта"                                  , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 86 , airiness: 32 , raspiness: 9  , tessituraSpan: 53  },
  { name: "Ирина Билык"                          , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 81 , airiness: 27 , raspiness: 11 , tessituraSpan: 52  },
  // ─── Российские женские 2000-х — рок ───
  { name: "Земфира"                              , gender: "female", vocalFach: "contralto"    , genre: "Rock", region: "russian", decade: "2000s", timbreWeight: 40 , airiness: 30 , raspiness: 16 , tessituraSpan: 42  },
  { name: "Диана Арбенина"                       , gender: "female", vocalFach: "contralto"    , genre: "Rock", region: "russian", decade: "2000s", timbreWeight: 28 , airiness: 10 , raspiness: 44 , tessituraSpan: 40  },
  { name: "Светлана Сурганова"                   , gender: "female", vocalFach: "contralto"    , genre: "Rock", region: "russian", decade: "2000s", timbreWeight: 34 , airiness: 18 , raspiness: 24 , tessituraSpan: 44  },
  { name: "Юлия Чичерина"                        , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "russian", decade: "2000s", timbreWeight: 68 , airiness: 18 , raspiness: 38 , tessituraSpan: 50  },
  { name: "Пелагея"                              , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "russian", decade: "2000s", timbreWeight: 78 , airiness: 10 , raspiness: 2  , tessituraSpan: 82  },
  { name: "Мара"                                 , gender: "female", vocalFach: "contralto"    , genre: "Rock", region: "russian", decade: "2000s", timbreWeight: 40 , airiness: 13 , raspiness: 30 , tessituraSpan: 42  },
  { name: "Хелависа (Мельница)"                  , gender: "female", vocalFach: "contralto"    , genre: "Rock", region: "russian", decade: "2000s", timbreWeight: 39 , airiness: 17 , raspiness: 33 , tessituraSpan: 44  },
  { name: "Дария Ставрович (Слот)"               , gender: "female", vocalFach: "contralto"    , genre: "Rock", region: "russian", decade: "2000s", timbreWeight: 32 , airiness: 20 , raspiness: 33 , tessituraSpan: 48  },
  { name: "Юлия Коган"                           , gender: "female", vocalFach: "contralto"    , genre: "Rock", region: "russian", decade: "2000s", timbreWeight: 35 , airiness: 11 , raspiness: 23 , tessituraSpan: 48  },
  { name: "Татьяна Зыкина"                       , gender: "female", vocalFach: "contralto"    , genre: "Rock", region: "russian", decade: "2000s", timbreWeight: 41 , airiness: 17 , raspiness: 24 , tessituraSpan: 39  },
  { name: "Ирина Богушевская"                    , gender: "female", vocalFach: "contralto"    , genre: "Rock", region: "russian", decade: "2000s", timbreWeight: 31 , airiness: 11 , raspiness: 32 , tessituraSpan: 43  },
  // ─── Российские женские 2010-х — поп ───
  { name: "Полина Гагарина"                      , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2010s", timbreWeight: 80 , airiness: 14 , raspiness: 26 , tessituraSpan: 78  },
  { name: "Нюша"                                 , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2010s", timbreWeight: 84 , airiness: 30 , raspiness: 2  , tessituraSpan: 50  },
  { name: "Ёлка"                                 , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2010s", timbreWeight: 70 , airiness: 24 , raspiness: 12 , tessituraSpan: 48  },
  { name: "Лобода"                               , gender: "female", vocalFach: "contralto"    , genre: "Pop" , region: "russian", decade: "2010s", timbreWeight: 46 , airiness: 24 , raspiness: 22 , tessituraSpan: 52  },
  { name: "Темникова"                            , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2010s", timbreWeight: 64 , airiness: 66 , raspiness: 6  , tessituraSpan: 40  },
  { name: "IOWA"                                 , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2010s", timbreWeight: 77 , airiness: 20 , raspiness: 20 , tessituraSpan: 56  },
  { name: "Ханна"                                , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2010s", timbreWeight: 89 , airiness: 44 , raspiness: 6  , tessituraSpan: 38  },
  { name: "Zivert"                               , gender: "female", vocalFach: "contralto"    , genre: "Pop" , region: "russian", decade: "2010s", timbreWeight: 48 , airiness: 36 , raspiness: 10 , tessituraSpan: 44  },
  { name: "Монеточка"                            , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2010s", timbreWeight: 98 , airiness: 48 , raspiness: 0  , tessituraSpan: 36  },
  { name: "Вера Брежнева"                        , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2010s", timbreWeight: 80 , airiness: 27 , raspiness: 9  , tessituraSpan: 54  },
  { name: "Настя Каменских"                      , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2010s", timbreWeight: 82 , airiness: 28 , raspiness: 11 , tessituraSpan: 54  },
  { name: "Ольга Бузова"                         , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2010s", timbreWeight: 81 , airiness: 30 , raspiness: 9  , tessituraSpan: 51  },
  { name: "Ольга Серябкина"                      , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2010s", timbreWeight: 77 , airiness: 28 , raspiness: 2  , tessituraSpan: 52  },
  { name: "Юлианна Караулова"                    , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2010s", timbreWeight: 81 , airiness: 32 , raspiness: 8  , tessituraSpan: 53  },
  { name: "Сати Казанова"                        , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2010s", timbreWeight: 85 , airiness: 24 , raspiness: 8  , tessituraSpan: 53  },
  { name: "Юлия Ковальчук"                       , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2010s", timbreWeight: 85 , airiness: 25 , raspiness: 4  , tessituraSpan: 51  },
  { name: "Надя Дорофеева"                       , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2010s", timbreWeight: 82 , airiness: 30 , raspiness: 3  , tessituraSpan: 47  },
  { name: "Анна Седокова"                        , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2010s", timbreWeight: 77 , airiness: 27 , raspiness: 3  , tessituraSpan: 49  },
  { name: "Полина Фаворская"                     , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2010s", timbreWeight: 82 , airiness: 32 , raspiness: 2  , tessituraSpan: 51  },
  { name: "Елена Максимова"                      , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2010s", timbreWeight: 85 , airiness: 23 , raspiness: 10 , tessituraSpan: 49  },
  { name: "Диана Гурцкая"                        , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2010s", timbreWeight: 81 , airiness: 30 , raspiness: 3  , tessituraSpan: 53  },
  { name: "Наргиз"                               , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2010s", timbreWeight: 84 , airiness: 26 , raspiness: 11 , tessituraSpan: 46  },
  { name: "Кристина Си"                          , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2010s", timbreWeight: 80 , airiness: 32 , raspiness: 9  , tessituraSpan: 51  },
  { name: "Маша Вебер"                           , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2010s", timbreWeight: 78 , airiness: 23 , raspiness: 8  , tessituraSpan: 46  },
  // ─── Российские женские 2010-х — рок ───
  { name: "Юлия Санина"                          , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "russian", decade: "2010s", timbreWeight: 80 , airiness: 14 , raspiness: 42 , tessituraSpan: 74  },
  { name: "Моя Мишель"                           , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "russian", decade: "2010s", timbreWeight: 86 , airiness: 46 , raspiness: 8  , tessituraSpan: 40  },
  { name: "Лусинэ Геворкян (Louna)"              , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "russian", decade: "2010s", timbreWeight: 62 , airiness: 10 , raspiness: 72 , tessituraSpan: 66  },
  { name: "Анастасия Креслина (IC3PEAK)"         , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "russian", decade: "2010s", timbreWeight: 85 , airiness: 18 , raspiness: 30 , tessituraSpan: 69  },
  { name: "Айгель Гайсина (АИГЕЛ)"               , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "russian", decade: "2010s", timbreWeight: 78 , airiness: 11 , raspiness: 31 , tessituraSpan: 77  },
  { name: "Даша Чаруша"                          , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "russian", decade: "2010s", timbreWeight: 78 , airiness: 11 , raspiness: 27 , tessituraSpan: 67  },
  { name: "Софья Сомусева (Кис-кис)"             , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "russian", decade: "2010s", timbreWeight: 78 , airiness: 13 , raspiness: 32 , tessituraSpan: 77  },
  { name: "Ольга Пулатова (Flëur)"               , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "russian", decade: "2010s", timbreWeight: 79 , airiness: 11 , raspiness: 26 , tessituraSpan: 67  },
  // ─── Российские женские 2020-х — поп ───
  { name: "Anna Asti"                            , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2020s", timbreWeight: 56 , airiness: 40 , raspiness: 36 , tessituraSpan: 52  },
  { name: "Клава Кока"                           , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2020s", timbreWeight: 92 , airiness: 38 , raspiness: 8  , tessituraSpan: 44  },
  { name: "Дора"                                 , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2020s", timbreWeight: 90 , airiness: 50 , raspiness: 4  , tessituraSpan: 38  },
  { name: "Люся Чеботина"                        , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2020s", timbreWeight: 88 , airiness: 36 , raspiness: 8  , tessituraSpan: 40  },
  { name: "Мари Краймбрери"                      , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2020s", timbreWeight: 74 , airiness: 28 , raspiness: 16 , tessituraSpan: 46  },
  { name: "Инстасамка"                           , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2020s", timbreWeight: 65 , airiness: 30 , raspiness: 25 , tessituraSpan: 26  },
  { name: "Татьяна Куртукова"                    , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2020s", timbreWeight: 82 , airiness: 25 , raspiness: 10 , tessituraSpan: 48  },
  { name: "Mia Boyka"                            , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2020s", timbreWeight: 81 , airiness: 28 , raspiness: 4  , tessituraSpan: 51  },
  { name: "Валя Карнавал"                        , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2020s", timbreWeight: 83 , airiness: 33 , raspiness: 5  , tessituraSpan: 48  },
  { name: "Анет Сай"                             , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2020s", timbreWeight: 85 , airiness: 33 , raspiness: 10 , tessituraSpan: 52  },
  { name: "Guma"                                 , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2020s", timbreWeight: 80 , airiness: 27 , raspiness: 8  , tessituraSpan: 53  },
  { name: "Mona"                                 , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2020s", timbreWeight: 80 , airiness: 28 , raspiness: 4  , tessituraSpan: 47  },
  { name: "Асия"                                 , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2020s", timbreWeight: 78 , airiness: 23 , raspiness: 3  , tessituraSpan: 47  },
  { name: "Seville"                              , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2020s", timbreWeight: 80 , airiness: 25 , raspiness: 8  , tessituraSpan: 52  },
  { name: "Мари Сенн"                            , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2020s", timbreWeight: 86 , airiness: 30 , raspiness: 4  , tessituraSpan: 54  },
  { name: "Маша Шейх"                            , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2020s", timbreWeight: 79 , airiness: 23 , raspiness: 5  , tessituraSpan: 54  },
  { name: "Аня Pokrov"                           , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2020s", timbreWeight: 83 , airiness: 24 , raspiness: 5  , tessituraSpan: 50  },
  { name: "Катя Адушкина"                        , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "russian", decade: "2020s", timbreWeight: 82 , airiness: 28 , raspiness: 5  , tessituraSpan: 46  },
  // ─── Российские женские 2020-х — рок ───
  { name: "Алёна Швец"                           , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "russian", decade: "2020s", timbreWeight: 77 , airiness: 36 , raspiness: 16 , tessituraSpan: 47  },
  // ─── Российские мужские 90-х — поп ───
  { name: "Филипп Киркоров"                      , gender: "male"  , vocalFach: "bass_baritone", genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 42 , airiness: 12 , raspiness: 8  , tessituraSpan: 55  },
  { name: "Леонид Агутин"                        , gender: "male"  , vocalFach: "bass_baritone", genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 46 , airiness: 32 , raspiness: 36 , tessituraSpan: 48  },
  { name: "Владимир Пресняков"                   , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 92 , airiness: 28 , raspiness: 12 , tessituraSpan: 72  },
  { name: "Андрей Губин"                         , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 69 , airiness: 32 , raspiness: 10 , tessituraSpan: 52  },
  { name: "Дмитрий Маликов"                      , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 71 , airiness: 26 , raspiness: 8  , tessituraSpan: 49  },
  { name: "Юрий Шатунов"                         , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 69 , airiness: 30 , raspiness: 16 , tessituraSpan: 48  },
  { name: "Валерий Леонтьев"                     , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 75 , airiness: 34 , raspiness: 7  , tessituraSpan: 43  },
  { name: "Александр Серов"                      , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 70 , airiness: 34 , raspiness: 9  , tessituraSpan: 51  },
  { name: "Игорь Николаев"                       , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 71 , airiness: 31 , raspiness: 15 , tessituraSpan: 47  },
  { name: "Влад Сташевский"                      , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 69 , airiness: 31 , raspiness: 14 , tessituraSpan: 51  },
  { name: "Богдан Титомир"                       , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 66 , airiness: 32 , raspiness: 9  , tessituraSpan: 51  },
  { name: "Евгений Осин"                         , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 66 , airiness: 28 , raspiness: 9  , tessituraSpan: 47  },
  { name: "Сергей Пенкин"                        , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 67 , airiness: 27 , raspiness: 11 , tessituraSpan: 44  },
  { name: "Олег Газманов"                        , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 67 , airiness: 30 , raspiness: 14 , tessituraSpan: 51  },
  { name: "Александр Буйнов"                     , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 66 , airiness: 27 , raspiness: 12 , tessituraSpan: 44  },
  { name: "Михаил Шуфутинский"                   , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 73 , airiness: 33 , raspiness: 17 , tessituraSpan: 44  },
  { name: "Михаил Круг"                          , gender: "male"  , vocalFach: "bass_baritone", genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 25 , airiness: 15 , raspiness: 40 , tessituraSpan: 32  },
  { name: "Мурат Насыров"                        , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 67 , airiness: 26 , raspiness: 16 , tessituraSpan: 51  },
  { name: "Андрей Державин"                      , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 67 , airiness: 34 , raspiness: 17 , tessituraSpan: 51  },
  { name: "Валерий Сюткин"                       , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 73 , airiness: 29 , raspiness: 11 , tessituraSpan: 50  },
  { name: "Алексей Глызин"                       , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 67 , airiness: 29 , raspiness: 10 , tessituraSpan: 53  },
  { name: "Сосо Павлиашвили"                     , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 71 , airiness: 26 , raspiness: 13 , tessituraSpan: 50  },
  { name: "Муслим Магомаев"                      , gender: "male"  , vocalFach: "bass_baritone", genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 20 , airiness: 5  , raspiness: 0  , tessituraSpan: 78  },
  { name: "Александр Малинин"                    , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 71 , airiness: 29 , raspiness: 14 , tessituraSpan: 46  },
  { name: "Кирилл Андреев (Иванушки)"            , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 72 , airiness: 30 , raspiness: 11 , tessituraSpan: 47  },
  { name: "Батырхан Шукенов (А-Студио)"          , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 73 , airiness: 25 , raspiness: 11 , tessituraSpan: 50  },
  { name: "Игорь Тальков"                        , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 74 , airiness: 33 , raspiness: 14 , tessituraSpan: 50  },
  { name: "Юрий Антонов"                         , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 70 , airiness: 26 , raspiness: 14 , tessituraSpan: 51  },
  { name: "Лев Лещенко"                          , gender: "male"  , vocalFach: "bass_baritone", genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 74 , airiness: 25 , raspiness: 15 , tessituraSpan: 43  },
  { name: "Иосиф Кобзон"                         , gender: "male"  , vocalFach: "bass_baritone", genre: "Pop" , region: "russian", decade: "1990s", timbreWeight: 73 , airiness: 25 , raspiness: 9  , tessituraSpan: 53  },
  // ─── Российские мужские 90-х — рок ───
  { name: "Виктор Цой"                           , gender: "male"  , vocalFach: "bass_baritone", genre: "Rock", region: "russian", decade: "1990s", timbreWeight: 32 , airiness: 12 , raspiness: 16 , tessituraSpan: 28  },
  { name: "Вячеслав Бутусов"                     , gender: "male"  , vocalFach: "bass_baritone", genre: "Rock", region: "russian", decade: "1990s", timbreWeight: 28 , airiness: 22 , raspiness: 12 , tessituraSpan: 36  },
  { name: "Юрий Шевчук"                          , gender: "male"  , vocalFach: "bass_baritone", genre: "Rock", region: "russian", decade: "1990s", timbreWeight: 30 , airiness: 14 , raspiness: 38 , tessituraSpan: 42  },
  { name: "Константин Кинчев"                    , gender: "male"  , vocalFach: "bass_baritone", genre: "Rock", region: "russian", decade: "1990s", timbreWeight: 22 , airiness: 8  , raspiness: 58 , tessituraSpan: 38  },
  { name: "Борис Гребенщиков"                    , gender: "male"  , vocalFach: "bass_baritone", genre: "Rock", region: "russian", decade: "1990s", timbreWeight: 36 , airiness: 26 , raspiness: 10 , tessituraSpan: 44  },
  { name: "Владимир Шахрин"                      , gender: "male"  , vocalFach: "bass_baritone", genre: "Rock", region: "russian", decade: "1990s", timbreWeight: 34 , airiness: 12 , raspiness: 32 , tessituraSpan: 40  },
  { name: "Илья Лагутенко"                       , gender: "male"  , vocalFach: "bass_baritone", genre: "Rock", region: "russian", decade: "1990s", timbreWeight: 50 , airiness: 62 , raspiness: 22 , tessituraSpan: 40  },
  { name: "Валерий Кипелов"                      , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "russian", decade: "1990s", timbreWeight: 88 , airiness: 6  , raspiness: 62 , tessituraSpan: 84  },
  { name: "Александр Градский"                   , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "russian", decade: "1990s", timbreWeight: 80 , airiness: 5  , raspiness: 18 , tessituraSpan: 90  },
  { name: "Глеб Самойлов"                        , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "russian", decade: "1990s", timbreWeight: 56 , airiness: 20 , raspiness: 28 , tessituraSpan: 50  },
  { name: "Найк Борзов"                          , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "russian", decade: "1990s", timbreWeight: 52 , airiness: 42 , raspiness: 16 , tessituraSpan: 44  },
  { name: "Юрий Клинских (Хой)"                  , gender: "male"  , vocalFach: "bass_baritone", genre: "Rock", region: "russian", decade: "1990s", timbreWeight: 26 , airiness: 18 , raspiness: 24 , tessituraSpan: 43  },
  { name: "Егор Летов"                           , gender: "male"  , vocalFach: "bass_baritone", genre: "Rock", region: "russian", decade: "1990s", timbreWeight: 27 , airiness: 19 , raspiness: 23 , tessituraSpan: 38  },
  { name: "Гарик Сукачёв"                        , gender: "male"  , vocalFach: "bass_baritone", genre: "Rock", region: "russian", decade: "1990s", timbreWeight: 35 , airiness: 17 , raspiness: 23 , tessituraSpan: 40  },
  { name: "Сергей Галанин"                       , gender: "male"  , vocalFach: "bass_baritone", genre: "Rock", region: "russian", decade: "1990s", timbreWeight: 29 , airiness: 14 , raspiness: 22 , tessituraSpan: 38  },
  { name: "Сергей Чиграков (Чиж)"                , gender: "male"  , vocalFach: "bass_baritone", genre: "Rock", region: "russian", decade: "1990s", timbreWeight: 28 , airiness: 19 , raspiness: 20 , tessituraSpan: 42  },
  { name: "Андрей Макаревич"                     , gender: "male"  , vocalFach: "bass_baritone", genre: "Rock", region: "russian", decade: "1990s", timbreWeight: 31 , airiness: 10 , raspiness: 26 , tessituraSpan: 41  },
  { name: "Владимир Кузьмин"                     , gender: "male"  , vocalFach: "bass_baritone", genre: "Rock", region: "russian", decade: "1990s", timbreWeight: 25 , airiness: 12 , raspiness: 21 , tessituraSpan: 39  },
  { name: "Дмитрий Ревякин"                      , gender: "male"  , vocalFach: "bass_baritone", genre: "Rock", region: "russian", decade: "1990s", timbreWeight: 34 , airiness: 12 , raspiness: 26 , tessituraSpan: 34  },
  { name: "Александр Маршал"                     , gender: "male"  , vocalFach: "bass_baritone", genre: "Rock", region: "russian", decade: "1990s", timbreWeight: 26 , airiness: 12 , raspiness: 25 , tessituraSpan: 43  },
  { name: "Александр Иванов (Рондо)"             , gender: "male"  , vocalFach: "bass_baritone", genre: "Rock", region: "russian", decade: "1990s", timbreWeight: 30 , airiness: 16 , raspiness: 23 , tessituraSpan: 33  },
  { name: "Артур Беркут"                         , gender: "male"  , vocalFach: "bass_baritone", genre: "Rock", region: "russian", decade: "1990s", timbreWeight: 27 , airiness: 13 , raspiness: 22 , tessituraSpan: 42  },
  { name: "Максим Леонидов"                      , gender: "male"  , vocalFach: "bass_baritone", genre: "Rock", region: "russian", decade: "1990s", timbreWeight: 32 , airiness: 13 , raspiness: 18 , tessituraSpan: 40  },
  { name: "Алексей Романов"                      , gender: "male"  , vocalFach: "bass_baritone", genre: "Rock", region: "russian", decade: "1990s", timbreWeight: 35 , airiness: 10 , raspiness: 21 , tessituraSpan: 42  },
  { name: "Константин Никольский"                , gender: "male"  , vocalFach: "bass_baritone", genre: "Rock", region: "russian", decade: "1990s", timbreWeight: 29 , airiness: 9  , raspiness: 19 , tessituraSpan: 43  },
  { name: "Вячеслав Петкун (Танцы минус)"        , gender: "male"  , vocalFach: "bass_baritone", genre: "Rock", region: "russian", decade: "1990s", timbreWeight: 27 , airiness: 17 , raspiness: 27 , tessituraSpan: 37  },
  { name: "Максим Покровский (Ногу свело!)"      , gender: "male"  , vocalFach: "bass_baritone", genre: "Rock", region: "russian", decade: "1990s", timbreWeight: 33 , airiness: 12 , raspiness: 20 , tessituraSpan: 33  },
  { name: "Эдмунд Шклярский (Пикник)"            , gender: "male"  , vocalFach: "bass_baritone", genre: "Rock", region: "russian", decade: "1990s", timbreWeight: 26 , airiness: 15 , raspiness: 17 , tessituraSpan: 33  },
  { name: "Николай Носков"                       , gender: "male"  , vocalFach: "bass_baritone", genre: "Rock", region: "russian", decade: "1990s", timbreWeight: 33 , airiness: 17 , raspiness: 20 , tessituraSpan: 38  },
  { name: "Дмитрий Варшавский"                   , gender: "male"  , vocalFach: "bass_baritone", genre: "Rock", region: "russian", decade: "1990s", timbreWeight: 28 , airiness: 16 , raspiness: 25 , tessituraSpan: 39  },
  // ─── Российские мужские 2000-х — поп ───
  { name: "Дима Билан"                           , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 80 , airiness: 34 , raspiness: 16 , tessituraSpan: 62  },
  { name: "Сергей Лазарев"                       , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 86 , airiness: 10 , raspiness: 6  , tessituraSpan: 70  },
  { name: "Николай Басков"                       , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 74 , airiness: 6  , raspiness: 2  , tessituraSpan: 80  },
  { name: "Григорий Лепс"                        , gender: "male"  , vocalFach: "bass_baritone", genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 35 , airiness: 10 , raspiness: 95 , tessituraSpan: 70  },
  { name: "Валерий Меладзе"                      , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 62 , airiness: 16 , raspiness: 28 , tessituraSpan: 58  },
  { name: "Сергей Жуков (Руки Вверх)"            , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 70 , airiness: 12 , raspiness: 4  , tessituraSpan: 32  },
  { name: "Стас Михайлов"                        , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 86 , airiness: 22 , raspiness: 3  , tessituraSpan: 57  },
  { name: "Стас Пьеха"                           , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 87 , airiness: 27 , raspiness: 12 , tessituraSpan: 59  },
  { name: "Витас"                                , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 90 , airiness: 20 , raspiness: 4  , tessituraSpan: 88  },
  { name: "Авраам Руссо"                         , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 81 , airiness: 22 , raspiness: 8  , tessituraSpan: 62  },
  { name: "Данко"                                , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 85 , airiness: 17 , raspiness: 11 , tessituraSpan: 54  },
  { name: "Доминик Джокер"                       , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 79 , airiness: 18 , raspiness: 9  , tessituraSpan: 58  },
  { name: "Алексей Чумаков"                      , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 79 , airiness: 17 , raspiness: 7  , tessituraSpan: 60  },
  { name: "Александр Панайотов"                  , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 85 , airiness: 21 , raspiness: 8  , tessituraSpan: 58  },
  { name: "Дан Балан"                            , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 84 , airiness: 22 , raspiness: 4  , tessituraSpan: 61  },
  { name: "Николай Тимофеев (Дискотека Авария)"  , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 89 , airiness: 23 , raspiness: 4  , tessituraSpan: 55  },
  { name: "Пётр Елфимов"                         , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 89 , airiness: 18 , raspiness: 7  , tessituraSpan: 53  },
  { name: "Марк Тишман"                          , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 85 , airiness: 20 , raspiness: 5  , tessituraSpan: 60  },
  { name: "Гела Гуралиа"                         , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 86 , airiness: 27 , raspiness: 11 , tessituraSpan: 63  },
  { name: "Павел Артемьев (Корни)"               , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 81 , airiness: 17 , raspiness: 7  , tessituraSpan: 57  },
  { name: "Стас Костюшкин"                       , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 82 , airiness: 26 , raspiness: 9  , tessituraSpan: 58  },
  { name: "Митя Фомин"                           , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 85 , airiness: 20 , raspiness: 5  , tessituraSpan: 60  },
  { name: "Алексей Воробьёв"                     , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 89 , airiness: 19 , raspiness: 10 , tessituraSpan: 57  },
  { name: "Влад Топалов"                         , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 87 , airiness: 27 , raspiness: 5  , tessituraSpan: 55  },
  { name: "Потап"                                , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 89 , airiness: 19 , raspiness: 10 , tessituraSpan: 58  },
  { name: "Борис Моисеев"                        , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 81 , airiness: 21 , raspiness: 13 , tessituraSpan: 63  },
  { name: "Дмитрий Колдун"                       , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 85 , airiness: 23 , raspiness: 11 , tessituraSpan: 55  },
  { name: "Александр Рыбак"                      , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2000s", timbreWeight: 81 , airiness: 23 , raspiness: 5  , tessituraSpan: 57  },
  // ─── Российские мужские 2000-х — рок ───
  { name: "Михаил Горшенев (КиШ)"                , gender: "male"  , vocalFach: "bass_baritone", genre: "Rock", region: "russian", decade: "2000s", timbreWeight: 26 , airiness: 6  , raspiness: 82 , tessituraSpan: 48  },
  { name: "Александр Васильев (Сплин)"           , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "russian", decade: "2000s", timbreWeight: 60 , airiness: 32 , raspiness: 14 , tessituraSpan: 48  },
  { name: "Би-2 (Шура)"                          , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "russian", decade: "2000s", timbreWeight: 58 , airiness: 38 , raspiness: 22 , tessituraSpan: 42  },
  { name: "Сергей Шнуров"                        , gender: "male"  , vocalFach: "bass_baritone", genre: "Rock", region: "russian", decade: "2000s", timbreWeight: 36 , airiness: 20 , raspiness: 66 , tessituraSpan: 40  },
  { name: "Рома Зверь"                           , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "russian", decade: "2000s", timbreWeight: 67 , airiness: 29 , raspiness: 10 , tessituraSpan: 48  },
  { name: "Илья Черт (Пилот)"                    , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "russian", decade: "2000s", timbreWeight: 65 , airiness: 25 , raspiness: 11 , tessituraSpan: 47  },
  { name: "Алексей Горшенев (Кукрыниксы)"        , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "russian", decade: "2000s", timbreWeight: 70 , airiness: 25 , raspiness: 12 , tessituraSpan: 51  },
  { name: "Андрей Князев"                        , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "russian", decade: "2000s", timbreWeight: 70 , airiness: 30 , raspiness: 16 , tessituraSpan: 48  },
  { name: "Рустем Булатов (Lumen)"               , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "russian", decade: "2000s", timbreWeight: 68 , airiness: 35 , raspiness: 17 , tessituraSpan: 49  },
  { name: "Александр Красовицкий (Animal ДжаZ)"  , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "russian", decade: "2000s", timbreWeight: 73 , airiness: 31 , raspiness: 12 , tessituraSpan: 51  },
  { name: "Сергей Бобунец"                       , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "russian", decade: "2000s", timbreWeight: 70 , airiness: 30 , raspiness: 12 , tessituraSpan: 46  },
  { name: "Святослав Вакарчук"                   , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "russian", decade: "2000s", timbreWeight: 78 , airiness: 28 , raspiness: 12 , tessituraSpan: 70  },
  { name: "Дельфин"                              , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "russian", decade: "2000s", timbreWeight: 67 , airiness: 25 , raspiness: 15 , tessituraSpan: 46  },
  { name: "Михаил Житняков (Ария)"               , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "russian", decade: "2000s", timbreWeight: 70 , airiness: 35 , raspiness: 12 , tessituraSpan: 50  },
  { name: "Лёва Би-2"                            , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "russian", decade: "2000s", timbreWeight: 70 , airiness: 30 , raspiness: 14 , tessituraSpan: 48  },
  { name: "Дмитрий Спирин (Тараканы!)"           , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "russian", decade: "2000s", timbreWeight: 75 , airiness: 27 , raspiness: 7  , tessituraSpan: 50  },
  { name: "Евгений Егоров (Эпидемия)"            , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "russian", decade: "2000s", timbreWeight: 70 , airiness: 31 , raspiness: 17 , tessituraSpan: 49  },
  { name: "Павел Окунев"                         , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "russian", decade: "2000s", timbreWeight: 73 , airiness: 27 , raspiness: 16 , tessituraSpan: 47  },
  { name: "Борис Бурдаев (Братья Грим)"          , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "russian", decade: "2000s", timbreWeight: 68 , airiness: 30 , raspiness: 10 , tessituraSpan: 53  },
  // ─── Российские мужские 2010-х — поп ───
  { name: "Егор Крид"                            , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2010s", timbreWeight: 72 , airiness: 26 , raspiness: 14 , tessituraSpan: 46  },
  { name: "Мот"                                  , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2010s", timbreWeight: 66 , airiness: 30 , raspiness: 18 , tessituraSpan: 42  },
  { name: "Макс Барских"                         , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2010s", timbreWeight: 73 , airiness: 33 , raspiness: 13 , tessituraSpan: 47  },
  { name: "Монатик"                              , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2010s", timbreWeight: 67 , airiness: 31 , raspiness: 16 , tessituraSpan: 47  },
  { name: "ALEKSEEV"                             , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2010s", timbreWeight: 65 , airiness: 32 , raspiness: 8  , tessituraSpan: 46  },
  { name: "Артур Пирожков"                       , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2010s", timbreWeight: 74 , airiness: 33 , raspiness: 11 , tessituraSpan: 50  },
  { name: "Burito"                               , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2010s", timbreWeight: 66 , airiness: 27 , raspiness: 14 , tessituraSpan: 48  },
  { name: "Иван Дорн"                            , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2010s", timbreWeight: 71 , airiness: 33 , raspiness: 10 , tessituraSpan: 48  },
  { name: "Антон Беляев (Therr Maitz)"           , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2010s", timbreWeight: 67 , airiness: 27 , raspiness: 11 , tessituraSpan: 49  },
  { name: "Тима Белорусских"                     , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2010s", timbreWeight: 70 , airiness: 35 , raspiness: 9  , tessituraSpan: 50  },
  { name: "Макс Корж"                            , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2010s", timbreWeight: 74 , airiness: 32 , raspiness: 17 , tessituraSpan: 46  },
  { name: "Feduk"                                , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2010s", timbreWeight: 68 , airiness: 28 , raspiness: 14 , tessituraSpan: 46  },
  { name: "Jah Khalib"                           , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2010s", timbreWeight: 74 , airiness: 33 , raspiness: 9  , tessituraSpan: 53  },
  { name: "Влад Соколовский"                     , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2010s", timbreWeight: 70 , airiness: 33 , raspiness: 7  , tessituraSpan: 52  },
  { name: "Артём Пиндюра (MBAND)"                , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2010s", timbreWeight: 69 , airiness: 32 , raspiness: 12 , tessituraSpan: 44  },
  { name: "Элджей"                               , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2010s", timbreWeight: 73 , airiness: 35 , raspiness: 14 , tessituraSpan: 45  },
  { name: "Тимати"                               , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2010s", timbreWeight: 73 , airiness: 34 , raspiness: 15 , tessituraSpan: 51  },
  { name: "Баста"                                , gender: "male"  , vocalFach: "bass_baritone", genre: "Pop" , region: "russian", decade: "2010s", timbreWeight: 30 , airiness: 20 , raspiness: 60 , tessituraSpan: 35  },
  { name: "ST"                                   , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2010s", timbreWeight: 73 , airiness: 34 , raspiness: 15 , tessituraSpan: 52  },
  { name: "L'One"                                , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2010s", timbreWeight: 67 , airiness: 34 , raspiness: 16 , tessituraSpan: 51  },
  { name: "Егор Сесарев"                         , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2010s", timbreWeight: 72 , airiness: 26 , raspiness: 16 , tessituraSpan: 50  },
  // ─── Российские мужские 2010-х — рок ───
  { name: "Владимир Раткет (Порнофильмы)"        , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "russian", decade: "2010s", timbreWeight: 60 , airiness: 8  , raspiness: 79 , tessituraSpan: 74  },
  { name: "Евгений Мильковский (Нервы)"          , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "russian", decade: "2010s", timbreWeight: 69 , airiness: 9  , raspiness: 78 , tessituraSpan: 70  },
  { name: "Кирилл Бледный (Пошлая Молли)"        , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "russian", decade: "2010s", timbreWeight: 67 , airiness: 9  , raspiness: 80 , tessituraSpan: 71  },
  { name: "Николай Комягин (Shortparis)"         , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "russian", decade: "2010s", timbreWeight: 60 , airiness: 7  , raspiness: 77 , tessituraSpan: 68  },
  { name: "Михаил Калинкин (Аффинаж)"            , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "russian", decade: "2010s", timbreWeight: 69 , airiness: 15 , raspiness: 79 , tessituraSpan: 76  },
  { name: "Дмитрий Суслик (Дайте танк!)"         , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "russian", decade: "2010s", timbreWeight: 65 , airiness: 14 , raspiness: 76 , tessituraSpan: 67  },
  { name: "Noize MC"                             , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "russian", decade: "2010s", timbreWeight: 60 , airiness: 9  , raspiness: 79 , tessituraSpan: 74  },
  // ─── Российские мужские 2020-х — поп ───
  { name: "Jony"                                 , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2020s", timbreWeight: 78 , airiness: 54 , raspiness: 10 , tessituraSpan: 50  },
  { name: "Niletto"                              , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2020s", timbreWeight: 68 , airiness: 42 , raspiness: 6  , tessituraSpan: 44  },
  { name: "Хабиб"                                , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2020s", timbreWeight: 64 , airiness: 44 , raspiness: 8  , tessituraSpan: 38  },
  { name: "Shaman"                               , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2020s", timbreWeight: 82 , airiness: 14 , raspiness: 42 , tessituraSpan: 76  },
  { name: "Артём Пивоваров"                      , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2020s", timbreWeight: 76 , airiness: 36 , raspiness: 10 , tessituraSpan: 52  },
  { name: "Ваня Дмитриенко"                      , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2020s", timbreWeight: 81 , airiness: 47 , raspiness: 9  , tessituraSpan: 51  },
  { name: "Xolidayboy"                           , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2020s", timbreWeight: 76 , airiness: 52 , raspiness: 6  , tessituraSpan: 46  },
  { name: "Олег Майами"                          , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2020s", timbreWeight: 73 , airiness: 44 , raspiness: 8  , tessituraSpan: 47  },
  { name: "Кирилл Дабро"                         , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2020s", timbreWeight: 75 , airiness: 45 , raspiness: 4  , tessituraSpan: 50  },
  { name: "Тимур Гаязов"                         , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2020s", timbreWeight: 80 , airiness: 43 , raspiness: 9  , tessituraSpan: 55  },
  { name: "Andro"                                , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2020s", timbreWeight: 81 , airiness: 46 , raspiness: 6  , tessituraSpan: 54  },
  { name: "Ramil'"                               , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2020s", timbreWeight: 74 , airiness: 46 , raspiness: 6  , tessituraSpan: 52  },
  { name: "Akmal'"                               , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2020s", timbreWeight: 83 , airiness: 53 , raspiness: 3  , tessituraSpan: 47  },
  { name: "Macan"                                , gender: "male"  , vocalFach: "bass_baritone", genre: "Pop" , region: "russian", decade: "2020s", timbreWeight: 35 , airiness: 40 , raspiness: 20 , tessituraSpan: 30  },
  { name: "Коста Лакоста"                        , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2020s", timbreWeight: 78 , airiness: 50 , raspiness: 1  , tessituraSpan: 55  },
  { name: "Jakone"                               , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2020s", timbreWeight: 80 , airiness: 53 , raspiness: 9  , tessituraSpan: 54  },
  { name: "Elman"                                , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2020s", timbreWeight: 81 , airiness: 46 , raspiness: 10 , tessituraSpan: 49  },
  { name: "Konfuz"                               , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2020s", timbreWeight: 82 , airiness: 53 , raspiness: 7  , tessituraSpan: 49  },
  { name: "The Limba"                            , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2020s", timbreWeight: 76 , airiness: 45 , raspiness: 7  , tessituraSpan: 50  },
  { name: "HENSY"                                , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2020s", timbreWeight: 82 , airiness: 45 , raspiness: 2  , tessituraSpan: 48  },
  { name: "Cream Soda (Dmitry)"                  , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2020s", timbreWeight: 83 , airiness: 45 , raspiness: 5  , tessituraSpan: 48  },
  { name: "5утра"                                , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2020s", timbreWeight: 79 , airiness: 50 , raspiness: 9  , tessituraSpan: 55  },
  { name: "Miyagi"                               , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2020s", timbreWeight: 68 , airiness: 45 , raspiness: 30 , tessituraSpan: 36  },
  { name: "Markul"                               , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2020s", timbreWeight: 76 , airiness: 45 , raspiness: 10 , tessituraSpan: 53  },
  { name: "Aarne"                                , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2020s", timbreWeight: 76 , airiness: 52 , raspiness: 9  , tessituraSpan: 50  },
  { name: "SQWOZ BAB"                            , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "russian", decade: "2020s", timbreWeight: 75 , airiness: 43 , raspiness: 10 , tessituraSpan: 50  },
  // ─── Российские мужские 2020-х — рок ───
  { name: "Ярослав Андреев (Три дня дождя)"      , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "russian", decade: "2020s", timbreWeight: 62 , airiness: 7  , raspiness: 83 , tessituraSpan: 75  },
  { name: "Гордей (Сказки)"                      , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "russian", decade: "2020s", timbreWeight: 63 , airiness: 10 , raspiness: 79 , tessituraSpan: 74  },
  // ─── Зарубежные женские 90-х — поп ───
  { name: "Madonna"                              , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 60 , airiness: 20 , raspiness: 14 , tessituraSpan: 46  },
  { name: "Mariah Carey"                         , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 94 , airiness: 32 , raspiness: 2  , tessituraSpan: 98  },
  { name: "Whitney Houston"                      , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 88 , airiness: 14 , raspiness: 12 , tessituraSpan: 90  },
  { name: "Celine Dion"                          , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 84 , airiness: 8  , raspiness: 6  , tessituraSpan: 88  },
  { name: "Cher"                                 , gender: "female", vocalFach: "contralto"    , genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 18 , airiness: 6  , raspiness: 12 , tessituraSpan: 50  },
  { name: "Janet Jackson"                        , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 80 , airiness: 24 , raspiness: 5  , tessituraSpan: 48  },
  { name: "Toni Braxton"                         , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 81 , airiness: 23 , raspiness: 11 , tessituraSpan: 49  },
  { name: "Shania Twain"                         , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 86 , airiness: 23 , raspiness: 10 , tessituraSpan: 55  },
  { name: "Tionne Watkins (TLC)"                 , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 86 , airiness: 31 , raspiness: 1  , tessituraSpan: 54  },
  { name: "Brandy"                               , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 80 , airiness: 23 , raspiness: 9  , tessituraSpan: 51  },
  { name: "Monica"                               , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 86 , airiness: 27 , raspiness: 6  , tessituraSpan: 48  },
  { name: "Aaliyah"                              , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 77 , airiness: 31 , raspiness: 2  , tessituraSpan: 50  },
  { name: "Gloria Estefan"                       , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 83 , airiness: 30 , raspiness: 2  , tessituraSpan: 54  },
  { name: "Paula Abdul"                          , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 86 , airiness: 33 , raspiness: 3  , tessituraSpan: 45  },
  { name: "Marie Fredriksson (Roxette)"          , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 85 , airiness: 24 , raspiness: 3  , tessituraSpan: 49  },
  { name: "Linn Berggren (Ace of Base)"          , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 81 , airiness: 28 , raspiness: 4  , tessituraSpan: 49  },
  { name: "Lene Nystrøm (Aqua)"                  , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 84 , airiness: 26 , raspiness: 1  , tessituraSpan: 48  },
  { name: "Natalie Imbruglia"                    , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 83 , airiness: 24 , raspiness: 5  , tessituraSpan: 53  },
  { name: "Jewel"                                , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 85 , airiness: 28 , raspiness: 6  , tessituraSpan: 46  },
  { name: "Sarah McLachlan"                      , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 81 , airiness: 33 , raspiness: 7  , tessituraSpan: 50  },
  { name: "Björk"                                , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 82 , airiness: 30 , raspiness: 2  , tessituraSpan: 51  },
  { name: "Annie Lennox"                         , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 84 , airiness: 33 , raspiness: 3  , tessituraSpan: 45  },
  { name: "Faith Hill"                           , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 86 , airiness: 23 , raspiness: 1  , tessituraSpan: 45  },
  { name: "LeAnn Rimes"                          , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 87 , airiness: 32 , raspiness: 10 , tessituraSpan: 49  },
  { name: "Vanessa Williams"                     , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 87 , airiness: 25 , raspiness: 4  , tessituraSpan: 46  },
  { name: "Des'ree"                              , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 86 , airiness: 23 , raspiness: 7  , tessituraSpan: 48  },
  { name: "Lisa Stansfield"                      , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 77 , airiness: 32 , raspiness: 2  , tessituraSpan: 53  },
  { name: "Chynna Phillips"                      , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 84 , airiness: 28 , raspiness: 10 , tessituraSpan: 47  },
  { name: "Tina Arena"                           , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 85 , airiness: 29 , raspiness: 8  , tessituraSpan: 47  },
  { name: "Deborah Cox"                          , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 86 , airiness: 24 , raspiness: 3  , tessituraSpan: 47  },
  // ─── Зарубежные женские 90-х — рок ───
  { name: "Alanis Morissette"                    , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "1990s", timbreWeight: 64 , airiness: 14 , raspiness: 68 , tessituraSpan: 68  },
  { name: "Gwen Stefani (No Doubt)"              , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "1990s", timbreWeight: 84 , airiness: 24 , raspiness: 20 , tessituraSpan: 66  },
  { name: "Shirley Manson (Garbage)"             , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "1990s", timbreWeight: 84 , airiness: 16 , raspiness: 26 , tessituraSpan: 74  },
  { name: "Dolores O'Riordan"                    , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "1990s", timbreWeight: 78 , airiness: 46 , raspiness: 16 , tessituraSpan: 60  },
  { name: "Courtney Love"                        , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "1990s", timbreWeight: 80 , airiness: 19 , raspiness: 28 , tessituraSpan: 74  },
  { name: "PJ Harvey"                            , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "1990s", timbreWeight: 85 , airiness: 17 , raspiness: 26 , tessituraSpan: 72  },
  { name: "Tori Amos"                            , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "1990s", timbreWeight: 82 , airiness: 19 , raspiness: 24 , tessituraSpan: 77  },
  { name: "Stevie Nicks"                         , gender: "female", vocalFach: "contralto"    , genre: "Rock", region: "western", decade: "1990s", timbreWeight: 38 , airiness: 42 , raspiness: 28 , tessituraSpan: 52  },
  { name: "Sheryl Crow"                          , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "1990s", timbreWeight: 80 , airiness: 16 , raspiness: 28 , tessituraSpan: 72  },
  { name: "Melissa Etheridge"                    , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "1990s", timbreWeight: 81 , airiness: 21 , raspiness: 26 , tessituraSpan: 69  },
  { name: "Sinead O'Connor"                      , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "1990s", timbreWeight: 79 , airiness: 11 , raspiness: 30 , tessituraSpan: 69  },
  { name: "Kim Deal"                             , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "1990s", timbreWeight: 76 , airiness: 12 , raspiness: 32 , tessituraSpan: 70  },
  { name: "Liz Phair"                            , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "1990s", timbreWeight: 82 , airiness: 20 , raspiness: 33 , tessituraSpan: 76  },
  { name: "Fiona Apple"                          , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "1990s", timbreWeight: 75 , airiness: 11 , raspiness: 27 , tessituraSpan: 69  },
  { name: "Joan Osborne"                         , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "1990s", timbreWeight: 82 , airiness: 18 , raspiness: 28 , tessituraSpan: 74  },
  { name: "Skin (Skunk Anansie)"                 , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "1990s", timbreWeight: 85 , airiness: 19 , raspiness: 25 , tessituraSpan: 67  },
  { name: "Linda Perry (4 Non Blondes)"          , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "1990s", timbreWeight: 75 , airiness: 17 , raspiness: 26 , tessituraSpan: 67  },
  { name: "Nina Persson"                         , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "1990s", timbreWeight: 85 , airiness: 15 , raspiness: 27 , tessituraSpan: 76  },
  { name: "Ann Wilson"                           , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "1990s", timbreWeight: 85 , airiness: 19 , raspiness: 29 , tessituraSpan: 70  },
  { name: "Joan Jett"                            , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "1990s", timbreWeight: 77 , airiness: 17 , raspiness: 26 , tessituraSpan: 67  },
  { name: "Pat Benatar"                          , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "1990s", timbreWeight: 78 , airiness: 11 , raspiness: 32 , tessituraSpan: 68  },
  { name: "Tina Turner"                          , gender: "female", vocalFach: "contralto"    , genre: "Rock", region: "western", decade: "1990s", timbreWeight: 36 , airiness: 6  , raspiness: 86 , tessituraSpan: 70  },
  { name: "Chrissie Hynde"                       , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "1990s", timbreWeight: 79 , airiness: 13 , raspiness: 23 , tessituraSpan: 70  },
  { name: "Kim Gordon"                           , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "1990s", timbreWeight: 79 , airiness: 20 , raspiness: 33 , tessituraSpan: 72  },
  { name: "Saffron (Republica)"                  , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "1990s", timbreWeight: 78 , airiness: 19 , raspiness: 28 , tessituraSpan: 70  },
  { name: "Justine Frischmann"                   , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "1990s", timbreWeight: 85 , airiness: 16 , raspiness: 30 , tessituraSpan: 74  },
  { name: "Johnette Napolitano"                  , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "1990s", timbreWeight: 75 , airiness: 11 , raspiness: 29 , tessituraSpan: 70  },
  { name: "Doro"                                 , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "1990s", timbreWeight: 77 , airiness: 16 , raspiness: 32 , tessituraSpan: 71  },
  { name: "Cristina Scabbia"                     , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "1990s", timbreWeight: 83 , airiness: 15 , raspiness: 31 , tessituraSpan: 75  },
  { name: "Tarja Turunen"                        , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "1990s", timbreWeight: 84 , airiness: 6  , raspiness: 32 , tessituraSpan: 90  },
  // ─── Зарубежные женские 2000-х — поп ───
  { name: "Britney Spears"                       , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 74 , airiness: 24 , raspiness: 4  , tessituraSpan: 42  },
  { name: "Christina Aguilera"                   , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 86 , airiness: 16 , raspiness: 22 , tessituraSpan: 88  },
  { name: "Beyonce"                              , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 76 , airiness: 18 , raspiness: 16 , tessituraSpan: 86  },
  { name: "Pink"                                 , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 66 , airiness: 12 , raspiness: 50 , tessituraSpan: 72  },
  { name: "Shakira"                              , gender: "female", vocalFach: "contralto"    , genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 52 , airiness: 18 , raspiness: 42 , tessituraSpan: 64  },
  { name: "Jennifer Lopez"                       , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 87 , airiness: 31 , raspiness: 4  , tessituraSpan: 54  },
  { name: "Alicia Keys"                          , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 79 , airiness: 31 , raspiness: 10 , tessituraSpan: 55  },
  { name: "Kelly Clarkson"                       , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 85 , airiness: 23 , raspiness: 9  , tessituraSpan: 46  },
  { name: "Fergie"                               , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 86 , airiness: 32 , raspiness: 6  , tessituraSpan: 48  },
  { name: "Amy Winehouse"                        , gender: "female", vocalFach: "contralto"    , genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 30 , airiness: 15 , raspiness: 45 , tessituraSpan: 48  },
  { name: "Nelly Furtado"                        , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 82 , airiness: 27 , raspiness: 5  , tessituraSpan: 50  },
  { name: "Leona Lewis"                          , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 77 , airiness: 33 , raspiness: 10 , tessituraSpan: 55  },
  { name: "Duffy"                                , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 81 , airiness: 24 , raspiness: 11 , tessituraSpan: 49  },
  { name: "Lily Allen"                           , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 78 , airiness: 24 , raspiness: 8  , tessituraSpan: 53  },
  { name: "Robyn"                                , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 77 , airiness: 29 , raspiness: 2  , tessituraSpan: 48  },
  { name: "Kylie Minogue"                        , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 81 , airiness: 28 , raspiness: 10 , tessituraSpan: 45  },
  { name: "Lady Gaga"                            , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 64 , airiness: 14 , raspiness: 28 , tessituraSpan: 80  },
  { name: "Mary J. Blige"                        , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 81 , airiness: 32 , raspiness: 2  , tessituraSpan: 46  },
  { name: "Ciara"                                , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 86 , airiness: 28 , raspiness: 9  , tessituraSpan: 53  },
  { name: "Jordin Sparks"                        , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 86 , airiness: 33 , raspiness: 7  , tessituraSpan: 55  },
  { name: "Natasha Bedingfield"                  , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 78 , airiness: 27 , raspiness: 4  , tessituraSpan: 53  },
  { name: "Colbie Caillat"                       , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 85 , airiness: 31 , raspiness: 4  , tessituraSpan: 49  },
  { name: "Sara Bareilles"                       , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 81 , airiness: 31 , raspiness: 2  , tessituraSpan: 55  },
  { name: "Norah Jones"                          , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 84 , airiness: 28 , raspiness: 9  , tessituraSpan: 45  },
  { name: "Ashlee Simpson"                       , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 84 , airiness: 32 , raspiness: 7  , tessituraSpan: 45  },
  { name: "Hilary Duff"                          , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 83 , airiness: 27 , raspiness: 10 , tessituraSpan: 46  },
  { name: "JoJo"                                 , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 84 , airiness: 33 , raspiness: 1  , tessituraSpan: 51  },
  { name: "Nicole Scherzinger"                   , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 82 , airiness: 28 , raspiness: 7  , tessituraSpan: 46  },
  { name: "Carrie Underwood"                     , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 84 , airiness: 28 , raspiness: 1  , tessituraSpan: 51  },
  { name: "Keyshia Cole"                         , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 82 , airiness: 32 , raspiness: 8  , tessituraSpan: 52  },
  // ─── Зарубежные женские 2000-х — рок ───
  { name: "Avril Lavigne"                        , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "2000s", timbreWeight: 82 , airiness: 10 , raspiness: 18 , tessituraSpan: 46  },
  { name: "Amy Lee (Evanescence)"                , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "2000s", timbreWeight: 75 , airiness: 22 , raspiness: 12 , tessituraSpan: 76  },
  { name: "Hayley Williams"                      , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "2000s", timbreWeight: 84 , airiness: 16 , raspiness: 30 , tessituraSpan: 74  },
  { name: "Karen O"                              , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "2000s", timbreWeight: 81 , airiness: 21 , raspiness: 26 , tessituraSpan: 76  },
  { name: "Alison Mosshart"                      , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "2000s", timbreWeight: 81 , airiness: 20 , raspiness: 31 , tessituraSpan: 72  },
  { name: "Emily Haines"                         , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "2000s", timbreWeight: 79 , airiness: 16 , raspiness: 24 , tessituraSpan: 69  },
  { name: "Lzzy Hale"                            , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "2000s", timbreWeight: 75 , airiness: 17 , raspiness: 27 , tessituraSpan: 67  },
  { name: "Sharon den Adel"                      , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "2000s", timbreWeight: 76 , airiness: 14 , raspiness: 28 , tessituraSpan: 68  },
  { name: "Angela Gossow"                        , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "2000s", timbreWeight: 80 , airiness: 20 , raspiness: 33 , tessituraSpan: 76  },
  { name: "Lacey Sturm"                          , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "2000s", timbreWeight: 78 , airiness: 21 , raspiness: 23 , tessituraSpan: 67  },
  { name: "Brody Dalle"                          , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "2000s", timbreWeight: 76 , airiness: 15 , raspiness: 32 , tessituraSpan: 75  },
  { name: "Maria Brink"                          , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "2000s", timbreWeight: 76 , airiness: 17 , raspiness: 27 , tessituraSpan: 76  },
  { name: "Simone Simons"                        , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "2000s", timbreWeight: 76 , airiness: 19 , raspiness: 32 , tessituraSpan: 77  },
  { name: "Feist"                                , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "2000s", timbreWeight: 76 , airiness: 14 , raspiness: 27 , tessituraSpan: 72  },
  { name: "Regina Spektor"                       , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "2000s", timbreWeight: 83 , airiness: 21 , raspiness: 27 , tessituraSpan: 70  },
  { name: "Laura Jane Grace"                     , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "2000s", timbreWeight: 75 , airiness: 11 , raspiness: 26 , tessituraSpan: 68  },
  { name: "Beth Ditto"                           , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "2000s", timbreWeight: 80 , airiness: 16 , raspiness: 29 , tessituraSpan: 77  },
  { name: "Amanda Palmer"                        , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "2000s", timbreWeight: 81 , airiness: 17 , raspiness: 30 , tessituraSpan: 68  },
  { name: "Neko Case"                            , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "2000s", timbreWeight: 77 , airiness: 13 , raspiness: 27 , tessituraSpan: 74  },
  { name: "Juliette Lewis"                       , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "2000s", timbreWeight: 85 , airiness: 15 , raspiness: 29 , tessituraSpan: 71  },
  { name: "Donita Sparks"                        , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "2000s", timbreWeight: 81 , airiness: 21 , raspiness: 28 , tessituraSpan: 74  },
  { name: "Corin Tucker"                         , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "2000s", timbreWeight: 79 , airiness: 17 , raspiness: 27 , tessituraSpan: 68  },
  { name: "Carrie Brownstein"                    , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "2000s", timbreWeight: 84 , airiness: 20 , raspiness: 23 , tessituraSpan: 73  },
  // ─── Зарубежные женские 2010-х — поп ───
  { name: "Adele"                                , gender: "female", vocalFach: "contralto"    , genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 34 , airiness: 18 , raspiness: 12 , tessituraSpan: 58  },
  { name: "Taylor Swift"                         , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 68 , airiness: 28 , raspiness: 6  , tessituraSpan: 48  },
  { name: "Ariana Grande"                        , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 96 , airiness: 42 , raspiness: 2  , tessituraSpan: 92  },
  { name: "Rihanna"                              , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 58 , airiness: 24 , raspiness: 18 , tessituraSpan: 50  },
  { name: "Katy Perry"                           , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 72 , airiness: 12 , raspiness: 8  , tessituraSpan: 52  },
  { name: "Sia"                                  , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 80 , airiness: 18 , raspiness: 62 , tessituraSpan: 74  },
  { name: "Lana Del Rey"                         , gender: "female", vocalFach: "contralto"    , genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 22 , airiness: 62 , raspiness: 4  , tessituraSpan: 32  },
  { name: "Billie Eilish"                        , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 82 , airiness: 96 , raspiness: 4  , tessituraSpan: 22  },
  { name: "Lorde"                                , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 77 , airiness: 32 , raspiness: 6  , tessituraSpan: 50  },
  { name: "Halsey"                               , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 82 , airiness: 30 , raspiness: 11 , tessituraSpan: 47  },
  { name: "Camila Cabello"                       , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 86 , airiness: 26 , raspiness: 6  , tessituraSpan: 49  },
  { name: "Selena Gomez"                         , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 82 , airiness: 32 , raspiness: 2  , tessituraSpan: 48  },
  { name: "Demi Lovato"                          , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 85 , airiness: 24 , raspiness: 6  , tessituraSpan: 51  },
  { name: "Miley Cyrus"                          , gender: "female", vocalFach: "contralto"    , genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 44 , airiness: 14 , raspiness: 64 , tessituraSpan: 62  },
  { name: "Meghan Trainor"                       , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 85 , airiness: 33 , raspiness: 8  , tessituraSpan: 49  },
  { name: "Carly Rae Jepsen"                     , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 82 , airiness: 30 , raspiness: 1  , tessituraSpan: 45  },
  { name: "Ellie Goulding"                       , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 81 , airiness: 33 , raspiness: 6  , tessituraSpan: 53  },
  { name: "Jessie J"                             , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 81 , airiness: 26 , raspiness: 10 , tessituraSpan: 53  },
  { name: "Rita Ora"                             , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 87 , airiness: 33 , raspiness: 9  , tessituraSpan: 47  },
  { name: "Bebe Rexha"                           , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 78 , airiness: 27 , raspiness: 1  , tessituraSpan: 49  },
  { name: "Alessia Cara"                         , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 77 , airiness: 25 , raspiness: 5  , tessituraSpan: 47  },
  { name: "Kesha"                                , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 80 , airiness: 24 , raspiness: 5  , tessituraSpan: 54  },
  { name: "Tove Lo"                              , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 84 , airiness: 33 , raspiness: 1  , tessituraSpan: 47  },
  { name: "Zara Larsson"                         , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 78 , airiness: 27 , raspiness: 11 , tessituraSpan: 47  },
  { name: "Anne-Marie"                           , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 77 , airiness: 26 , raspiness: 5  , tessituraSpan: 46  },
  { name: "Perrie Edwards"                       , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 86 , airiness: 32 , raspiness: 7  , tessituraSpan: 46  },
  { name: "IU"                                   , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 87 , airiness: 31 , raspiness: 9  , tessituraSpan: 53  },
  { name: "Taeyeon"                              , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 84 , airiness: 27 , raspiness: 9  , tessituraSpan: 47  },
  { name: "Rosé (BLACKPINK)"                     , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 78 , airiness: 23 , raspiness: 3  , tessituraSpan: 55  },
  { name: "FKA twigs"                            , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 85 , airiness: 24 , raspiness: 4  , tessituraSpan: 52  },
  // ─── Зарубежные женские 2010-х — рок ───
  { name: "Florence Welch"                       , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "2010s", timbreWeight: 72 , airiness: 32 , raspiness: 14 , tessituraSpan: 80  },
  { name: "Floor Jansen"                         , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "2010s", timbreWeight: 80 , airiness: 10 , raspiness: 50 , tessituraSpan: 88  },
  { name: "St. Vincent"                          , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "2010s", timbreWeight: 71 , airiness: 39 , raspiness: 13 , tessituraSpan: 52  },
  { name: "Phoebe Bridgers"                      , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "2010s", timbreWeight: 76 , airiness: 41 , raspiness: 17 , tessituraSpan: 49  },
  { name: "Courtney Barnett"                     , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "2010s", timbreWeight: 71 , airiness: 40 , raspiness: 16 , tessituraSpan: 51  },
  { name: "Angel Olsen"                          , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "2010s", timbreWeight: 68 , airiness: 40 , raspiness: 8  , tessituraSpan: 55  },
  { name: "Mitski"                               , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "2010s", timbreWeight: 70 , airiness: 38 , raspiness: 8  , tessituraSpan: 55  },
  { name: "Lucy Dacus"                           , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "2010s", timbreWeight: 67 , airiness: 38 , raspiness: 15 , tessituraSpan: 57  },
  { name: "Julien Baker"                         , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "2010s", timbreWeight: 75 , airiness: 33 , raspiness: 16 , tessituraSpan: 57  },
  { name: "Sharon Van Etten"                     , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "2010s", timbreWeight: 68 , airiness: 31 , raspiness: 14 , tessituraSpan: 51  },
  { name: "Soccer Mommy"                         , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "2010s", timbreWeight: 75 , airiness: 32 , raspiness: 10 , tessituraSpan: 53  },
  { name: "Japanese Breakfast"                   , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "2010s", timbreWeight: 71 , airiness: 37 , raspiness: 14 , tessituraSpan: 52  },
  { name: "Weyes Blood"                          , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "2010s", timbreWeight: 75 , airiness: 37 , raspiness: 13 , tessituraSpan: 51  },
  { name: "Lauren Mayberry (CHVRCHES)"           , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "2010s", timbreWeight: 77 , airiness: 32 , raspiness: 7  , tessituraSpan: 50  },
  { name: "Ellie Rowsell (Wolf Alice)"           , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "2010s", timbreWeight: 68 , airiness: 39 , raspiness: 11 , tessituraSpan: 56  },
  { name: "Danielle Haim"                        , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "2010s", timbreWeight: 77 , airiness: 36 , raspiness: 8  , tessituraSpan: 56  },
  { name: "Adrianne Lenker"                      , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "2010s", timbreWeight: 77 , airiness: 35 , raspiness: 10 , tessituraSpan: 57  },
  { name: "Lindsey Jordan (Snail Mail)"          , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "2010s", timbreWeight: 71 , airiness: 31 , raspiness: 14 , tessituraSpan: 52  },
  { name: "Brittany Howard"                      , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "2010s", timbreWeight: 76 , airiness: 34 , raspiness: 16 , tessituraSpan: 55  },
  { name: "HAIM Este"                            , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "2010s", timbreWeight: 71 , airiness: 38 , raspiness: 8  , tessituraSpan: 55  },
  // ─── Зарубежные женские 2020-х — поп ───
  { name: "Olivia Rodrigo"                       , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2020s", timbreWeight: 70 , airiness: 26 , raspiness: 22 , tessituraSpan: 56  },
  { name: "Sabrina Carpenter"                    , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2020s", timbreWeight: 78 , airiness: 34 , raspiness: 6  , tessituraSpan: 48  },
  { name: "Dua Lipa"                             , gender: "female", vocalFach: "contralto"    , genre: "Pop" , region: "western", decade: "2020s", timbreWeight: 48 , airiness: 32 , raspiness: 6  , tessituraSpan: 46  },
  { name: "Tate McRae"                           , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2020s", timbreWeight: 77 , airiness: 32 , raspiness: 7  , tessituraSpan: 54  },
  { name: "Chappell Roan"                        , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2020s", timbreWeight: 84 , airiness: 30 , raspiness: 4  , tessituraSpan: 55  },
  { name: "Doja Cat"                             , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2020s", timbreWeight: 79 , airiness: 28 , raspiness: 5  , tessituraSpan: 52  },
  { name: "SZA"                                  , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2020s", timbreWeight: 80 , airiness: 27 , raspiness: 4  , tessituraSpan: 51  },
  { name: "Gracie Abrams"                        , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2020s", timbreWeight: 85 , airiness: 29 , raspiness: 10 , tessituraSpan: 53  },
  { name: "Madison Beer"                         , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2020s", timbreWeight: 87 , airiness: 28 , raspiness: 8  , tessituraSpan: 52  },
  { name: "Dove Cameron"                         , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2020s", timbreWeight: 82 , airiness: 28 , raspiness: 6  , tessituraSpan: 51  },
  { name: "Karol G"                              , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2020s", timbreWeight: 80 , airiness: 28 , raspiness: 2  , tessituraSpan: 54  },
  { name: "Rosalía"                              , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2020s", timbreWeight: 79 , airiness: 30 , raspiness: 9  , tessituraSpan: 54  },
  { name: "Anitta"                               , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2020s", timbreWeight: 83 , airiness: 32 , raspiness: 5  , tessituraSpan: 49  },
  { name: "Gayle"                                , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2020s", timbreWeight: 81 , airiness: 23 , raspiness: 8  , tessituraSpan: 55  },
  { name: "PinkPantheress"                       , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2020s", timbreWeight: 78 , airiness: 26 , raspiness: 6  , tessituraSpan: 45  },
  { name: "Reneé Rapp"                           , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2020s", timbreWeight: 77 , airiness: 31 , raspiness: 2  , tessituraSpan: 49  },
  { name: "Tyla"                                 , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2020s", timbreWeight: 84 , airiness: 31 , raspiness: 4  , tessituraSpan: 45  },
  { name: "Raye"                                 , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2020s", timbreWeight: 86 , airiness: 32 , raspiness: 8  , tessituraSpan: 55  },
  { name: "Charli XCX"                           , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2020s", timbreWeight: 79 , airiness: 33 , raspiness: 3  , tessituraSpan: 52  },
  { name: "Ava Max"                              , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2020s", timbreWeight: 84 , airiness: 33 , raspiness: 2  , tessituraSpan: 54  },
  { name: "Ice Spice"                            , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2020s", timbreWeight: 82 , airiness: 26 , raspiness: 1  , tessituraSpan: 45  },
  { name: "Latto"                                , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2020s", timbreWeight: 87 , airiness: 24 , raspiness: 10 , tessituraSpan: 48  },
  { name: "Nicki Minaj"                          , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2020s", timbreWeight: 86 , airiness: 23 , raspiness: 1  , tessituraSpan: 49  },
  { name: "Cardi B"                              , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2020s", timbreWeight: 60 , airiness: 5  , raspiness: 50 , tessituraSpan: 24  },
  { name: "Megan Thee Stallion"                  , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2020s", timbreWeight: 80 , airiness: 26 , raspiness: 1  , tessituraSpan: 54  },
  { name: "GloRilla"                             , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2020s", timbreWeight: 77 , airiness: 26 , raspiness: 11 , tessituraSpan: 45  },
  { name: "Flo Milli"                            , gender: "female", vocalFach: "mezzo_soprano", genre: "Pop" , region: "western", decade: "2020s", timbreWeight: 78 , airiness: 23 , raspiness: 3  , tessituraSpan: 52  },
  // ─── Зарубежные женские 2020-х — рок ───
  { name: "Courtney LaPlante (Spiritbox)"        , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "2020s", timbreWeight: 82 , airiness: 12 , raspiness: 32 , tessituraSpan: 73  },
  { name: "Poppy"                                , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "2020s", timbreWeight: 84 , airiness: 21 , raspiness: 24 , tessituraSpan: 75  },
  { name: "Tatiana Shmayluk (Jinjer)"            , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "2020s", timbreWeight: 83 , airiness: 14 , raspiness: 25 , tessituraSpan: 67  },
  { name: "Rhian Teasdale (Wet Leg)"             , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "2020s", timbreWeight: 81 , airiness: 18 , raspiness: 27 , tessituraSpan: 76  },
  { name: "Willow"                               , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "2020s", timbreWeight: 78 , airiness: 13 , raspiness: 27 , tessituraSpan: 67  },
  { name: "Alissa White-Gluz"                    , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "2020s", timbreWeight: 79 , airiness: 12 , raspiness: 24 , tessituraSpan: 67  },
  { name: "Dorothy Martin"                       , gender: "female", vocalFach: "mezzo_soprano", genre: "Rock", region: "western", decade: "2020s", timbreWeight: 81 , airiness: 18 , raspiness: 33 , tessituraSpan: 70  },
  // ─── Зарубежные мужские 90-х — поп ───
  { name: "Michael Jackson"                      , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 95 , airiness: 38 , raspiness: 12 , tessituraSpan: 88  },
  { name: "George Michael"                       , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 74 , airiness: 26 , raspiness: 20 , tessituraSpan: 58  },
  { name: "Prince"                               , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 90 , airiness: 30 , raspiness: 18 , tessituraSpan: 70  },
  { name: "Elton John"                           , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 85 , airiness: 22 , raspiness: 10 , tessituraSpan: 61  },
  { name: "Sting"                                , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 89 , airiness: 23 , raspiness: 12 , tessituraSpan: 58  },
  { name: "Bryan Adams"                          , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 80 , airiness: 19 , raspiness: 5  , tessituraSpan: 62  },
  { name: "Phil Collins"                         , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 83 , airiness: 17 , raspiness: 4  , tessituraSpan: 60  },
  { name: "Seal"                                 , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 82 , airiness: 23 , raspiness: 12 , tessituraSpan: 57  },
  { name: "Ricky Martin"                         , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 79 , airiness: 21 , raspiness: 10 , tessituraSpan: 62  },
  { name: "Enrique Iglesias"                     , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 80 , airiness: 17 , raspiness: 6  , tessituraSpan: 62  },
  { name: "Marc Anthony"                         , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 80 , airiness: 18 , raspiness: 5  , tessituraSpan: 62  },
  { name: "Wanya Morris (Boyz II Men)"           , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 83 , airiness: 26 , raspiness: 9  , tessituraSpan: 53  },
  { name: "Nick Carter"                          , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 89 , airiness: 19 , raspiness: 3  , tessituraSpan: 61  },
  { name: "JC Chasez"                            , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 89 , airiness: 19 , raspiness: 8  , tessituraSpan: 54  },
  { name: "Darren Hayes"                         , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 87 , airiness: 19 , raspiness: 7  , tessituraSpan: 58  },
  { name: "Haddaway"                             , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 85 , airiness: 22 , raspiness: 8  , tessituraSpan: 58  },
  { name: "Michael Bolton"                       , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 89 , airiness: 17 , raspiness: 8  , tessituraSpan: 58  },
  { name: "Richard Marx"                         , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 81 , airiness: 22 , raspiness: 12 , tessituraSpan: 58  },
  { name: "Peabo Bryson"                         , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 80 , airiness: 26 , raspiness: 4  , tessituraSpan: 59  },
  { name: "Luther Vandross"                      , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 83 , airiness: 26 , raspiness: 10 , tessituraSpan: 53  },
  { name: "Babyface"                             , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 85 , airiness: 21 , raspiness: 7  , tessituraSpan: 61  },
  { name: "Ginuwine"                             , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 87 , airiness: 27 , raspiness: 5  , tessituraSpan: 56  },
  { name: "Montell Jordan"                       , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 79 , airiness: 23 , raspiness: 3  , tessituraSpan: 58  },
  { name: "Brian McKnight"                       , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 80 , airiness: 20 , raspiness: 7  , tessituraSpan: 59  },
  { name: "Jon Secada"                           , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 84 , airiness: 23 , raspiness: 13 , tessituraSpan: 61  },
  { name: "Mick Hucknall"                        , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 87 , airiness: 21 , raspiness: 6  , tessituraSpan: 57  },
  { name: "Billy Joel"                           , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 86 , airiness: 19 , raspiness: 13 , tessituraSpan: 59  },
  { name: "Rod Stewart"                          , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 83 , airiness: 27 , raspiness: 6  , tessituraSpan: 62  },
  { name: "Meat Loaf"                            , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 88 , airiness: 20 , raspiness: 9  , tessituraSpan: 57  },
  { name: "Jon B"                                , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "1990s", timbreWeight: 85 , airiness: 24 , raspiness: 11 , tessituraSpan: 60  },
  // ─── Зарубежные мужские 90-х — рок ───
  { name: "Kurt Cobain"                          , gender: "male"  , vocalFach: "bass_baritone", genre: "Rock", region: "western", decade: "1990s", timbreWeight: 48 , airiness: 16 , raspiness: 92 , tessituraSpan: 52  },
  { name: "Eddie Vedder"                         , gender: "male"  , vocalFach: "bass_baritone", genre: "Rock", region: "western", decade: "1990s", timbreWeight: 24 , airiness: 18 , raspiness: 42 , tessituraSpan: 50  },
  { name: "Chris Cornell"                        , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "1990s", timbreWeight: 60 , airiness: 12 , raspiness: 58 , tessituraSpan: 82  },
  { name: "Axl Rose"                             , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "1990s", timbreWeight: 74 , airiness: 12 , raspiness: 72 , tessituraSpan: 86  },
  { name: "Freddie Mercury"                      , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "1990s", timbreWeight: 70 , airiness: 6  , raspiness: 42 , tessituraSpan: 94  },
  { name: "Robert Plant"                         , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "1990s", timbreWeight: 86 , airiness: 20 , raspiness: 38 , tessituraSpan: 90  },
  { name: "Mick Jagger"                          , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "1990s", timbreWeight: 58 , airiness: 22 , raspiness: 52 , tessituraSpan: 55  },
  { name: "Paul McCartney"                       , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "1990s", timbreWeight: 74 , airiness: 16 , raspiness: 8  , tessituraSpan: 58  },
  { name: "David Bowie"                          , gender: "male"  , vocalFach: "bass_baritone", genre: "Rock", region: "western", decade: "1990s", timbreWeight: 42 , airiness: 22 , raspiness: 12 , tessituraSpan: 70  },
  { name: "Billie Joe Armstrong"                 , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "1990s", timbreWeight: 64 , airiness: 20 , raspiness: 44 , tessituraSpan: 50  },
  { name: "James Hetfield"                       , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "1990s", timbreWeight: 75 , airiness: 5  , raspiness: 50 , tessituraSpan: 87  },
  { name: "Bruce Dickinson"                      , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "1990s", timbreWeight: 69 , airiness: 15 , raspiness: 44 , tessituraSpan: 77  },
  { name: "Ozzy Osbourne"                        , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "1990s", timbreWeight: 77 , airiness: 11 , raspiness: 48 , tessituraSpan: 77  },
  { name: "Trent Reznor"                         , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "1990s", timbreWeight: 67 , airiness: 7  , raspiness: 50 , tessituraSpan: 87  },
  { name: "Maynard James Keenan"                 , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "1990s", timbreWeight: 70 , airiness: 10 , raspiness: 44 , tessituraSpan: 83  },
  { name: "Serj Tankian"                         , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "1990s", timbreWeight: 72 , airiness: 8  , raspiness: 47 , tessituraSpan: 84  },
  { name: "Jonathan Davis"                       , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "1990s", timbreWeight: 69 , airiness: 11 , raspiness: 47 , tessituraSpan: 82  },
  { name: "Anthony Kiedis"                       , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "1990s", timbreWeight: 73 , airiness: 5  , raspiness: 47 , tessituraSpan: 80  },
  { name: "Dave Grohl"                           , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "1990s", timbreWeight: 75 , airiness: 15 , raspiness: 49 , tessituraSpan: 80  },
  { name: "Scott Weiland"                        , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "1990s", timbreWeight: 70 , airiness: 13 , raspiness: 44 , tessituraSpan: 83  },
  { name: "Layne Staley"                         , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "1990s", timbreWeight: 74 , airiness: 5  , raspiness: 43 , tessituraSpan: 79  },
  { name: "Zack de la Rocha"                     , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "1990s", timbreWeight: 74 , airiness: 10 , raspiness: 43 , tessituraSpan: 79  },
  { name: "Thom Yorke"                           , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "1990s", timbreWeight: 70 , airiness: 8  , raspiness: 53 , tessituraSpan: 87  },
  { name: "Liam Gallagher"                       , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "1990s", timbreWeight: 76 , airiness: 7  , raspiness: 48 , tessituraSpan: 85  },
  { name: "Damon Albarn"                         , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "1990s", timbreWeight: 71 , airiness: 8  , raspiness: 43 , tessituraSpan: 85  },
  { name: "Billy Corgan"                         , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "1990s", timbreWeight: 70 , airiness: 12 , raspiness: 47 , tessituraSpan: 87  },
  { name: "Dexter Holland"                       , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "1990s", timbreWeight: 70 , airiness: 5  , raspiness: 50 , tessituraSpan: 85  },
  { name: "Tom DeLonge"                          , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "1990s", timbreWeight: 70 , airiness: 7  , raspiness: 48 , tessituraSpan: 79  },
  { name: "Scott Stapp"                          , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "1990s", timbreWeight: 77 , airiness: 13 , raspiness: 49 , tessituraSpan: 84  },
  { name: "Lenny Kravitz"                        , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "1990s", timbreWeight: 76 , airiness: 5  , raspiness: 47 , tessituraSpan: 82  },
  // ─── Зарубежные мужские 2000-х — поп ───
  { name: "Justin Timberlake"                    , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 80 , airiness: 28 , raspiness: 4  , tessituraSpan: 60  },
  { name: "Usher"                                , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 80 , airiness: 27 , raspiness: 5  , tessituraSpan: 56  },
  { name: "Ne-Yo"                                , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 84 , airiness: 26 , raspiness: 7  , tessituraSpan: 60  },
  { name: "Chris Brown"                          , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 89 , airiness: 23 , raspiness: 13 , tessituraSpan: 55  },
  { name: "Jason Derulo"                         , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 87 , airiness: 27 , raspiness: 5  , tessituraSpan: 56  },
  { name: "Adam Levine"                          , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 92 , airiness: 18 , raspiness: 16 , tessituraSpan: 68  },
  { name: "John Legend"                          , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 89 , airiness: 25 , raspiness: 12 , tessituraSpan: 53  },
  { name: "Robin Thicke"                         , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 86 , airiness: 25 , raspiness: 3  , tessituraSpan: 62  },
  { name: "Akon"                                 , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 80 , airiness: 18 , raspiness: 5  , tessituraSpan: 61  },
  { name: "Sean Paul"                            , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 79 , airiness: 23 , raspiness: 5  , tessituraSpan: 60  },
  { name: "Pitbull"                              , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 79 , airiness: 25 , raspiness: 8  , tessituraSpan: 60  },
  { name: "Craig David"                          , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 81 , airiness: 18 , raspiness: 12 , tessituraSpan: 63  },
  { name: "Daniel Bedingfield"                   , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 89 , airiness: 23 , raspiness: 10 , tessituraSpan: 60  },
  { name: "James Blunt"                          , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 86 , airiness: 19 , raspiness: 5  , tessituraSpan: 63  },
  { name: "Daniel Powter"                        , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 83 , airiness: 24 , raspiness: 10 , tessituraSpan: 56  },
  { name: "Jason Mraz"                           , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 79 , airiness: 19 , raspiness: 12 , tessituraSpan: 57  },
  { name: "John Mayer"                           , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 86 , airiness: 22 , raspiness: 10 , tessituraSpan: 53  },
  { name: "Ryan Tedder"                          , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 87 , airiness: 27 , raspiness: 5  , tessituraSpan: 59  },
  { name: "Clay Aiken"                           , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 80 , airiness: 25 , raspiness: 11 , tessituraSpan: 54  },
  { name: "Mario"                                , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 83 , airiness: 22 , raspiness: 5  , tessituraSpan: 63  },
  { name: "Trey Songz"                           , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 82 , airiness: 26 , raspiness: 3  , tessituraSpan: 61  },
  { name: "Miguel"                               , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 86 , airiness: 27 , raspiness: 13 , tessituraSpan: 61  },
  { name: "Taio Cruz"                            , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 83 , airiness: 24 , raspiness: 3  , tessituraSpan: 59  },
  { name: "Flo Rida"                             , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 82 , airiness: 19 , raspiness: 11 , tessituraSpan: 63  },
  { name: "T-Pain"                               , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 80 , airiness: 23 , raspiness: 9  , tessituraSpan: 61  },
  { name: "Howie Day"                            , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 86 , airiness: 18 , raspiness: 13 , tessituraSpan: 60  },
  { name: "Ruben Studdard"                       , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 86 , airiness: 20 , raspiness: 8  , tessituraSpan: 60  },
  { name: "The-Dream"                            , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 86 , airiness: 25 , raspiness: 7  , tessituraSpan: 58  },
  { name: "Omarion"                              , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 80 , airiness: 19 , raspiness: 9  , tessituraSpan: 53  },
  { name: "Bow Wow"                              , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2000s", timbreWeight: 80 , airiness: 19 , raspiness: 11 , tessituraSpan: 56  },
  // ─── Зарубежные мужские 2000-х — рок ───
  { name: "Chester Bennington"                   , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2000s", timbreWeight: 66 , airiness: 10 , raspiness: 90 , tessituraSpan: 80  },
  { name: "Brandon Flowers"                      , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2000s", timbreWeight: 68 , airiness: 8  , raspiness: 79 , tessituraSpan: 68  },
  { name: "Julian Casablancas"                   , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2000s", timbreWeight: 59 , airiness: 9  , raspiness: 78 , tessituraSpan: 72  },
  { name: "Alex Turner"                          , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2000s", timbreWeight: 61 , airiness: 10 , raspiness: 74 , tessituraSpan: 75  },
  { name: "Matt Bellamy"                         , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2000s", timbreWeight: 63 , airiness: 16 , raspiness: 74 , tessituraSpan: 73  },
  { name: "Chris Martin"                         , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2000s", timbreWeight: 68 , airiness: 15 , raspiness: 74 , tessituraSpan: 76  },
  { name: "Patrick Stump"                        , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2000s", timbreWeight: 61 , airiness: 15 , raspiness: 75 , tessituraSpan: 77  },
  { name: "Gerard Way"                           , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2000s", timbreWeight: 61 , airiness: 15 , raspiness: 74 , tessituraSpan: 68  },
  { name: "Brendon Urie"                         , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2000s", timbreWeight: 66 , airiness: 15 , raspiness: 81 , tessituraSpan: 70  },
  { name: "Adam Gontier"                         , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2000s", timbreWeight: 62 , airiness: 16 , raspiness: 81 , tessituraSpan: 68  },
  { name: "Shaun Morgan"                         , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2000s", timbreWeight: 59 , airiness: 13 , raspiness: 75 , tessituraSpan: 74  },
  { name: "Jacoby Shaddix"                       , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2000s", timbreWeight: 65 , airiness: 10 , raspiness: 73 , tessituraSpan: 75  },
  { name: "M Shadows"                            , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2000s", timbreWeight: 63 , airiness: 9  , raspiness: 82 , tessituraSpan: 69  },
  { name: "Corey Taylor"                         , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2000s", timbreWeight: 60 , airiness: 16 , raspiness: 77 , tessituraSpan: 72  },
  { name: "David Draiman"                        , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2000s", timbreWeight: 66 , airiness: 17 , raspiness: 73 , tessituraSpan: 69  },
  { name: "Jesse Lacey"                          , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2000s", timbreWeight: 69 , airiness: 8  , raspiness: 82 , tessituraSpan: 73  },
  { name: "Benjamin Burnley"                     , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2000s", timbreWeight: 59 , airiness: 9  , raspiness: 82 , tessituraSpan: 75  },
  { name: "Chino Moreno"                         , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2000s", timbreWeight: 64 , airiness: 16 , raspiness: 75 , tessituraSpan: 74  },
  { name: "Mike Shinoda"                         , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2000s", timbreWeight: 65 , airiness: 17 , raspiness: 75 , tessituraSpan: 67  },
  { name: "Myles Kennedy"                        , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2000s", timbreWeight: 67 , airiness: 8  , raspiness: 80 , tessituraSpan: 68  },
  { name: "Josh Homme"                           , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2000s", timbreWeight: 66 , airiness: 17 , raspiness: 81 , tessituraSpan: 68  },
  { name: "Jack White"                           , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2000s", timbreWeight: 66 , airiness: 17 , raspiness: 81 , tessituraSpan: 70  },
  { name: "Jared Leto"                           , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2000s", timbreWeight: 65 , airiness: 13 , raspiness: 74 , tessituraSpan: 73  },
  { name: "Bert McCracken"                       , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2000s", timbreWeight: 63 , airiness: 7  , raspiness: 81 , tessituraSpan: 73  },
  { name: "Vic Fuentes"                          , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2000s", timbreWeight: 68 , airiness: 17 , raspiness: 81 , tessituraSpan: 75  },
  { name: "Andy Biersack"                        , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2000s", timbreWeight: 63 , airiness: 14 , raspiness: 74 , tessituraSpan: 77  },
  { name: "Cedric Bixler-Zavala"                 , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2000s", timbreWeight: 66 , airiness: 9  , raspiness: 80 , tessituraSpan: 75  },
  { name: "Claudio Sanchez"                      , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2000s", timbreWeight: 65 , airiness: 10 , raspiness: 80 , tessituraSpan: 69  },
  // ─── Зарубежные мужские 2010-х — поп ───
  { name: "Ed Sheeran"                           , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 72 , airiness: 32 , raspiness: 8  , tessituraSpan: 48  },
  { name: "The Weeknd"                           , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 88 , airiness: 48 , raspiness: 6  , tessituraSpan: 78  },
  { name: "Sam Smith"                            , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 70 , airiness: 58 , raspiness: 4  , tessituraSpan: 62  },
  { name: "Shawn Mendes"                         , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 76 , airiness: 36 , raspiness: 10 , tessituraSpan: 52  },
  { name: "Harry Styles"                         , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 78 , airiness: 40 , raspiness: 6  , tessituraSpan: 54  },
  { name: "Charlie Puth"                         , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 82 , airiness: 22 , raspiness: 8  , tessituraSpan: 64  },
  { name: "Niall Horan"                          , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 76 , airiness: 51 , raspiness: 9  , tessituraSpan: 51  },
  { name: "Zayn"                                 , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 74 , airiness: 52 , raspiness: 9  , tessituraSpan: 53  },
  { name: "Lewis Capaldi"                        , gender: "male"  , vocalFach: "bass_baritone", genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 38 , airiness: 26 , raspiness: 48 , tessituraSpan: 46  },
  { name: "Hozier"                               , gender: "male"  , vocalFach: "bass_baritone", genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 28 , airiness: 28 , raspiness: 18 , tessituraSpan: 58  },
  { name: "Troye Sivan"                          , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 75 , airiness: 45 , raspiness: 11 , tessituraSpan: 47  },
  { name: "Khalid"                               , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 82 , airiness: 44 , raspiness: 4  , tessituraSpan: 51  },
  { name: "Post Malone"                          , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 74 , airiness: 44 , raspiness: 1  , tessituraSpan: 51  },
  { name: "Lil Nas X"                            , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 75 , airiness: 50 , raspiness: 2  , tessituraSpan: 47  },
  { name: "Juice WRLD"                           , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 75 , airiness: 47 , raspiness: 9  , tessituraSpan: 47  },
  { name: "Drake"                                , gender: "male"  , vocalFach: "bass_baritone", genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 35 , airiness: 22 , raspiness: 8  , tessituraSpan: 40  },
  { name: "Childish Gambino"                     , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 78 , airiness: 52 , raspiness: 5  , tessituraSpan: 54  },
  { name: "Frank Ocean"                          , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 79 , airiness: 49 , raspiness: 4  , tessituraSpan: 50  },
  { name: "Anderson .Paak"                       , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 73 , airiness: 49 , raspiness: 1  , tessituraSpan: 50  },
  { name: "Justin Bieber"                        , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 90 , airiness: 52 , raspiness: 2  , tessituraSpan: 55  },
  { name: "Bruno Mars"                           , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 84 , airiness: 14 , raspiness: 28 , tessituraSpan: 72  },
  { name: "Pharrell"                             , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 76 , airiness: 45 , raspiness: 10 , tessituraSpan: 49  },
  { name: "Calum Scott"                          , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 73 , airiness: 50 , raspiness: 8  , tessituraSpan: 45  },
  { name: "James Arthur"                         , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 81 , airiness: 46 , raspiness: 5  , tessituraSpan: 47  },
  { name: "Olly Alexander"                       , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 76 , airiness: 51 , raspiness: 11 , tessituraSpan: 51  },
  { name: "Tom Grennan"                          , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 80 , airiness: 46 , raspiness: 2  , tessituraSpan: 51  },
  { name: "Alec Benjamin"                        , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 78 , airiness: 51 , raspiness: 2  , tessituraSpan: 50  },
  { name: "Bazzi"                                , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 73 , airiness: 49 , raspiness: 4  , tessituraSpan: 45  },
  { name: "Lauv"                                 , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 74 , airiness: 49 , raspiness: 3  , tessituraSpan: 55  },
  { name: "Ali Gatie"                            , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2010s", timbreWeight: 79 , airiness: 50 , raspiness: 6  , tessituraSpan: 48  },
  // ─── Зарубежные мужские 2010-х — рок ───
  { name: "Dan Reynolds (Imagine Dragons)"       , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2010s", timbreWeight: 68 , airiness: 24 , raspiness: 62 , tessituraSpan: 60  },
  { name: "Tyler Joseph"                         , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2010s", timbreWeight: 72 , airiness: 26 , raspiness: 16 , tessituraSpan: 49  },
  { name: "Matt Healy"                           , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2010s", timbreWeight: 69 , airiness: 27 , raspiness: 14 , tessituraSpan: 47  },
  { name: "Dave Bayley"                          , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2010s", timbreWeight: 71 , airiness: 28 , raspiness: 8  , tessituraSpan: 52  },
  { name: "Kevin Parker"                         , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2010s", timbreWeight: 75 , airiness: 31 , raspiness: 14 , tessituraSpan: 52  },
  { name: "Win Butler"                           , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2010s", timbreWeight: 72 , airiness: 26 , raspiness: 8  , tessituraSpan: 52  },
  { name: "Matt Berninger"                       , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2010s", timbreWeight: 73 , airiness: 31 , raspiness: 14 , tessituraSpan: 51  },
  { name: "Oliver Sykes"                         , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2010s", timbreWeight: 68 , airiness: 27 , raspiness: 12 , tessituraSpan: 47  },
  { name: "Sam Fender"                           , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2010s", timbreWeight: 68 , airiness: 29 , raspiness: 7  , tessituraSpan: 51  },
  { name: "Declan McKenna"                       , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2010s", timbreWeight: 75 , airiness: 29 , raspiness: 7  , tessituraSpan: 47  },
  { name: "Luke Hemmings"                        , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2010s", timbreWeight: 73 , airiness: 33 , raspiness: 12 , tessituraSpan: 50  },
  { name: "Yannis Philippakis"                   , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2010s", timbreWeight: 68 , airiness: 32 , raspiness: 7  , tessituraSpan: 48  },
  { name: "Yungblud"                             , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2010s", timbreWeight: 67 , airiness: 35 , raspiness: 10 , tessituraSpan: 47  },
  { name: "Machine Gun Kelly"                    , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2010s", timbreWeight: 74 , airiness: 26 , raspiness: 10 , tessituraSpan: 43  },
  { name: "Conor Mason"                          , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2010s", timbreWeight: 67 , airiness: 30 , raspiness: 17 , tessituraSpan: 50  },
  { name: "Mike Kerr"                            , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2010s", timbreWeight: 73 , airiness: 35 , raspiness: 16 , tessituraSpan: 47  },
  { name: "Johnny Stevens"                       , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2010s", timbreWeight: 67 , airiness: 35 , raspiness: 10 , tessituraSpan: 50  },
  { name: "Grian Chatten"                        , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2010s", timbreWeight: 70 , airiness: 27 , raspiness: 17 , tessituraSpan: 43  },
  { name: "Isaac Brock"                          , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2010s", timbreWeight: 65 , airiness: 27 , raspiness: 9  , tessituraSpan: 48  },
  { name: "Jeff Tweedy"                          , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2010s", timbreWeight: 75 , airiness: 33 , raspiness: 9  , tessituraSpan: 50  },
  // ─── Зарубежные мужские 2020-х — поп ───
  { name: "Bad Bunny"                            , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2020s", timbreWeight: 76 , airiness: 44 , raspiness: 5  , tessituraSpan: 54  },
  { name: "Jungkook"                             , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2020s", timbreWeight: 79 , airiness: 44 , raspiness: 5  , tessituraSpan: 45  },
  { name: "V (BTS)"                              , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2020s", timbreWeight: 74 , airiness: 45 , raspiness: 8  , tessituraSpan: 49  },
  { name: "Jimin"                                , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2020s", timbreWeight: 82 , airiness: 43 , raspiness: 6  , tessituraSpan: 48  },
  { name: "Burna Boy"                            , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2020s", timbreWeight: 78 , airiness: 46 , raspiness: 5  , tessituraSpan: 46  },
  { name: "Rema"                                 , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2020s", timbreWeight: 73 , airiness: 45 , raspiness: 10 , tessituraSpan: 51  },
  { name: "Fireboy DML"                          , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2020s", timbreWeight: 73 , airiness: 46 , raspiness: 5  , tessituraSpan: 55  },
  { name: "Central Cee"                          , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2020s", timbreWeight: 78 , airiness: 51 , raspiness: 2  , tessituraSpan: 55  },
  { name: "Teddy Swims"                          , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2020s", timbreWeight: 82 , airiness: 53 , raspiness: 6  , tessituraSpan: 47  },
  { name: "Benson Boone"                         , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2020s", timbreWeight: 77 , airiness: 46 , raspiness: 3  , tessituraSpan: 54  },
  { name: "Peso Pluma"                           , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2020s", timbreWeight: 73 , airiness: 49 , raspiness: 11 , tessituraSpan: 53  },
  { name: "d4vd"                                 , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2020s", timbreWeight: 82 , airiness: 51 , raspiness: 2  , tessituraSpan: 45  },
  { name: "The Kid LAROI"                        , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2020s", timbreWeight: 75 , airiness: 44 , raspiness: 8  , tessituraSpan: 45  },
  { name: "Jack Harlow"                          , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2020s", timbreWeight: 76 , airiness: 52 , raspiness: 4  , tessituraSpan: 45  },
  { name: "Joji"                                 , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2020s", timbreWeight: 76 , airiness: 47 , raspiness: 6  , tessituraSpan: 53  },
  { name: "Giveon"                               , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2020s", timbreWeight: 80 , airiness: 46 , raspiness: 8  , tessituraSpan: 48  },
  { name: "Brent Faiyaz"                         , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2020s", timbreWeight: 75 , airiness: 48 , raspiness: 6  , tessituraSpan: 45  },
  { name: "Steve Lacy"                           , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2020s", timbreWeight: 83 , airiness: 43 , raspiness: 9  , tessituraSpan: 54  },
  { name: "Dominic Fike"                         , gender: "male"  , vocalFach: "tenor"        , genre: "Pop" , region: "western", decade: "2020s", timbreWeight: 74 , airiness: 52 , raspiness: 4  , tessituraSpan: 48  },
  // ─── Зарубежные мужские 2020-х — рок ───
  { name: "Damiano David"                        , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2020s", timbreWeight: 78 , airiness: 18 , raspiness: 44 , tessituraSpan: 74  },
  { name: "Josh Kiszka"                          , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2020s", timbreWeight: 82 , airiness: 16 , raspiness: 32 , tessituraSpan: 88  },
  { name: "Vessel (Sleep Token)"                 , gender: "male"  , vocalFach: "bass_baritone", genre: "Rock", region: "western", decade: "2020s", timbreWeight: 52 , airiness: 62 , raspiness: 28 , tessituraSpan: 52  },
  { name: "Noah Sebastian"                       , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2020s", timbreWeight: 75 , airiness: 12 , raspiness: 51 , tessituraSpan: 85  },
  { name: "Will Ramos"                           , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2020s", timbreWeight: 71 , airiness: 8  , raspiness: 52 , tessituraSpan: 86  },
  { name: "Brendan Yates"                        , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2020s", timbreWeight: 68 , airiness: 15 , raspiness: 43 , tessituraSpan: 86  },
  { name: "Joe Talbot"                           , gender: "male"  , vocalFach: "tenor"        , genre: "Rock", region: "western", decade: "2020s", timbreWeight: 71 , airiness: 13 , raspiness: 52 , tessituraSpan: 83  },
];

export const CELEBRITIES_DB: CelebrityProfile[] = RAW_ENTRIES.map((entry) => ({
  id: slugify(entry.name),
  ...entry,
}));

const MALE_FACHES: VocalFach[] = ["bass_baritone", "tenor"];
const FEMALE_FACHES: VocalFach[] = ["contralto", "mezzo_soprano"];
const DECADES: CelebrityDecade[] = ["1990s", "2000s", "2010s", "2020s"];

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
    if (!DECADES.includes(c.decade)) {
      throw new Error(`celebritiesDB: ${c.name} has invalid decade ${c.decade}`);
    }
    if (c.genre !== "Pop" && c.genre !== "Rock") {
      throw new Error(`celebritiesDB: ${c.name} has invalid genre ${c.genre}`);
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
  /** Final distance: required 3-D distance plus separate soft fach prior. */
  distance: number;
  /** UX-calibrated score; eligible candidates are always in [70,96]. */
  percent: number;
  /** Monotonic raw distance similarity, before UX recalibration. */
  rawPercent: number;
  /** True when the separate soft fach distance prior was applied. */
  fachMismatch?: boolean;
};

/**
 * Maximum Euclidean distance in the 0-100 cube (legacy 3-axis helper):
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

export type DistanceOptions = {
  /** Optional fach used only by the separate soft prior, never as a 4th axis. */
  userFach?: VocalFach | null;
};

/**
 * Required 3-D weighted Euclidean distance on consistent 0–100 axes:
 *
 *   d3 = sqrt(0.6·Δt² + 0.2·Δa² + 0.2·Δr²)
 *
 * `tessituraSpan` is intentionally excluded: it may inform fach elsewhere but
 * must not silently distort the requested 60/20/20 geometry.
 */
export function weightedDistance(
  user: TimbreVector,
  star: CelebrityProfile,
  _options?: DistanceOptions
): number {
  const dt = user.timbreWeight - star.timbreWeight;
  const da = user.airiness - star.airiness;
  const dr = user.raspiness - star.raspiness;
  return Math.sqrt(
    AXIS_WEIGHTS.timbreWeight * dt * dt +
      AXIS_WEIGHTS.airiness * da * da +
      AXIS_WEIGHTS.raspiness * dr * dr
  );
}

/**
 * Raw final distance → raw similarity:
 *   s_raw(d) = exp(-d / 30)
 * This is strictly monotonic for finite d≥0 and is used for diagnostics and
 * garbage rejection only; UX percentages are calibrated separately.
 */
export const DISTANCE_PERCENT_TAU = 30;

export function distanceToPercent(distance: number): number {
  if (!Number.isFinite(distance) || distance <= 0) return 100;
  return Math.max(
    0,
    Math.min(100, Math.round(100 * Math.exp(-distance / DISTANCE_PERCENT_TAU)))
  );
}

/**
 * Reject candidates beyond 32 weighted points before any UX inflation. This
 * means the weighted RMS feature mismatch is greater than 32% of an axis and
 * prevents sparse era/genre cells from promoting unrelated voices.
 */
export const RAW_DISTANCE_GARBAGE_THRESHOLD = 32;
export const RECALIBRATION_BEST_MIN_PERCENT = 85;
export const RECALIBRATION_BEST_MAX_PERCENT = 96;
export const RECALIBRATION_OTHERS_MIN_PERCENT = 70;
export const RECALIBRATION_OTHERS_MAX_PERCENT = 85;

/**
 * Global eligible-cohort recalibration. The best maps to 85–96 according to
 * its raw similarity; every remaining eligible candidate maps monotonically
 * to 70–85 relative to best and the garbage boundary. No bucket is calibrated
 * independently, so sparse cells cannot manufacture an 85% result.
 */
export function recalibrateEligiblePercents(
  matches: CelebrityMatch[]
): CelebrityMatch[] {
  if (matches.length === 0) return matches;
  const bestDistance = matches[0]?.distance ?? RAW_DISTANCE_GARBAGE_THRESHOLD;
  const bestRaw = Math.max(0, Math.min(100, matches[0]?.rawPercent ?? 0));
  const bestPercent = Math.round(
    RECALIBRATION_BEST_MIN_PERCENT +
      (RECALIBRATION_BEST_MAX_PERCENT - RECALIBRATION_BEST_MIN_PERCENT) *
        (bestRaw / 100)
  );
  const denominator = Math.max(
    Number.EPSILON,
    RAW_DISTANCE_GARBAGE_THRESHOLD - bestDistance
  );

  return matches.map((match, index) => {
    if (index === 0) return { ...match, percent: bestPercent };
    const relative = Math.max(
      0,
      Math.min(
        1,
        (RAW_DISTANCE_GARBAGE_THRESHOLD - match.distance) / denominator
      )
    );
    return {
      ...match,
      percent: Math.round(
        RECALIBRATION_OTHERS_MIN_PERCENT +
          (RECALIBRATION_OTHERS_MAX_PERCENT -
            RECALIBRATION_OTHERS_MIN_PERCENT) *
            relative
      ),
    };
  });
}

/** Gender-only filter — opposite gender is excluded entirely. */
export function filterCelebritiesByGender(
  gender: CelebrityGender
): CelebrityProfile[] {
  return CELEBRITIES_DB.filter((c) => c.gender === gender);
}

/**
 * @deprecated Hard fach filter — kept for older callers/tests. Prefer
 * `filterCelebritiesByGender` + soft fach via `matchCelebrities`.
 */
export function filterCelebrities(
  gender: CelebrityGender,
  fach: VocalFach
): CelebrityProfile[] {
  return CELEBRITIES_DB.filter((c) => c.gender === gender && c.vocalFach === fach);
}

/**
 * Rank an already-filtered pool by final distance. Garbage rejection and UX
 * calibration happen after this raw ranking.
 */
export function rankCelebrities(
  pool: CelebrityProfile[],
  user: TimbreVector,
  options?: DistanceOptions
): CelebrityMatch[] {
  return pool
    .map((celebrity) => {
      const baseDistance = weightedDistance(user, celebrity, options);
      const fachMismatch = Boolean(
        options?.userFach && celebrity.vocalFach !== options.userFach
      );
      const distance =
        baseDistance + (fachMismatch ? FACH_MISMATCH_PENALTY : 0);
      const rawPercent = distanceToPercent(distance);
      const percent = rawPercent;
      return { celebrity, distance, percent, rawPercent, fachMismatch };
    })
    .sort((a, b) =>
      a.distance === b.distance
        ? a.celebrity.id.localeCompare(b.celebrity.id)
        : a.distance - b.distance
    );
}

export type MatchCelebritiesOptions = DistanceOptions;

/**
 * Commercial matcher: gender-only pool → 3-D distance + fach prior → raw
 * garbage rejection → one global eligible-cohort UX recalibration.
 */
export function matchCelebrities(
  gender: CelebrityGender,
  user: TimbreVector,
  options?: MatchCelebritiesOptions
): CelebrityMatch[] {
  const ranked = rankCelebrities(filterCelebritiesByGender(gender), user, {
    userFach: options?.userFach,
  });
  const eligible = ranked.filter(
    (match) => match.distance <= RAW_DISTANCE_GARBAGE_THRESHOLD
  );
  return recalibrateEligiblePercents(eligible);
}

/**
 * Groups an already filtered + ranked match list by `celebrity.genre`, keeping
 * only the top `perGenreLimit` (default 5) eligible candidates per genre.
 * Never pads a sparse cell with rejected candidates.
 */
export function groupMatchesByGenre(
  matches: CelebrityMatch[],
  perGenreLimit = 5,
  minPercent = MIN_DISPLAY_PERCENT
): Partial<Record<Genre, CelebrityMatch[]>> {
  return fillGenreBuckets(matches, perGenreLimit, minPercent);
}

function fillGenreBuckets(
  matches: CelebrityMatch[],
  perGenreLimit: number,
  minPercent: number
): Partial<Record<Genre, CelebrityMatch[]>> {
  const groups: Partial<Record<Genre, CelebrityMatch[]>> = {};
  for (const match of matches) {
    const genre = match.celebrity.genre;
    if (match.percent >= minPercent) {
      const bucket = groups[genre] ?? (groups[genre] = []);
      if (bucket.length < perGenreLimit) bucket.push(match);
    }
  }
  return groups;
}

export type RegionGenreGroups = Partial<
  Record<CelebrityRegion, Partial<Record<Genre, CelebrityMatch[]>>>
>;

/** Same as `groupMatchesByGenre`, but split Россия / Зарубежье first. */
export function groupMatchesByRegionAndGenre(
  matches: CelebrityMatch[],
  perLimit = 5,
  minPercent = MIN_DISPLAY_PERCENT
): RegionGenreGroups {
  const out: RegionGenreGroups = {};
  for (const region of CELEBRITY_REGIONS) {
    const regionMatches = matches.filter((m) => m.celebrity.region === region);
    const genres = fillGenreBuckets(regionMatches, perLimit, minPercent);
    if (Object.keys(genres).length > 0) out[region] = genres;
  }
  return out;
}

export type DecadeGenreGroups = Partial<
  Record<CelebrityDecade, Partial<Record<Genre, CelebrityMatch[]>>>
>;

/**
 * Display grouping for the twin-result UI: era × genre, up to top-N eligible
 * candidates per cell. Empty eras/genres are omitted; no garbage padding.
 */
export function groupMatchesByDecadeAndGenre(
  matches: CelebrityMatch[],
  perGenreLimit = 5,
  minPercent = MIN_DISPLAY_PERCENT
): DecadeGenreGroups {
  const out: DecadeGenreGroups = {};
  for (const decade of CELEBRITY_DECADES) {
    const decadeMatches = matches.filter((m) => m.celebrity.decade === decade);
    const genres = fillGenreBuckets(decadeMatches, perGenreLimit, minPercent);
    if (Object.keys(genres).length > 0) out[decade] = genres;
  }
  return out;
}

/** Alias of `groupMatchesByGenre` — top-N per genre (5 if enough, else all). */
export const topMatchesPerGenre = groupMatchesByGenre;
