/**
 * Reference celebrity vocal fingerprints for "На кого похож твой тембр?".
 *
 * IMPORTANT: the MFCC/centroid vectors below are illustrative/approximate —
 * they were NOT measured from real reference audio (there's no licensed
 * sample corpus available in this project to run through the same Meyda
 * pipeline). They're hand-authored to be clearly differentiated along known,
 * well-documented vocal characteristics (deep vs bright register, clean vs
 * breathy delivery) so matches are directionally sensible rather than
 * arbitrary/random. If real reference clips + a Meyda extraction pass become
 * available later, swap these arrays for measured vectors — the matching
 * code below doesn't need to change.
 */

import type { AcousticFingerprint, TimbreGender } from "@/lib/timbre-features";

export type CelebrityReference = {
  id: string;
  name: string;
  gender: TimbreGender;
  /** 13 illustrative MFCC coefficients (c0..c12) — same shape Meyda extracts client-side. */
  mfcc: number[];
  /** Illustrative mean spectral centroid, in Hz. */
  centroid: number;
};

export const CELEBRITY_TIMBRE_DB: CelebrityReference[] = [
  {
    id: "billie-eilish",
    name: "Billie Eilish",
    gender: "female",
    // Low-for-a-female centroid, breathy whisper-pop delivery → large high-order MFCC energy.
    centroid: 1650,
    mfcc: [21, -1.2, 3.0, -2.0, 1.6, -1.2, 5.0, 4.6, 4.0, 3.4, 3.0, 2.6, 2.2],
  },
  {
    id: "freddie-mercury",
    name: "Freddie Mercury",
    gender: "male",
    // Powerful, clean operatic-rock tenor — clear low high-order MFCC energy (not breathy).
    centroid: 1450,
    mfcc: [24, -1.8, 4.2, -2.6, 2.4, -1.6, 1.2, 1.0, 0.9, 0.8, 0.7, 0.6, 0.5],
  },
  {
    id: "adele",
    name: "Adele",
    gender: "female",
    // Powerful belting mezzo, warm and full — clean delivery, low breathiness.
    centroid: 1900,
    mfcc: [25, -0.6, 3.6, -2.2, 2.0, -1.4, 1.4, 1.2, 1.0, 0.9, 0.8, 0.7, 0.6],
  },
  {
    id: "bruno-mars",
    name: "Bruno Mars",
    gender: "male",
    // Bright funk/pop tenor, moderately clean.
    centroid: 1550,
    mfcc: [22, -1.0, 3.8, -2.0, 1.8, -1.2, 2.0, 1.8, 1.6, 1.4, 1.2, 1.0, 0.9],
  },
  {
    id: "scriptonite",
    name: "Скриптонит",
    gender: "male",
    // Deep, husky, low mumble-rap register — dark, with hoarse/breathy high-order energy.
    centroid: 750,
    mfcc: [19, -4.5, 2.0, -1.4, 1.0, -0.8, 3.4, 3.0, 2.7, 2.4, 2.1, 1.9, 1.7],
  },
  {
    id: "polina-gagarina",
    name: "Полина Гагарина",
    gender: "female",
    // Powerful belting pop, bright-ish and clean.
    centroid: 2100,
    mfcc: [26, 0.4, 3.4, -2.0, 1.8, -1.2, 1.5, 1.3, 1.1, 1.0, 0.9, 0.8, 0.7],
  },
  {
    id: "the-weeknd",
    name: "The Weeknd",
    gender: "male",
    // Smooth falsetto R&B — higher centroid for a male voice, notably breathy.
    centroid: 1700,
    mfcc: [21, -0.8, 3.0, -1.8, 1.5, -1.0, 4.2, 3.8, 3.4, 3.0, 2.6, 2.3, 2.0],
  },
  {
    id: "ariana-grande",
    name: "Ariana Grande",
    gender: "female",
    // Very bright, airy whistle-register top end.
    centroid: 2900,
    mfcc: [23, 2.6, 2.4, -1.4, 1.2, -0.8, 3.6, 3.2, 2.8, 2.5, 2.2, 1.9, 1.7],
  },
  {
    id: "ed-sheeran",
    name: "Ed Sheeran",
    gender: "male",
    // Warm, soft folk-pop tenor — low-mid centroid, moderate breathiness.
    centroid: 1200,
    mfcc: [20, -2.4, 3.2, -2.0, 1.7, -1.1, 2.2, 2.0, 1.7, 1.5, 1.3, 1.1, 1.0],
  },
  {
    id: "zivert",
    name: "Zivert",
    gender: "female",
    // Bright, airy, heavily processed pop vocal.
    centroid: 2600,
    mfcc: [22, 1.8, 2.6, -1.6, 1.3, -0.9, 3.8, 3.4, 3.0, 2.6, 2.3, 2.0, 1.8],
  },
];

