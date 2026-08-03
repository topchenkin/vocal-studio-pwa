import catalogJson from "@/lib/data/artist-catalog.json";
import {
  fairVoiceSimilarity,
  VOICE_EMBED_DIM,
  type VoiceEmbedding,
} from "@/lib/voice-embed";
import type { TimbreGender } from "@/lib/timbre-features";

export type ArtistRegion = "western" | "russian" | "asian";
export type ArtistGenre = "pop" | "rock" | "rap" | "kpop";

export type ArtistProfile = {
  id: string;
  name: string;
  region: ArtistRegion;
  genre: ArtistGenre;
  country?: string;
  gender: TimbreGender;
  vector: number[];
  archetype: string;
};

export type TimbreMatch = {
  artist: ArtistProfile;
  score: number;
};

type CatalogEntry = {
  name: string;
  gender: string;
  region: string;
  genre?: string;
  country?: string;
};

/** Named vocal archetypes in the same 64-D space as extractVoiceEmbedding. */
type Archetype = {
  id: string;
  /** Partial overrides for key dims; rest filled from seed. */
  base: Partial<Record<number, number>> & {
    pitch?: number;
    bright?: number;
    grit?: number;
    breath?: number;
    vibrato?: number;
    speechy?: number;
    low?: number;
  };
};

