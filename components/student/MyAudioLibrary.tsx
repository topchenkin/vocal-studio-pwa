"use client";

import { Music2 } from "lucide-react";

export default function MyAudioLibrary() {
  return (
    <div className="rounded-2xl bg-studio-surface p-8 text-center ring-1 ring-studio-border">
      <Music2 className="mx-auto h-8 w-8 text-studio-muted" />
      <h3 className="mt-3 font-display text-lg font-semibold">Мои аудио</h3>
      <p className="mt-2 text-sm leading-relaxed text-studio-muted">
        Здесь появятся треки из «Удаления вокала» и «Сведения дорожек» — после
        того как согласуем, где их хранить. Пока можно скачивать результат
        прямо в этих инструментах.
      </p>
    </div>
  );
}