function toRawVector(mfcc: number[], centroid: number): number[] {
  return [...mfcc, centroid];
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

// Reference-database per-dimension mean/std, computed once at module load.
// The SAME stats are later applied to the student's fingerprint so every
// dimension (13 MFCC coefficients + centroid, wildly different raw scales —
// MFCCs roughly -5..25, centroid roughly 500..4000 Hz) contributes on equal
// footing to the Euclidean distance instead of the large-magnitude centroid
// dimension dominating.
const REFERENCE_RAW_VECTORS = CELEBRITY_TIMBRE_DB.map((c) =>
  toRawVector(c.mfcc, c.centroid)
);
const REFERENCE_STATS = computeStats(REFERENCE_RAW_VECTORS);
const REFERENCE_NORMALIZED = REFERENCE_RAW_VECTORS.map((v) =>
  zScore(v, REFERENCE_STATS)
);

export type CelebrityMatch = {
  celebrity: CelebrityReference;
  /** Normalized Euclidean distance (lower = closer match). */
  distance: number;
  /** 0-100 display score, see `matchCelebrities` for the exact formula. */
  percent: number;
};

/**
 * Nearest-neighbor Euclidean match against the reference DB.
 *
 * 1. Normalize: every MFCC coefficient + centroid is z-scored using the
 *    reference DB's own per-dimension mean/std (`REFERENCE_STATS`, computed
 *    above), and the identical stats are applied to the student's raw
 *    fingerprint — so both sides live in the same normalized space.
 * 2. Distance: plain Euclidean distance between the normalized 14-D vectors
 *    (13 MFCC dims + centroid).
 * 3. Score: distances are inverted and rescaled against the min/max distance
 *    actually observed for this query's candidate pool — the closest match
 *    lands at ~96%, the farthest candidate in the pool at ~40% — so the
 *    percentages reflect genuine *relative* closeness within the reference
 *    set rather than an arbitrary fixed cutoff.
 */
export function matchCelebrities(
  fingerprint: AcousticFingerprint,
  options?: { gender?: TimbreGender; genderIsConfident?: boolean }
): CelebrityMatch[] {
  const filterByGender =
    !!options?.gender && options.genderIsConfident !== false;
  const pool = filterByGender
    ? CELEBRITY_TIMBRE_DB.filter((c) => c.gender === options!.gender)
    : CELEBRITY_TIMBRE_DB;
  // Fall back to the full roster if gender filtering ever leaves nothing to compare against.
  const activePool = pool.length > 0 ? pool : CELEBRITY_TIMBRE_DB;

  const studentRaw = toRawVector(fingerprint.mfcc, fingerprint.centroid);
  const studentNorm = zScore(studentRaw, REFERENCE_STATS);

  const scored = activePool.map((celebrity) => {
    const idx = CELEBRITY_TIMBRE_DB.indexOf(celebrity);
    const refNorm =
      REFERENCE_NORMALIZED[idx] ??
      zScore(toRawVector(celebrity.mfcc, celebrity.centroid), REFERENCE_STATS);
    return { celebrity, distance: euclideanDistance(studentNorm, refNorm) };
  });

  const distances = scored.map((s) => s.distance);
  const min = Math.min(...distances);
  const max = Math.max(...distances);
  const span = Math.max(1e-6, max - min);

  return scored
    .map((s) => ({
      ...s,
      percent: Math.round(96 - ((s.distance - min) / span) * 56),
    }))
    .sort((a, b) => b.percent - a.percent);
}