const ARCHETYPES: Archetype[] = [
  {
    id: "pop_tenor_soft",
    base: { pitch: 0.52, bright: 0.48, grit: 0.12, breath: 0.42, vibrato: 0.32, speechy: 0.25, low: 0.35 },
  },
  {
    id: "pop_tenor_bright",
    base: { pitch: 0.55, bright: 0.68, grit: 0.18, breath: 0.35, vibrato: 0.28, speechy: 0.3, low: 0.28 },
  },
  {
    id: "pop_baritone",
    base: { pitch: 0.42, bright: 0.4, grit: 0.2, breath: 0.3, vibrato: 0.3, speechy: 0.25, low: 0.65 },
  },
  {
    id: "soul_baritone",
    base: { pitch: 0.4, bright: 0.45, grit: 0.35, breath: 0.38, vibrato: 0.45, speechy: 0.35, low: 0.7 },
  },
  {
    id: "rap_spoken",
    base: { pitch: 0.38, bright: 0.42, grit: 0.55, breath: 0.25, vibrato: 0.08, speechy: 0.85, low: 0.6 },
  },
  {
    id: "rap_melodic",
    base: { pitch: 0.45, bright: 0.5, grit: 0.4, breath: 0.3, vibrato: 0.15, speechy: 0.7, low: 0.5 },
  },
  {
    id: "rock_grit",
    base: { pitch: 0.48, bright: 0.55, grit: 0.72, breath: 0.28, vibrato: 0.25, speechy: 0.35, low: 0.45 },
  },
  {
    id: "rock_tenor",
    base: { pitch: 0.54, bright: 0.6, grit: 0.5, breath: 0.25, vibrato: 0.3, speechy: 0.3, low: 0.35 },
  },
  {
    id: "metal_harsh",
    base: { pitch: 0.5, bright: 0.7, grit: 0.9, breath: 0.2, vibrato: 0.2, speechy: 0.4, low: 0.4 },
  },
  {
    id: "indie_breathy",
    base: { pitch: 0.5, bright: 0.45, grit: 0.15, breath: 0.7, vibrato: 0.22, speechy: 0.28, low: 0.4 },
  },
  {
    id: "folk_warm",
    base: { pitch: 0.46, bright: 0.38, grit: 0.18, breath: 0.4, vibrato: 0.28, speechy: 0.3, low: 0.55 },
  },
  {
    id: "opera_tenor",
    base: { pitch: 0.58, bright: 0.55, grit: 0.1, breath: 0.2, vibrato: 0.75, speechy: 0.1, low: 0.35 },
  },
  {
    id: "opera_bass",
    base: { pitch: 0.32, bright: 0.3, grit: 0.15, breath: 0.2, vibrato: 0.65, speechy: 0.1, low: 0.9 },
  },
  {
    id: "country_twang",
    base: { pitch: 0.48, bright: 0.58, grit: 0.3, breath: 0.35, vibrato: 0.4, speechy: 0.4, low: 0.5 },
  },
  {
    id: "rnb_smooth",
    base: { pitch: 0.5, bright: 0.5, grit: 0.22, breath: 0.45, vibrato: 0.5, speechy: 0.35, low: 0.45 },
  },
  {
    id: "rnb_falsetto",
    base: { pitch: 0.62, bright: 0.65, grit: 0.12, breath: 0.55, vibrato: 0.35, speechy: 0.25, low: 0.2 },
  },
  {
    id: "edm_pop",
    base: { pitch: 0.53, bright: 0.72, grit: 0.15, breath: 0.3, vibrato: 0.2, speechy: 0.3, low: 0.3 },
  },
  {
    id: "jazz_smoke",
    base: { pitch: 0.44, bright: 0.35, grit: 0.4, breath: 0.5, vibrato: 0.35, speechy: 0.35, low: 0.6 },
  },
  {
    id: "soprano_bright",
    base: { pitch: 0.72, bright: 0.75, grit: 0.1, breath: 0.35, vibrato: 0.4, speechy: 0.2, low: 0.12 },
  },
  {
    id: "soprano_lyric",
    base: { pitch: 0.68, bright: 0.55, grit: 0.12, breath: 0.4, vibrato: 0.55, speechy: 0.18, low: 0.18 },
  },
  {
    id: "mezzo_warm",
    base: { pitch: 0.6, bright: 0.45, grit: 0.2, breath: 0.4, vibrato: 0.4, speechy: 0.25, low: 0.3 },
  },
  {
    id: "alto_dark",
    base: { pitch: 0.55, bright: 0.35, grit: 0.25, breath: 0.35, vibrato: 0.35, speechy: 0.25, low: 0.4 },
  },
  {
    id: "pop_mezzo",
    base: { pitch: 0.62, bright: 0.58, grit: 0.15, breath: 0.4, vibrato: 0.3, speechy: 0.28, low: 0.25 },
  },
  {
    id: "belt_power",
    base: { pitch: 0.65, bright: 0.7, grit: 0.35, breath: 0.25, vibrato: 0.35, speechy: 0.25, low: 0.22 },
  },
  {
    id: "breathy_pop_f",
    base: { pitch: 0.6, bright: 0.5, grit: 0.08, breath: 0.78, vibrato: 0.2, speechy: 0.3, low: 0.25 },
  },
  {
    id: "kpop_bright_f",
    base: { pitch: 0.66, bright: 0.72, grit: 0.12, breath: 0.35, vibrato: 0.25, speechy: 0.35, low: 0.2 },
  },
  {
    id: "kpop_bright_m",
    base: { pitch: 0.56, bright: 0.65, grit: 0.15, breath: 0.3, vibrato: 0.22, speechy: 0.35, low: 0.3 },
  },
  {
    id: "jpop_clear",
    base: { pitch: 0.64, bright: 0.6, grit: 0.1, breath: 0.35, vibrato: 0.3, speechy: 0.25, low: 0.22 },
  },
  {
    id: "russian_rock_m",
    base: { pitch: 0.46, bright: 0.5, grit: 0.55, breath: 0.3, vibrato: 0.28, speechy: 0.4, low: 0.55 },
  },
  {
    id: "russian_pop_m",
    base: { pitch: 0.48, bright: 0.52, grit: 0.2, breath: 0.35, vibrato: 0.3, speechy: 0.35, low: 0.45 },
  },
  {
    id: "russian_pop_f",
    base: { pitch: 0.62, bright: 0.55, grit: 0.15, breath: 0.4, vibrato: 0.35, speechy: 0.3, low: 0.28 },
  },
  {
    id: "russian_estrada_f",
    base: { pitch: 0.6, bright: 0.5, grit: 0.18, breath: 0.35, vibrato: 0.45, speechy: 0.3, low: 0.3 },
  },
];

const ARCHETYPE_BY_ID = Object.fromEntries(
  ARCHETYPES.map((a) => [a.id, a])
) as Record<string, Archetype>;

