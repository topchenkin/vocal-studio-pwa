import type { MetadataRoute } from "next";
import { LEGAL } from "@/lib/legal";
import { PUBLIC_PATHS } from "@/lib/public-site";
import { TEACHER_CARD_PATH } from "@/lib/teacher-card";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages: Array<{ path: string; priority: number }> = [
    { path: "/", priority: 1 },
    { path: PUBLIC_PATHS.ekaterinburg, priority: 0.9 },
    { path: PUBLIC_PATHS.online, priority: 0.9 },
    { path: TEACHER_CARD_PATH, priority: 0.8 },
    { path: LEGAL.uslugiPath, priority: 0.5 },
    { path: LEGAL.contactsPath, priority: 0.5 },
    { path: LEGAL.offerPath, priority: 0.2 },
    { path: LEGAL.privacyPath, priority: 0.2 },
  ];
  return pages.map(({ path, priority }) => ({
    url: `${LEGAL.site}${path === "/" ? "" : path}`,
    priority,
  }));
}
