"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  ImagePlus,
  Plus,
  Trash2,
  Video,
} from "lucide-react";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import Toast from "@/components/ui/Toast";
import { mapBackendError } from "@/lib/supabase-errors";
import {
  EMPTY_TEACHER_CARD,
  TEACHER_CARD_PATH,
  parseYandexMusicEmbed,
  teacherMediaUrl,
  type TeacherCard,
  type TeacherMedia,
  type TeacherMediaKind,
} from "@/lib/teacher-card";
import {
  loadTeacherCard,
  removeTeacherMediaFiles,
  saveTeacherCard,
  uploadTeacherMedia,
} from "@/lib/teacher-card-client";

const FIELD =
  "w-full rounded-xl bg-studio-card px-4 py-3 text-sm ring-1 ring-studio-border focus:outline-none focus:ring-studio-accent";

function errorText(error: unknown, fallback: string) {
  if (error instanceof Error && /[а-яё]/i.test(error.message)) return error.message;
  return mapBackendError(error, fallback);
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-studio-surface p-4 ring-1 ring-studio-border sm:p-6">
      <h3 className="font-display text-xl font-semibold">{title}</h3>
      {hint ? <p className="mt-1 text-sm text-studio-muted">{hint}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function musicStatus(value: string) {
  if (!value.trim()) return null;
  const parsed = parseYandexMusicEmbed(value);
  if (!parsed) {
    return { ok: false, text: "Не распознано: нужна ссылка music.yandex.ru или HTML-код плеера" };
  }
  return parsed.kind === "player"
    ? { ok: true, text: `Будет плеер: ${parsed.label.toLowerCase()}` }
    : { ok: true, text: `Будет кнопка «${parsed.label}»` };
}

export default function TeacherCardEditor() {
  const [card, setCard] = useState<TeacherCard>(EMPTY_TEACHER_CARD);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [uploading, setUploading] = useState("");
  const [toastOpen, setToastOpen] = useState(false);
  const savedPaths = useRef<Set<string>>(new Set());
  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const fresh = await loadTeacherCard();
      setCard(fresh);
      savedPaths.current = new Set(fresh.media.map((item) => item.path));
      setDirty(false);
    } catch (err) {
      console.error("[uvs:teacher-card] load failed", err);
      setLoadError(errorText(err, "Не удалось загрузить визитку"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const update = (patch: Partial<TeacherCard>) => {
    setCard((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  };

  const updateList = (key: "achievements" | "musicLinks", index: number, value: string) => {
    setCard((prev) => {
      const next = [...prev[key]];
      next[index] = value;
      return { ...prev, [key]: next };
    });
    setDirty(true);
  };

  const removeFromList = (key: "achievements" | "musicLinks", index: number) => {
    setCard((prev) => ({ ...prev, [key]: prev[key].filter((_, i) => i !== index) }));
    setDirty(true);
  };

  const updateMedia = (id: string, patch: Partial<TeacherMedia>) => {
    setCard((prev) => ({
      ...prev,
      media: prev.media.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));
    setDirty(true);
  };

  const moveMedia = (id: string, delta: -1 | 1) => {
    setCard((prev) => {
      const media = [...prev.media];
      const from = media.findIndex((item) => item.id === id);
      if (from < 0) return prev;
      const kind = media[from].kind;
      let to = from + delta;
      while (to >= 0 && to < media.length && media[to].kind !== kind) to += delta;
      if (to < 0 || to >= media.length) return prev;
      [media[from], media[to]] = [media[to], media[from]];
      return { ...prev, media };
    });
    setDirty(true);
  };

  const removeMedia = (id: string) => {
    setCard((prev) => ({ ...prev, media: prev.media.filter((item) => item.id !== id) }));
    setDirty(true);
  };

  const onFiles = async (kind: TeacherMediaKind, list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (files.length === 0) return;
    setError("");
    try {
      for (const [index, file] of files.entries()) {
        setUploading(
          `Загружаем ${kind === "photo" ? "фото" : "видео"} ${index + 1} из ${files.length}…`
        );
        const item = await uploadTeacherMedia(kind, file);
        setCard((prev) => ({ ...prev, media: [...prev.media, item] }));
        setDirty(true);
      }
    } catch (err) {
      setError(errorText(err, "Не удалось загрузить файл"));
    } finally {
      setUploading("");
      if (photoInput.current) photoInput.current.value = "";
      if (videoInput.current) videoInput.current.value = "";
    }
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await saveTeacherCard(card);
      const current = new Set(card.media.map((item) => item.path));
      const dropped = [...savedPaths.current].filter((path) => !current.has(path));
      savedPaths.current = current;
      setDirty(false);
      setToastOpen(true);
      window.setTimeout(() => setToastOpen(false), 3500);
      void removeTeacherMediaFiles(dropped);
    } catch (err) {
      setError(errorText(err, "Не удалось сохранить визитку"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-16">
        <Spinner label="Загружаем визитку…" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-3 rounded-2xl bg-studio-surface p-6 ring-1 ring-studio-border">
        <p className="text-sm text-red-400">{loadError}</p>
        <Button variant="secondary" onClick={() => void load()}>
          Повторить
        </Button>
      </div>
    );
  }

  const photos = card.media.filter((item) => item.kind === "photo");
  const videos = card.media.filter((item) => item.kind === "video");
  const busy = saving || Boolean(uploading);

  const mediaControls = (item: TeacherMedia, index: number, total: number) => (
    <div className="mt-2 space-y-2">
      <input
        value={item.caption}
        onChange={(event) => updateMedia(item.id, { caption: event.target.value })}
        maxLength={140}
        placeholder="Подпись (необязательно)"
        className={FIELD}
      />
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => moveMedia(item.id, -1)}
          disabled={index === 0}
          className="flex h-10 flex-1 items-center justify-center rounded-lg bg-studio-card ring-1 ring-studio-border disabled:opacity-40"
          aria-label="Переместить раньше"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => moveMedia(item.id, 1)}
          disabled={index === total - 1}
          className="flex h-10 flex-1 items-center justify-center rounded-lg bg-studio-card ring-1 ring-studio-border disabled:opacity-40"
          aria-label="Переместить позже"
        >
          <ArrowRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => removeMedia(item.id)}
          className="flex h-10 flex-1 items-center justify-center rounded-lg bg-red-500/10 text-red-400 ring-1 ring-red-500/30"
          aria-label="Удалить"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4 pb-28">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-2xl font-semibold">Визитка преподавателя</h2>
          <p className="text-sm text-studio-muted">
            Показывается на странице «Преподаватель» и в слайд-шоу на главной.
          </p>
        </div>
        <a
          href={TEACHER_CARD_PATH}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-studio-surface px-4 text-sm ring-1 ring-studio-border hover:ring-studio-accent/40 sm:w-auto"
        >
          Открыть на сайте <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      <Section title="Основное">
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-studio-muted">Имя</span>
            <input
              value={card.fullName}
              onChange={(event) => update({ fullName: event.target.value })}
              maxLength={80}
              placeholder="Например: Ирина Топченкина"
              className={FIELD}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-studio-muted">Кто вы — одной строкой</span>
            <input
              value={card.headline}
              onChange={(event) => update({ headline: event.target.value })}
              maxLength={140}
              placeholder="Например: Преподаватель по вокалу, исполнительница"
              className={FIELD}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-studio-muted">
              О себе (пустая строка — новый абзац; первый абзац виден на главной)
            </span>
            <textarea
              value={card.bio}
              onChange={(event) => update({ bio: event.target.value })}
              rows={8}
              maxLength={4000}
              className={`${FIELD} resize-y leading-relaxed`}
            />
          </label>
        </div>
      </Section>

      <Section
        title="Фотографии"
        hint="Первое фото — главное. Все фото идут в слайд-шоу на главной и на странице преподавателя."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((item, index) => (
            <div key={item.id}>
              <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-studio-card ring-1 ring-studio-border">
                <img
                  src={teacherMediaUrl(item.path)}
                  alt={item.caption || `Фото ${index + 1}`}
                  className="h-full w-full object-cover"
                />
                {index === 0 ? (
                  <span className="absolute left-2 top-2 rounded-full bg-studio-accent px-2 py-0.5 text-[11px] font-medium text-white">
                    Главное
                  </span>
                ) : null}
              </div>
              {mediaControls(item, index, photos.length)}
            </div>
          ))}
        </div>
        <input
          ref={photoInput}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => void onFiles("photo", event.target.files)}
        />
        <Button
          variant="secondary"
          className="mt-4 w-full sm:w-auto"
          disabled={busy}
          onClick={() => photoInput.current?.click()}
        >
          <ImagePlus className="h-4 w-4" /> Добавить фото
        </Button>
      </Section>

      <Section
        title="Вертикальные видео"
        hint="Как Reels: MP4 или MOV до 50 МБ (примерно 20–40 секунд с iPhone). Снимайте вертикально — короткие ролики быстрее грузятся у учеников."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {videos.map((item, index) => (
            <div key={item.id}>
              <video
                src={`${teacherMediaUrl(item.path)}#t=0.1`}
                controls
                playsInline
                preload="metadata"
                className="aspect-[9/16] w-full rounded-xl bg-black object-cover ring-1 ring-studio-border"
              />
              {mediaControls(item, index, videos.length)}
            </div>
          ))}
        </div>
        <input
          ref={videoInput}
          type="file"
          accept="video/mp4,video/quicktime,video/webm,.mov,.mp4"
          multiple
          className="hidden"
          onChange={(event) => void onFiles("video", event.target.files)}
        />
        <Button
          variant="secondary"
          className="mt-4 w-full sm:w-auto"
          disabled={busy}
          onClick={() => videoInput.current?.click()}
        >
          <Video className="h-4 w-4" /> Добавить видео
        </Button>
      </Section>

      <Section title="Достижения" hint="Каждое достижение — отдельной строкой.">
        <div className="space-y-2">
          {card.achievements.map((item, index) => (
            <div key={index} className="flex gap-2">
              <input
                value={item}
                onChange={(event) => updateList("achievements", index, event.target.value)}
                maxLength={200}
                placeholder="Например: Лауреат конкурса …"
                className={FIELD}
              />
              <button
                type="button"
                onClick={() => removeFromList("achievements", index)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-red-400 ring-1 ring-red-500/30"
                aria-label="Удалить достижение"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <Button
          variant="secondary"
          className="mt-3 w-full sm:w-auto"
          onClick={() => update({ achievements: [...card.achievements, ""] })}
        >
          <Plus className="h-4 w-4" /> Добавить достижение
        </Button>
      </Section>

      <Section
        title="Яндекс Музыка"
        hint="Вставьте ссылку на альбом или трек (или «Поделиться → HTML-код»). Ссылка на страницу артиста станет кнопкой «Все релизы»."
      >
        <div className="space-y-3">
          {card.musicLinks.map((item, index) => {
            const status = musicStatus(item);
            return (
              <div key={index}>
                <div className="flex gap-2">
                  <input
                    value={item}
                    onChange={(event) => updateList("musicLinks", index, event.target.value)}
                    placeholder="https://music.yandex.ru/album/…"
                    className={FIELD}
                  />
                  <button
                    type="button"
                    onClick={() => removeFromList("musicLinks", index)}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-red-400 ring-1 ring-red-500/30"
                    aria-label="Удалить ссылку"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {status ? (
                  <p
                    className={`mt-1 text-xs ${status.ok ? "text-emerald-400" : "text-red-400"}`}
                  >
                    {status.text}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
        <Button
          variant="secondary"
          className="mt-3 w-full sm:w-auto"
          onClick={() => update({ musicLinks: [...card.musicLinks, ""] })}
        >
          <Plus className="h-4 w-4" /> Добавить ссылку
        </Button>
      </Section>

      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-20 flex flex-col gap-2 rounded-2xl bg-studio-card/95 p-3 ring-1 ring-studio-border backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-studio-muted">
          {uploading || (dirty ? "Есть несохранённые изменения" : "Все изменения сохранены")}
        </p>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <Button
          className="w-full sm:w-auto"
          disabled={busy || !dirty}
          onClick={() => void save()}
        >
          {saving ? "Сохраняем…" : "Сохранить"}
        </Button>
      </div>

      <Toast
        open={toastOpen}
        message="Визитка сохранена — на сайте уже видны изменения"
        onClose={() => setToastOpen(false)}
      />
    </div>
  );
}
