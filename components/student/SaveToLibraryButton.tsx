"use client";

import { useEffect, useState } from "react";
import { BookmarkPlus, Check, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { saveAudioFromUrl } from "@/lib/student-audio";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import CabinetTabLink from "@/components/dashboard/CabinetTabLink";
import type { StudentAudioSource } from "@/types";

export default function SaveToLibraryButton({
  url,
  source,
  title,
}: {
  url: string;
  source: StudentAudioSource;
  title: string;
}) {
  const { user, isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(title);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) setName(title);
  }, [open, title]);

  const onSave = async () => {
    if (!user || saving) return;
    const nextTitle = name.trim();
    if (!nextTitle) {
      setError("Напишите название трека");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await saveAudioFromUrl({
        url,
        source,
        title: nextTitle,
        userId: user.id,
        isAdmin,
      });
      setSaved(true);
      setOpen(false);
      window.dispatchEvent(new Event("uvs-audio-saved"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => {
          setError("");
          setOpen(true);
        }}
        disabled={saving || !user}
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-studio-accent-light ring-1 ring-studio-accent/30 transition hover:bg-studio-accent/10 disabled:opacity-50"
      >
        {saving ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : saved ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <BookmarkPlus className="h-3.5 w-3.5" />
        )}
        {saving ? "Сохраняем…" : saved ? "В кабинете" : "В Мои аудио"}
      </button>
      {saved && (
        <CabinetTabLink
          href={
            isAdmin
              ? "/dashboard/admin?tab=audio"
              : "/dashboard/student?tab=audio"
          }
          tabId="audio"
          className="text-[11px] text-studio-accent hover:underline"
        >
          Открыть
        </CabinetTabLink>
      )}

      <Modal
        open={open}
        onClose={() => {
          if (!saving) setOpen(false);
        }}
        title="Сохранить в Мои аудио"
        size="sm"
      >
        <label className="block text-sm">
          <span className="mb-1.5 block text-studio-muted">Название трека</span>
          <input
            autoFocus
            value={name}
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void onSave();
              }
            }}
            className="w-full rounded-xl bg-studio-surface px-3 py-2.5 text-sm ring-1 ring-studio-border"
            placeholder="Например, Минусовка — любимая песня"
          />
        </label>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={saving}
            onClick={() => setOpen(false)}
          >
            Отмена
          </Button>
          <Button size="sm" disabled={saving || !user} onClick={() => void onSave()}>
            {saving ? "Сохраняем…" : "Сохранить"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
