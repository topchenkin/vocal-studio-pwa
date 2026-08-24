import {
  CELEBRITIES_DB,
  classifyVocalFach,
  type CelebrityGender,
  type CelebrityProfile,
  type CelebrityRegion,
  type Genre,
  type VocalFach,
} from "./celebritiesDB";

export type FeatureBin = "low" | "mid" | "high";
export type PitchHeight = "low" | "mid" | "high";

/** Stable thirds on every normalized 0–100 timbre axis. */
export const FEATURE_BIN_MID_START = 34;
export const FEATURE_BIN_HIGH_START = 67;

export const COLOUR_LABEL_RU: Record<FeatureBin, string> = {
  low: "Глухой / плотный / тёмный",
  mid: "Сбалансированный",
  high: "Яркий / звонкий",
};

export const RASP_LABEL_RU: Record<FeatureBin, string> = {
  low: "Чистый",
  mid: "С лёгкой хрипотцой",
  high: "Выраженная хрипотца",
};

export const PITCH_HEIGHT_LABEL_RU: Record<PitchHeight, string> = {
  low: "Низкая",
  mid: "Средняя",
  high: "Высокая",
};

/**
 * Median-F0 display bands. Fach still uses its own 165/220 Hz boundaries;
 * these wider bands provide a readable low/mid/high description of this take.
 */
export const PITCH_HEIGHT_BOUNDS_HZ: Record<
  CelebrityGender,
  { mid: number; high: number }
> = {
  male: { mid: 130, high: 190 },
  female: { mid: 190, high: 260 },
};

export function featureBin(value: number): FeatureBin {
  const normalized = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  if (normalized < FEATURE_BIN_MID_START) return "low";
  if (normalized < FEATURE_BIN_HIGH_START) return "mid";
  return "high";
}

export function pitchHeight(
  gender: CelebrityGender,
  medianHz: number
): PitchHeight {
  const { mid, high } = PITCH_HEIGHT_BOUNDS_HZ[gender];
  if (medianHz < mid) return "low";
  if (medianHz < high) return "mid";
  return "high";
}

const FACH_NAME_LOWER_RU: Record<VocalFach, string> = {
  bass_baritone: "бас-баритон",
  tenor: "тенор",
  contralto: "контральто",
  mezzo_soprano: "меццо-сопрано",
};

/**
 * Category-only naming matrix. No score, probability or biometric identity is
 * inferred: the adjective describes the brightness/texture bins of this take.
 */
const ARCHETYPE_ADJECTIVE: Record<
  FeatureBin,
  Record<FeatureBin, string>
> = {
  low: {
    low: "Бархатный",
    mid: "Драматический",
    high: "Хриплый",
  },
  mid: {
    low: "Лирический",
    mid: "Характерный",
    high: "Роковый",
  },
  high: {
    low: "Звонкий",
    mid: "Экспрессивный",
    high: "Драйвовый",
  },
};

export function archetypeName(
  fach: VocalFach,
  brightness: FeatureBin,
  rasp: FeatureBin
): string {
  return `${ARCHETYPE_ADJECTIVE[brightness][rasp]} ${FACH_NAME_LOWER_RU[fach]}`;
}

export type VocalArchetype = {
  fach: VocalFach;
  brightness: FeatureBin;
  rasp: FeatureBin;
  pitch: PitchHeight;
  name: string;
};

export function deriveVocalArchetype(
  gender: CelebrityGender,
  medianHz: number,
  brightnessValue: number,
  raspValue: number
): VocalArchetype {
  const fach = classifyVocalFach(gender, medianHz);
  const brightness = featureBin(brightnessValue);
  const rasp = featureBin(raspValue);
  return {
    fach,
    brightness,
    rasp,
    pitch: pitchHeight(gender, medianHz),
    name: archetypeName(fach, brightness, rasp),
  };
}

const BIN_INDEX: Record<FeatureBin, number> = { low: 0, mid: 1, high: 2 };
const DECADE_INDEX: Record<CelebrityProfile["decade"], number> = {
  "1990s": 0,
  "2000s": 1,
  "2010s": 2,
  "2020s": 3,
};

export type RepresentativeOptions = {
  gender: CelebrityGender;
  fach: VocalFach;
  brightness: FeatureBin;
  rasp: FeatureBin;
  region: CelebrityRegion;
  genre: Genre;
  limit?: number;
};

/**
 * Curated references only. Eligibility is exact gender + Fach + region +
 * genre. Exact categorical colour/texture comes first; sparse groups fall
 * back only inside that eligible pool. Ties are recent-first then stable ID.
 */
export function selectArchetypeRepresentatives(
  options: RepresentativeOptions,
  database: CelebrityProfile[] = CELEBRITIES_DB
): CelebrityProfile[] {
  const limit = Math.max(0, Math.floor(options.limit ?? 5));
  return database
    .filter(
      (star) =>
        star.gender === options.gender &&
        star.vocalFach === options.fach &&
        star.region === options.region &&
        star.genre === options.genre
    )
    .map((star) => {
      const brightness = featureBin(star.timbreWeight);
      const rasp = featureBin(star.raspiness);
      const categoryDistance =
        Math.abs(BIN_INDEX[brightness] - BIN_INDEX[options.brightness]) +
        Math.abs(BIN_INDEX[rasp] - BIN_INDEX[options.rasp]);
      return { star, categoryDistance };
    })
    .sort(
      (a, b) =>
        a.categoryDistance - b.categoryDistance ||
        DECADE_INDEX[b.star.decade] - DECADE_INDEX[a.star.decade] ||
        a.star.id.localeCompare(b.star.id)
    )
    .slice(0, limit)
    .map(({ star }) => star);
}