/** Hand-assigned archetypes for high-profile stars (fixes “always same 2 names”). */
const STAR_ARCHETYPE: Record<string, string> = {
  "ed sheeran": "pop_tenor_soft",
  "ed sheeran divide": "pop_tenor_soft",
  "ed sheeran equals": "pop_tenor_soft",
  "ed sheeran autumn variations": "folk_warm",
  "ed sheeran subtract": "pop_tenor_soft",
  "lewis capaldi": "soul_baritone",
  "sam smith": "rnb_falsetto",
  "harry styles": "pop_tenor_bright",
  "justin bieber": "pop_tenor_bright",
  "shawn mendes": "pop_tenor_bright",
  "the weeknd": "rnb_falsetto",
  "bruno mars": "rnb_smooth",
  "john legend": "rnb_smooth",
  "adele": "belt_power",
  "adele 21": "belt_power",
  "adele 25": "mezzo_warm",
  "adele 30": "mezzo_warm",
  "billie eilish": "breathy_pop_f",
  "ariana grande": "soprano_bright",
  "taylor swift": "pop_mezzo",
  "lady gaga": "belt_power",
  "rihanna": "rnb_smooth",
  "dua lipa": "pop_mezzo",
  "lana del rey": "alto_dark",
  "sia": "belt_power",
  "freddie mercury": "rock_tenor",
  "michael jackson": "pop_tenor_bright",
  "elvis presley": "pop_baritone",
  metallica: "metal_harsh",
  slipknot: "metal_harsh",
  korn: "metal_harsh",
  nirvana: "rock_grit",
  "foo fighters": "rock_tenor",
  queen: "rock_tenor",
  "imagine dragons": "rock_tenor",
  coldplay: "indie_breathy",
  "radiohead": "indie_breathy",
  "kendrick lamar": "rap_spoken",
  eminem: "rap_spoken",
  drake: "rap_melodic",
  "j cole": "rap_spoken",
  "post malone": "rap_melodic",
  "travis scott": "rap_melodic",
  "kanye west": "rap_spoken",
  "jay-z": "rap_spoken",
  "tyler the creator": "rap_melodic",
  "the notorious b.i.g.": "rap_spoken",
  "би-2": "russian_rock_m",
  "би-2 шура": "russian_rock_m",
  "би-2 лёва": "russian_rock_m",
  "виктор цой": "russian_rock_m",
  "юрий шевчук": "russian_rock_m",
  "ддт": "russian_rock_m",
  киш: "russian_rock_m",
  "король и шут": "russian_rock_m",
  "агата кристи": "russian_rock_m",
  "звери": "russian_pop_m",
  земляне: "russian_pop_m",
  земфира: "alto_dark",
  "алла пугачёва": "russian_estrada_f",
  валерия: "russian_pop_f",
  ёлка: "russian_pop_f",
  "полина гагарина": "belt_power",
  "дима билан": "russian_pop_m",
  "сергей лазарев": "russian_pop_m",
  "артём пивоваров": "russian_pop_m",
  jony: "russian_pop_m",
  oxxxymiron: "rap_spoken",
  баста: "rap_melodic",
  morgenshtern: "rap_melodic",
  каста: "rap_spoken",
  "скриптовит": "rap_spoken",
  guf: "rap_spoken",
  "jung kook": "kpop_bright_m",
  jimin: "kpop_bright_m",
  v: "kpop_bright_m",
  iu: "jpop_clear",
  taeyeon: "kpop_bright_f",
  "rosé": "breathy_pop_f",
  jennie: "pop_mezzo",
  ado: "belt_power",
  lisa: "kpop_bright_f",
  hozier: "folk_warm",
  "chris stapleton": "country_twang",
  "andrea bocelli": "opera_tenor",
  zayn: "rnb_falsetto",
  "backstreet boys": "pop_tenor_bright",
  "george michael": "pop_tenor_soft",
  "ricky martin": "pop_tenor_bright",
};

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rand(seed: number, i: number) {
  const x = Math.sin(seed * 0.0001 + i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function pickArchetype(
  name: string,
  gender: TimbreGender,
  region: ArtistRegion,
  genre?: ArtistGenre
): string {
  const key = name.toLowerCase().replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
  for (const [needle, arch] of Object.entries(STAR_ARCHETYPE)) {
    if (key === needle || key.startsWith(needle + " ")) return arch;
  }

  const n = key;
  const g = genre;
  const seed = hashSeed(name + "|" + (g ?? "") + "|" + region);

  // Name heuristics (only when specific)
  if (/metal|slipknot|metallica|disturbed|korn|rammstein/.test(n)) {
    return "metal_harsh";
  }
  if (/opera|bocelli|паваротти|нетребко|хворостов/.test(n)) {
    return gender === "female" ? "soprano_lyric" : "opera_tenor";
  }
  if (/billie eilish|clairo|mitski/.test(n)) return "breathy_pop_f";

  // Catalog genre is the primary signal (was ignored → huge near-duplicate clusters)
  if (g === "rap" || /rap|hip.?hop|Eminem|kendrick|drake|oxxx|баста|guf|скрипт|морген/i.test(n)) {
    const rapPool =
      gender === "female"
        ? ["rap_melodic", "rnb_smooth", "pop_mezzo"]
        : ["rap_spoken", "rap_melodic", "soul_baritone"];
    return rapPool[seed % rapPool.length]!;
  }
  if (g === "rock" || /цой|би-2|shevchuk|киш|nirvana|foo fighters|queen|ac\/dc/.test(n)) {
    if (region === "russian") {
      const pool =
        gender === "female"
          ? ["alto_dark", "rock_tenor", "belt_power"]
          : ["russian_rock_m", "rock_grit", "folk_warm", "metal_harsh"];
      return pool[seed % pool.length]!;
    }
    const pool =
      gender === "female"
        ? ["rock_tenor", "belt_power", "alto_dark", "indie_breathy"]
        : ["rock_grit", "rock_tenor", "metal_harsh", "folk_warm", "indie_breathy"];
    return pool[seed % pool.length]!;
  }
  if (g === "kpop" || region === "asian") {
    return gender === "female" ? "kpop_bright_f" : "kpop_bright_m";
  }
  if (/country|stapleton|wallen|underwood/.test(n)) return "country_twang";
  if (/jazz|sinatra|fitzgerald|holiday/.test(n)) return "jazz_smoke";

  if (region === "russian") {
    const pool =
      gender === "female"
        ? ["russian_pop_f", "russian_estrada_f", "pop_mezzo", "belt_power", "alto_dark"]
        : ["russian_pop_m", "pop_baritone", "soul_baritone", "rnb_smooth", "folk_warm"];
    return pool[seed % pool.length]!;
  }

  const pool =
    gender === "female"
      ? [
          "pop_mezzo",
          "soprano_bright",
          "mezzo_warm",
          "belt_power",
          "breathy_pop_f",
          "alto_dark",
          "rnb_smooth",
          "edm_pop",
        ]
      : [
          "pop_tenor_soft",
          "pop_tenor_bright",
          "pop_baritone",
          "soul_baritone",
          "rnb_smooth",
          "rnb_falsetto",
          "indie_breathy",
          "folk_warm",
          "edm_pop",
          "jazz_smoke",
        ];
  return pool[seed % pool.length] ?? pool[0]!;
}

function clamp01Local(v: number) {
  return Math.max(0, Math.min(1, v));
}

function buildVectorFromArchetype(
  name: string,
  gender: TimbreGender,
  archetypeId: string
): number[] {
  const arch = ARCHETYPE_BY_ID[archetypeId] ?? ARCHETYPES[0]!;
  const seed = hashSeed(name + "|" + archetypeId + "|v4fair");
  const b = arch.base;

  // Wide per-artist spread inside archetype (±18% style) so NO name sits
  // permanently at the centroid (that made Capaldi/Bi-2/Metallica “default winners”).
  const j = (i: number, amp = 0.18) => (rand(seed, i) - 0.5) * 2 * amp;

  const pitch = clamp01Local(
    (b.pitch ?? (gender === "female" ? 0.62 : 0.48)) + j(1, 0.16)
  );
  const bright = clamp01Local((b.bright ?? 0.5) + j(2, 0.18));
  const grit = clamp01Local((b.grit ?? 0.25) + j(3, 0.2));
  const breath = clamp01Local((b.breath ?? 0.35) + j(4, 0.18));
  const vibrato = clamp01Local((b.vibrato ?? 0.3) + j(5, 0.2));
  const speechy = clamp01Local((b.speechy ?? 0.3) + j(6, 0.22));
  const low = clamp01Local(
    (b.low ?? (gender === "female" ? 0.25 : 0.55)) + j(7, 0.16)
  );

  const v = new Array(VOICE_EMBED_DIM).fill(0.45);
  v[0] = pitch;
  v[1] = clamp01Local(pitch + j(8, 0.04));
  v[2] = clamp01Local(0.2 + j(9, 0.12));
  v[3] = clamp01Local(0.28 + j(10, 0.14));
  v[4] = clamp01Local(0.5 + j(11, 0.1));
  v[5] = pitch;
  v[6] = gender === "female" ? 0.2 : 0.8;
  v[7] = vibrato;
  v[8] = gender === "female" ? clamp01Local(0.58 + j(12, 0.1)) : clamp01Local(0.38 + j(12, 0.1));
  v[9] = gender === "female" ? clamp01Local(0.58 + j(13, 0.1)) : clamp01Local(0.42 + j(13, 0.1));
  v[10] = gender === "female" ? clamp01Local(0.6 + j(14, 0.1)) : clamp01Local(0.42 + j(14, 0.1));
  v[11] = clamp01Local(0.45 + j(15, 0.1));
  v[12] = gender === "female" ? 0.35 : 0.65;
  v[13] = bright;
  v[14] = clamp01Local(bright * 0.9 + 0.05 + j(16, 0.05));
  v[15] = bright;
  v[16] = clamp01Local(grit * 0.55 + breath * 0.35);
  v[17] = speechy;
  v[18] = clamp01Local(0.25 + grit * 0.2 + j(17, 0.06));
  v[19] = clamp01Local(0.35 + j(18, 0.1));
  v[20] = clamp01Local(0.25 + j(19, 0.08));
  v[21] = breath;
  v[22] = grit;
  v[23] = clamp01Local(1 - Math.abs(pitch - 0.55) * 1.2);

  const bandProfile = [
    low * 0.9,
    low * 0.75,
    low * 0.55 + 0.15,
    0.35,
    0.4,
    0.4,
    0.35 + bright * 0.15,
    0.3 + bright * 0.25,
    bright * 0.55,
    bright * 0.65,
    breath * 0.4 + bright * 0.35,
    breath * 0.5 + bright * 0.25,
  ];
  for (let i = 0; i < 12; i += 1) {
    v[24 + i] = clamp01Local((bandProfile[i] ?? 0.35) + j(20 + i, 0.1));
  }

  v[36] = low;
  v[37] = bright;
  v[38] = grit;
  v[39] = clamp01Local(breath * 0.65 + vibrato * 0.35);
  v[40] = clamp01Local(1 - grit);
  v[41] = clamp01Local(0.35 + j(40, 0.16));
  v[42] = speechy;
  v[43] = gender === "female" ? 0.3 : 0.7;
  v[44] = low;
  v[45] = clamp01Local(0.4 + j(41, 0.12));
  v[46] = bright;
  v[47] = clamp01Local(breath * 0.55 + bright * 0.3);
  // Fingerprint dims unused in fair ranking — fill neutrally
  for (let i = 0; i < 16; i += 1) {
    v[48 + i] = 0.45;
  }
  return v;
}

function slugId(region: string, name: string) {
  return `${region}-${name.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, "-")}`.slice(0, 120);
}

function buildDb(): ArtistProfile[] {
  const entries = (catalogJson as { artists: CatalogEntry[] }).artists ?? [];
  const out: ArtistProfile[] = [];
  for (const entry of entries) {
    const gender: TimbreGender =
      entry.gender === "female" ? "female" : "male";
    const region = (
      entry.region === "russian" || entry.region === "asian"
        ? entry.region
        : "western"
    ) as ArtistRegion;
    const genre = (
      entry.genre === "rock" ||
      entry.genre === "rap" ||
      entry.genre === "kpop" ||
      entry.genre === "pop"
        ? entry.genre
        : region === "asian"
          ? "kpop"
          : "pop"
    ) as ArtistGenre;
    const archetype = pickArchetype(entry.name, gender, region, genre);
    out.push({
      id: slugId(region, entry.name),
      name: entry.name,
      region,
      genre,
      country: entry.country,
      gender,
      archetype,
      vector: buildVectorFromArchetype(entry.name, gender, archetype),
    });
  }
  return out;
}

export const ARTIST_TIMBRE_DB: ArtistProfile[] = buildDb();

export const ARTIST_DB_STATS = {
  total: ARTIST_TIMBRE_DB.length,
  western: ARTIST_TIMBRE_DB.filter((a) => a.region === "western").length,
  russian: ARTIST_TIMBRE_DB.filter((a) => a.region === "russian").length,
  asian: ARTIST_TIMBRE_DB.filter((a) => a.region === "asian").length,
};

/**
 * Neutral ranking: cosine on measured style axes only.
 * No MMR, no name boosts, no rank-stretched fake %.
 * Percent = affinity mapped through the pool’s own distribution (z-score).
 */
export function matchVoiceEmbedding(
  embedding: VoiceEmbedding,
  region: ArtistRegion,
  topN = 5,
  genre?: ArtistGenre
): TimbreMatch[] {
  const pool = ARTIST_TIMBRE_DB.filter(
    (a) =>
      a.region === region &&
      a.gender === embedding.gender &&
      (genre ? a.genre === genre : true)
  );
  if (pool.length === 0) return [];

  const scored = pool.map((artist) => ({
    artist,
    affinity: fairVoiceSimilarity(embedding.vector, artist.vector),
  }));

  // Pool stats for honest calibration
  const affinities = scored.map((s) => s.affinity);
  const meanA =
    affinities.reduce((a, b) => a + b, 0) / Math.max(1, affinities.length);
  let varA = 0;
  for (const a of affinities) varA += (a - meanA) ** 2;
  const stdA = Math.sqrt(varA / Math.max(1, affinities.length)) || 0.08;

  scored.sort((a, b) => b.affinity - a.affinity);

  return scored.slice(0, topN).map((item) => {
    const z = (item.affinity - meanA) / stdA;
    // z≈0 → ~62%, z≈+2 → ~90%, z≈-1 → ~48%
    const score = Math.max(
      38,
      Math.min(96, Math.round(62 + z * 14 + item.affinity * 8))
    );
    return { artist: item.artist, score };
  });
}

/** Convenience: western/russian broken by pop/rock/rap; asian = kpop. */
export function matchVoiceByGenres(embedding: VoiceEmbedding, topN = 5) {
  return {
    western: {
      pop: matchVoiceEmbedding(embedding, "western", topN, "pop"),
      rock: matchVoiceEmbedding(embedding, "western", topN, "rock"),
      rap: matchVoiceEmbedding(embedding, "western", topN, "rap"),
    },
    russian: {
      pop: matchVoiceEmbedding(embedding, "russian", topN, "pop"),
      rock: matchVoiceEmbedding(embedding, "russian", topN, "rock"),
      rap: matchVoiceEmbedding(embedding, "russian", topN, "rap"),
    },
    asian: {
      kpop: matchVoiceEmbedding(embedding, "asian", topN, "kpop"),
    },
  };
}

/** @deprecated use matchVoiceEmbedding */
export function matchTimbreTop(
  features: { vector: number[]; gender: TimbreGender; genderHint?: string },
  region: ArtistRegion,
  topN = 5
): TimbreMatch[] {
  return matchVoiceEmbedding(
    {
      vector: features.vector,
      gender: features.gender,
      genderConfidence: "medium",
      pitchMedianMidi: 55,
      formantSum: 2200,
      brightness: 0.5,
      grit: 0.3,
      breathiness: 0.3,
      vibrato: 0.2,
    },
    region,
    topN
  );
}

export function boostRecognizedArtist(
  matches: TimbreMatch[],
  artistName: string,
  region: ArtistRegion,
  gender: TimbreGender,
  genre?: ArtistGenre
): TimbreMatch[] {
  const needle = artistName.toLowerCase().trim();
  if (!needle) return matches;
  const hit = ARTIST_TIMBRE_DB.find(
    (a) =>
      a.region === region &&
      a.gender === gender &&
      (genre ? a.genre === genre : true) &&
      (a.name.toLowerCase() === needle ||
        a.name.toLowerCase().startsWith(needle + " ") ||
        a.name.toLowerCase().startsWith(needle) ||
        needle.includes(
          (a.name.toLowerCase().split(" (")[0] ?? "").trim()
        ))
  );

  if (!hit) return matches;
  const rest = matches.filter((m) => m.artist.id !== hit.id);
  return [{ artist: hit, score: 96 }, ...rest].slice(
    0,
    Math.max(5, matches.length)
  );
}
