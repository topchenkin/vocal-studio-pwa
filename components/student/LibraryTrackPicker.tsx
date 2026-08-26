"use client";

import { useEffect, useState } from "react";
import { Music2 } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import {
  formatTrackDuration,
  listOwnAudioTracks,
  signedAudioUrl,
  sourceLabel,
} from "@/lib/student-audio";
import { decodeBlobToAudioBuffer } from "@/lib/wav-client";
import type { StudentAudioTrack } from "@/types";

export default function LibraryTrackPicker({
  open,
  onClose,
  onPicked,
}: {
  open: boolean;
  onClose: () => void;
  onPicked: (buffer: AudioBuffer, title: string) => void;
}) {
  const { user } = useAuth();
  const [tracks, setTracks] = useState<StudentAudioTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [pickingId, setPickingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    void listOwnAudioTracks(user.id)
      .then((items) => {
        if (!cancelled) setTracks(items);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Не удалось открыть библиотеку");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, user]);

  const pick = async (track: StudentAudioTrack) => {
    if (pickingId) return;
    setPickingId(track.id);
    setError("");
    try {
      const url = await signedAudioUrl(track.storage_path);
      const response = await fetch(url);
      if (!response.ok) throw new Error("Не удалось скачать трек");
      const blob = await response.blob();
      const buffer = await decodeBlobToAudioBuffer(blob);
      onPicked(buffer, track.title);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить трек");
    } finally {
      setPickingId(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Мои аудио" size="md">
      {loading ? (
        <p className="text-sm text-studio-muted">Загружаем библиотеку…</p>
      ) : tracks.length === 0 ? (
        <p className="text-sm text-studio-muted">
          В «Мои аудио» пока пусто. Запишите голос, загрузите файл или сохраните
          результат из другого инструмента.
        </p>
      ) : (
        <ul className="space-y-2">
          {tracks.map((track) => (
            <li key={track.id}>
              <button
                type="button"
                disabled={Boolean(pickingId)}
                onClick={() => void pick(track)}
                className="flex w-full items-center gap-3 rounded-2xl bg-studio-bg px-3 py-3 text-left ring-1 ring-studio-border transition hover:ring-fuchsia-400/50 disabled:opacity-60"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-fuchsia-500/15 text-fuchsia-300">
                  <Music2 className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-studio-text">
                    {track.title}
                  </span>
                  <span className="block text-[11px] text-studio-muted">
                    {sourceLabel(track.source)} · {formatTrackDuration(track.duration_sec)}
                    {pickingId === track.id ? " · открываем…" : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
      <div className="mt-4 flex justify-end">
        <Button variant="secondary" size="sm" onClick={onClose}>
          Закрыть
        </Button>
      </div>
    </Modal>
  );
}
