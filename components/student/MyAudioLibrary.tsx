"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Music2, Pencil, Trash2, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  STUDENT_AUDIO_MAX_TRACKS,
  deleteAudioTrack,
  formatTrackDuration,
  listOwnAudioTracks,
  renameAudioTrack,
  signedAudioUrl,
  sourceLabel,
} from "@/lib/student-audio";
import type { StudentAudioTrack } from "@/types";

export default function MyAudioLibrary() {
  const { user, isAdmin } = useAuth();
  const [items, setItems] = useState<StudentAudioTrack[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [renaming, setRenaming] = useState(false);

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setError("");
    try {
      const tracks = await listOwnAudioTracks(user.id);
      setItems(tracks);
      setLoading(false);
      const nextUrls: Record<string, string> = {};
      await Promise.all(
        tracks.map(async (track) => {
          try {
            nextUrls[track.id] = await signedAudioUrl(track.storage_path);
          } catch {
            /* keep the row even if the player URL fails */
          }
        })
      );
      setUrls(nextUrls);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось загрузить аудио"
      );
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener("uvs-audio-saved", refresh);
    return () => window.removeEventListener("uvs-audio-saved", refresh);
  }, [load]);

  const startEdit = (track: StudentAudioTrack) => {
    setEditingId(track.id);
    setEditTitle(track.title);
    setError("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditTitle("");
  };

  const saveEdit = async (track: StudentAudioTrack) => {
    if (renaming) return;
    setRenaming(true);
    setError("");
    try {
      const nextTitle = await renameAudioTrack(track.id, editTitle);
      setItems((current) =>
        current.map((item) =>
          item.id === track.id ? { ...item, title: nextTitle } : item
        )
      );
      cancelEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось переименовать");
    } finally {
      setRenaming(false);
    }
  };

  const onDelete = async (track: StudentAudioTrack) => {
    if (!window.confirm(`Удалить «${track.title}»?`)) return;
    setDeletingId(track.id);
    try {
      await deleteAudioTrack(track);
      setItems((current) => current.filter((item) => item.id !== track.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить");
    } finally {
      setDeletingId(null);
    }
  };

  if (!user) return null;

  if (loading) {
    return <div className="h-40 animate-pulse rounded-2xl bg-studio-surface" />;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold">Мои аудио</h3>
          <p className="text-xs text-studio-muted">
            {isAdmin
              ? "Администратор: без лимита по числу и длительности"
              : `${items.length} из ${STUDENT_AUDIO_MAX_TRACKS} треков · до 10 минут каждый`}
          </p>
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {items.length === 0 ? (
        <div className="rounded-2xl bg-studio-surface p-8 text-center ring-1 ring-studio-border">
          <Music2 className="mx-auto h-8 w-8 text-studio-muted" />
          <p className="mt-3 text-sm text-studio-muted">
            Пока пусто. Сохраните минусовку, вокал или сведение кнопкой «В Мои
            аудио» — файлы будут и на телефоне, и на ноутбуке.
          </p>
        </div>
      ) : (
        items.map((track) => (
          <article
            key={track.id}
            className="rounded-2xl bg-studio-surface p-4 ring-1 ring-studio-border"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {editingId === track.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={editTitle}
                      maxLength={120}
                      disabled={renaming}
                      onChange={(event) => setEditTitle(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void saveEdit(track);
                        }
                        if (event.key === "Escape") cancelEdit();
                      }}
                      className="min-w-0 flex-1 rounded-lg bg-studio-card px-2.5 py-1.5 text-sm font-medium ring-1 ring-studio-border"
                    />
                    <button
                      type="button"
                      disabled={renaming}
                      onClick={() => void saveEdit(track)}
                      className="rounded-lg p-2 text-studio-accent-light hover:bg-studio-card disabled:opacity-40"
                      aria-label="Сохранить название"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={renaming}
                      onClick={cancelEdit}
                      className="rounded-lg p-2 text-studio-muted hover:bg-studio-card hover:text-studio-text disabled:opacity-40"
                      aria-label="Отменить"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <p className="truncate font-medium">{track.title}</p>
                )}
                <p className="mt-0.5 text-xs text-studio-muted">
                  {sourceLabel(track.source)} ·{" "}
                  {formatTrackDuration(Number(track.duration_sec))} ·{" "}
                  {new Date(track.created_at).toLocaleString("ru-RU", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              {editingId !== track.id && (
                <div className="flex shrink-0">
                  <button
                    type="button"
                    onClick={() => startEdit(track)}
                    className="rounded-lg p-2 text-studio-muted hover:bg-studio-card hover:text-studio-text"
                    aria-label="Переименовать трек"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled={deletingId === track.id}
                    onClick={() => void onDelete(track)}
                    className="rounded-lg p-2 text-studio-muted hover:bg-studio-card hover:text-red-300 disabled:opacity-40"
                    aria-label="Удалить трек"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
            {urls[track.id] ? (
              <audio
                controls
                playsInline
                src={urls[track.id]}
                className="h-10 w-full"
              />
            ) : (
              <p className="text-xs text-studio-muted">Загружаем плеер…</p>
            )}
          </article>
        ))
      )}
    </div>
  );
}
