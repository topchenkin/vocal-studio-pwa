import { SUPABASE_PROJECT_URL, SUPABASE_PROXY_URL } from "@/lib/supabase-origin";

/** Shared by server (build snapshot) and client code: keep this file free of browser-only imports. */

export const TEACHER_CARD_BUCKET = "teacher-card";
export const TEACHER_CARD_PATH = "/prepodavatel";

export type TeacherMediaKind = "photo" | "video";

export interface TeacherMedia {
  id: string;
  kind: TeacherMediaKind;
  path: string;
  caption: string;
}

export interface TeacherCard {
  fullName: string;
  headline: string;
  bio: string;
  achievements: string[];
  musicLinks: string[];
  media: TeacherMedia[];
}

export const EMPTY_TEACHER_CARD: TeacherCard = {
  fullName: "",
  headline: "",
  bio: "",
  achievements: [],
  musicLinks: [],
  media: [],
};

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function asMediaList(value: unknown): TeacherMedia[] {
  if (!Array.isArray(value)) return [];
  const out: TeacherMedia[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const kind = item.kind === "video" ? "video" : item.kind === "photo" ? "photo" : null;
    const path = asString(item.path);
    if (!kind || !path) continue;
    out.push({
      id: asString(item.id) || path,
      kind,
      path,
      caption: asString(item.caption),
    });
  }
  return out;
}

/** Row from `public.teacher_card` (snake_case) → app shape. Tolerates missing/invalid fields. */
export function normalizeTeacherCard(row: unknown): TeacherCard {
  if (!row || typeof row !== "object") return EMPTY_TEACHER_CARD;
  const r = row as Record<string, unknown>;
  return {
    fullName: asString(r.full_name),
    headline: asString(r.headline),
    bio: asString(r.bio),
    achievements: asStringList(r.achievements),
    musicLinks: asStringList(r.music_links),
    media: asMediaList(r.media),
  };
}

export function teacherCardToRow(card: TeacherCard) {
  return {
    id: 1,
    full_name: card.fullName.trim(),
    headline: card.headline.trim(),
    bio: card.bio.trim(),
    achievements: card.achievements.map((s) => s.trim()).filter(Boolean),
    music_links: card.musicLinks.map((s) => s.trim()).filter(Boolean),
    media: card.media.map(({ id, kind, path, caption }) => ({
      id,
      kind,
      path,
      caption: caption.trim(),
    })),
  };
}

export function isTeacherCardEmpty(card: TeacherCard | null | undefined) {
  return !card || (!card.fullName.trim() && !card.bio.trim() && card.media.length === 0);
}

export function teacherPhotos(card: TeacherCard) {
  return card.media.filter((item) => item.kind === "photo");
}

export function teacherVideos(card: TeacherCard) {
  return card.media.filter((item) => item.kind === "video");
}

/** Public-bucket URL through the RU proxy, so static HTML works without the client race. */
export function teacherMediaUrl(path: string) {
  const base = SUPABASE_PROXY_URL || SUPABASE_PROJECT_URL;
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${base}/storage/v1/object/public/${TEACHER_CARD_BUCKET}/${encoded}`;
}

export function bioParagraphs(bio: string) {
  return bio
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export type YandexMusicEmbed =
  | { kind: "player"; src: string; height: number; label: string }
  | { kind: "link"; href: string; label: string };

const YANDEX_MUSIC_HOSTS = new Set(["music.yandex.ru", "music.yandex.com"]);

function parseUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

/**
 * Accepts a music.yandex.ru link or the «HTML-код» iframe snippet from «Поделиться».
 * Only music.yandex.* hosts are ever rendered, so a pasted value cannot inject other iframes.
 */
export function parseYandexMusicEmbed(input: string): YandexMusicEmbed | null {
  const value = input.trim();
  if (!value) return null;

  const iframeSrc = value.match(/<iframe[^>]*\ssrc=["']([^"']+)["']/i)?.[1];
  const url = parseUrl(iframeSrc ?? value);
  if (!url || url.protocol !== "https:" || !YANDEX_MUSIC_HOSTS.has(url.hostname)) {
    return null;
  }

  const route = url.pathname.startsWith("/iframe")
    ? (url.pathname.replace(/^\/iframe\/?/, "") || url.hash.replace(/^#/, ""))
    : url.pathname.replace(/^\//, "");
  const parts = route.split("/").filter(Boolean);
  const origin = `https://${url.hostname}`;

  if (parts[0] === "album" && parts[1] && parts[2] === "track" && parts[3]) {
    return {
      kind: "player",
      src: `${origin}/iframe/album/${parts[1]}/track/${parts[3]}`,
      height: 180,
      label: "Трек",
    };
  }
  if (parts[0] === "album" && parts[1]) {
    return {
      kind: "player",
      src: `${origin}/iframe/album/${parts[1]}`,
      height: 450,
      label: "Альбом",
    };
  }
  if (parts[0] === "users" && parts[1] && parts[2] === "playlists" && parts[3]) {
    return {
      kind: "player",
      src: `${origin}/iframe/playlist/${parts[1]}/${parts[3]}`,
      height: 450,
      label: "Плейлист",
    };
  }
  if (parts[0] === "playlist" && parts[1] && parts[2]) {
    return {
      kind: "player",
      src: `${origin}/iframe/playlist/${parts[1]}/${parts[2]}`,
      height: 450,
      label: "Плейлист",
    };
  }
  if (parts[0] === "artist" && parts[1]) {
    return {
      kind: "link",
      href: `${origin}/artist/${parts[1]}`,
      label: "Все релизы на Яндекс Музыке",
    };
  }
  return { kind: "link", href: url.toString(), label: "Слушать на Яндекс Музыке" };
}

/**
 * Next persists fetch results in .next/cache across builds, and `cache: "no-store"` would make the
 * route dynamic (breaks `output: export`). A per-build header changes the cache key instead.
 */
const BUILD_STAMP = String(Date.now());

/**
 * Build-time snapshot for the static HTML (search bots). Never throws: on any failure the
 * page ships empty and the client loads live data.
 */
export async function fetchTeacherCardSnapshot(): Promise<TeacherCard | null> {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) return null;
  const bases = [SUPABASE_PROXY_URL, SUPABASE_PROJECT_URL].filter(
    (base, index, all) => Boolean(base) && all.indexOf(base) === index
  );
  for (const base of bases) {
    try {
      const res = await fetch(
        `${base}/rest/v1/teacher_card?id=eq.1&select=full_name,headline,bio,achievements,music_links,media`,
        {
          headers: { apikey: key, Authorization: `Bearer ${key}`, "x-uvs-build": BUILD_STAMP },
          signal: AbortSignal.timeout(8000),
        }
      );
      if (!res.ok) continue;
      const rows: unknown = await res.json();
      return Array.isArray(rows) && rows[0] ? normalizeTeacherCard(rows[0]) : null;
    } catch (error) {
      console.error("[uvs:teacher-card] build snapshot failed", base, error);
    }
  }
  return null;
}
