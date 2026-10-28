import { ExternalLink } from "lucide-react";
import { parseYandexMusicEmbed } from "@/lib/teacher-card";

export default function YandexMusicEmbeds({ links }: { links: string[] }) {
  const embeds = links
    .map(parseYandexMusicEmbed)
    .filter((item): item is NonNullable<typeof item> => item !== null);
  if (embeds.length === 0) return null;

  const players = embeds.filter((item) => item.kind === "player");
  const plainLinks = embeds.filter((item) => item.kind === "link");

  return (
    <div className="space-y-4">
      {players.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {players.map((item) => (
            <iframe
              key={item.src}
              src={item.src}
              title={`${item.label} на Яндекс Музыке`}
              loading="lazy"
              allow="clipboard-write; autoplay"
              style={{ height: item.height }}
              className="w-full rounded-2xl border-0 bg-studio-surface ring-1 ring-studio-border"
            />
          ))}
        </div>
      ) : null}
      {plainLinks.length > 0 ? (
        <div className="flex flex-wrap gap-3">
          {plainLinks.map((item) => (
            <a
              key={item.href}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-studio-surface px-4 text-sm font-medium ring-1 ring-studio-border transition hover:ring-studio-accent/40 sm:w-auto"
            >
              {item.label}
              <ExternalLink className="h-4 w-4" />
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
