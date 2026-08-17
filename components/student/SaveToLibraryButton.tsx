"use client";

import { useState } from "react";
import Link from "next/link";
import { BookmarkPlus, Check, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { saveAudioFromUrl } from "@/lib/student-audio";
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
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const onSave = async () => {
    if (!user || saving) return;
    setSaving(true);
    setError("");
    try {
      await saveAudioFromUrl({
        url,
        source,
        title,
        userId: user.id,
        isAdmin,
      });
      setSaved(true);
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
        onClick={() => void onSave()}
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
        <Link
          href={
            isAdmin
              ? "/dashboard/admin?tab=audio"
              : "/dashboard/student?tab=audio"
          }
          className="text-[11px] text-studio-accent hover:underline"
        >
          Открыть
        </Link>
      )}
      {error && (
        <p className="max-w-[14rem] text-right text-[11px] text-red-400">{error}</p>
      )}
    </div>
  );
}
