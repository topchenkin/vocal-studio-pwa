/**
 * Map neural celebrity matches → genre/region tops used by TimbreMatcher UI.
 * Neural engine returns raw {name, score}; we attach catalog metadata when possible.
 */

import catalogJson from "@/lib/data/artist-catalog.json";
import type { ArtistGenre, ArtistProfile, ArtistRegion, TimbreMatch } from "@/lib/artist-timbre-db";
import type { TimbreGender } from "@/lib/timbre-features";

export type NeuralRawMatch = {
  name: string;
  score: number; // cosine 0..1
};

type CatalogEntry = {
  name: string;
  gender: string;
  region: string;
  genre?: string;
  country?: string;
};

const CATALOG = (catalogJson as { artists: CatalogEntry[] }).artists ?? [];

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zа-яё0-9]+/gi, " ")
    .trim();
}

function findCatalog(name: string): CatalogEntry | null {
  const n = norm(name);
  if (!n) return null;
  for (const a of CATALOG) {
    const an = norm(a.name);
    if (an === n || an.startsWith(n) || n.startsWith(an)) return a;
    // "Taylor Swift" vs "taylor_swift"
    if (an.replace(/\s/g, "") === n.replace(/\s/g, "")) return a;
  }
  return null;
}

/** Heuristic genre when celebrity is not in our curated catalog. */
function guessMeta(
  name: string,
  gender: TimbreGender
): { region: ArtistRegion; genre: ArtistGenre; gender: TimbreGender } {
  const n = norm(name);
  let region: ArtistRegion = "western";
  if (/[а-яё]/.test(name) || /putin|medvedev|kirkorov|pugacheva|zemfira|tsoi|oxxxy|basta|bi.?2/.test(n)) {
    region = "russian";
  } else if (/jung|jimin|bts|blackpink|iu |aespa|twice|stray|kpop|exo|newjeans/.test(n)) {
    region = "asian";
  }

  let genre: ArtistGenre =
    region === "asian" ? "kpop" : "pop";
  if (/rap|hip.?hop|eminem|drake|kendrick|snoop|jay.?z|travis|cole|oxxxy|basta|kasta/.test(n)) {
    genre = "rap";
  } else if (
    /rock|metal|metallica|nirvana|foo fighters|ozzy|slipknot|green day|hetfield|queen|aerosmith|цой|кино|ддт|би.?2|киш/.test(
      n
    )
  ) {
    genre = "rock";
  } else if (region === "asian") {
    genre = "kpop";
  }

  return { region, genre, gender };
}

function toProfile(
  name: string,
  gender: TimbreGender,
  meta: { region: ArtistRegion; genre: ArtistGenre; gender: TimbreGender }
): ArtistProfile {
  return {
    id: `nn-${meta.region}-${norm(name).replace(/\s+/g, "-")}`.slice(0, 120),
    name,
    region: meta.region,
    genre: meta.genre,
    gender: meta.gender,
    archetype: "neural",
    vector: [],
  };
}

/** Cosine → display percent (calibrated for Resemblyzer ~0.55–0.95 typical tops). */
export function neuralScoreToPercent(cosine: number): number {
  const t = Math.max(0, Math.min(1, (cosine - 0.45) / 0.5));
  return Math.round(42 + t * 54);
}

export type NeuralGenreResults = {
  western: { pop: TimbreMatch[]; rock: TimbreMatch[]; rap: TimbreMatch[] };
  russian: { pop: TimbreMatch[]; rock: TimbreMatch[]; rap: TimbreMatch[] };
  asian: { kpop: TimbreMatch[] };
  engine: string;
  rawTop: Array<{ name: string; score: number; percent: number }>;
};

/**
 * Fair bucketing: take neural ranking as truth, place each name into at most
 * one genre column using catalog/heuristics. No synthetic re-scoring.
 */
export function bucketNeuralMatches(
  matches: NeuralRawMatch[],
  gender: TimbreGender,
  topN = 5
): NeuralGenreResults {
  const empty = (): TimbreMatch[] => [];
  const out: NeuralGenreResults = {
    western: { pop: empty(), rock: empty(), rap: empty() },
    russian: { pop: empty(), rock: empty(), rap: empty() },
    asian: { kpop: empty() },
    engine: "neural",
    rawTop: matches.slice(0, 12).map((m) => ({
      name: m.name,
      score: m.score,
      percent: neuralScoreToPercent(m.score),
    })),
  };

  const push = (list: TimbreMatch[], item: TimbreMatch) => {
    if (list.length >= topN) return;
    if (list.some((x) => x.artist.name === item.artist.name)) return;
    list.push(item);
  };

  for (const m of matches) {
    const cat = findCatalog(m.name);
    const meta = cat
      ? {
          region: (cat.region === "russian" || cat.region === "asian"
            ? cat.region
            : "western") as ArtistRegion,
          genre: (cat.genre === "rock" ||
          cat.genre === "rap" ||
          cat.genre === "kpop" ||
          cat.genre === "pop"
            ? cat.genre
            : cat.region === "asian"
              ? "kpop"
              : "pop") as ArtistGenre,
          gender: (cat.gender === "female" ? "female" : "male") as TimbreGender,
        }
      : guessMeta(m.name, gender);

    // Catalog gender is authoritative when present (skip opposite-sex stars)
    if (cat && meta.gender !== gender) continue;

    const artist = toProfile(m.name, gender, { ...meta, gender });
    const item: TimbreMatch = {
      artist: { ...artist, gender },
      score: neuralScoreToPercent(m.score),
    };

    if (meta.region === "asian" || meta.genre === "kpop") {
      push(out.asian.kpop, item);
      continue;
    }
    if (meta.region === "russian") {
      if (meta.genre === "rock") push(out.russian.rock, item);
      else if (meta.genre === "rap") push(out.russian.rap, item);
      else push(out.russian.pop, item);
      continue;
    }
    if (meta.genre === "rock") push(out.western.rock, item);
    else if (meta.genre === "rap") push(out.western.rap, item);
    else push(out.western.pop, item);
  }

  return out;
}
