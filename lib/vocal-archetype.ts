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

export type RepresentativeOptions = {
  gender: CelebrityGender;
  fach: VocalFach;
  userWeight: number;
  userRaspiness: number;
  region: CelebrityRegion;
  genre: Genre;
  limit?: number;
};

/**
 * Weighted Euclidean distance on normalized timbre/rasp axes. Timbre is 60%
 * and rasp 40%; both therefore materially affect ordering.
 */
export function timbreDistance(
  userWeight: number,
  userRaspiness: number,
  star: Pick<CelebrityProfile, "timbreWeight" | "raspiness">
): number {
  const weightDelta =
    (clampFeature(userWeight) - clampFeature(star.timbreWeight)) / 100;
  const raspDelta =
    (clampFeature(userRaspiness) - clampFeature(star.raspiness)) / 100;
  return Math.sqrt(0.6 * weightDelta ** 2 + 0.4 * raspDelta ** 2);
}

function clampFeature(value: number): number {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

export type RankedCelebrity = {
  star: CelebrityProfile;
  distance: number;
};

export function rankCelebrityCandidates(
  options: Omit<RepresentativeOptions, "limit" | "region" | "genre"> & {
    region?: CelebrityRegion;
    genre?: Genre;
  },
  database: CelebrityProfile[] = CELEBRITIES_DB
): RankedCelebrity[] {
  return database
    .filter(
      (star) =>
        star.gender === options.gender &&
        star.vocalFach === options.fach &&
        (!options.region || star.region === options.region) &&
        (!options.genre || star.genre === options.genre)
    )
    .map((star) => ({
      star,
      distance: timbreDistance(
        options.userWeight,
        options.userRaspiness,
        star
      ),
    }))
    .sort(
      (a, b) =>
        a.distance - b.distance ||
        a.star.name.localeCompare(b.star.name, "ru")
    );
}

/**
 * Eligibility is exact gender + Fach + region + genre. Numeric 2D distance is
 * always sorted before top-N slicing; source order and categorical bins never
 * participate in the active ranking path.
 */
export function selectArchetypeRepresentatives(
  options: RepresentativeOptions,
  database: CelebrityProfile[] = CELEBRITIES_DB
): CelebrityProfile[] {
  const limit = Math.max(0, Math.floor(options.limit ?? 5));
  return rankCelebrityCandidates(options, database)
    .slice(0, limit)
    .map(({ star }) => star);
}
