"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Eye,
  EyeOff,
  FileVideo2,
  Music2,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import type {
  AppSubscriptionTier,
  CatLevel,
  Exercise,
  StudentFolder,
  StudentProfile,
} from "@/types";

const tierOptions: AppSubscriptionTier[] = [
  "none",
  "standard",
  "premium",
  "vip",
];
const catOptions: Array<{ value: CatLevel; label: string }> = [
  { value: "beginner", label: "Мурчащий котик" },
  { value: "basic", label: "Певчий котик" },
  { value: "pro", label: "Джазовый кот" },
  { value: "star", label: "Кот-Звезда" },
];

type VisibilityPreset =
  | "everyone"
  | "by_tier"
  | "by_cat"
  | "folders"
  | "students"
  | "hybrid";

interface ContentDraft {
  title: string;
  description: string;
  type: "audio" | "video";
  min_tier_required: AppSubscriptionTier;
  min_cat_level: CatLevel;
  active_students_only: boolean;
  audience_mode: Exercise["audience_mode"];
  is_published: boolean;
  visibilityPreset: VisibilityPreset;
}

const emptyDraft: ContentDraft = {
  title: "",
  description: "",
  type: "audio",
  min_tier_required: "none",
  min_cat_level: "beginner",
  active_students_only: false,
  audience_mode: "rules",
  is_published: false,
  visibilityPreset: "everyone",
};

function applyPreset(
  draft: ContentDraft,
  preset: VisibilityPreset
): ContentDraft {
  switch (preset) {
    case "everyone":
      return {
        ...draft,
        visibilityPreset: preset,
        audience_mode: "rules",
        min_tier_required: "none",
        min_cat_level: "beginner",
      };
    case "by_tier":
      return {
        ...draft,
        visibilityPreset: preset,
        audience_mode: "rules",
        min_tier_required:
          draft.min_tier_required === "none" ? "standard" : draft.min_tier_required,
        min_cat_level: "beginner",
      };
    case "by_cat":
      return {
        ...draft,
        visibilityPreset: preset,
        audience_mode: "rules",
        min_tier_required: "none",
      };
    case "folders":
    case "students":
      return {
        ...draft,
        visibilityPreset: preset,
        audience_mode: "selected",
        min_tier_required: "none",
        min_cat_level: "beginner",
      };
    case "hybrid":
      return {
        ...draft,
        visibilityPreset: preset,
        audience_mode: "rules_or_selected",
      };
  }
}

function detectPreset(item: Exercise): VisibilityPreset {
  if (item.audience_mode === "selected") return "folders";
  if (item.audience_mode === "rules_or_selected") return "hybrid";
  if (item.min_tier_required !== "none") return "by_tier";
  if (item.min_cat_level !== "beginner") return "by_cat";
  return "everyone";
}

export default function ContentManager() {
  const { user, isMockAdmin } = useAuth();
  const [items, setItems] = useState<Exercise[]>([]);
  const [folders, setFolders] = useState<StudentFolder[]>([]);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [folderAccess, setFolderAccess] = useState<
    Array<{ exercise_id: string; folder_id: string }>
  >([]);
  const [studentAccess, setStudentAccess] = useState<
    Array<{ exercise_id: string; student_id: string; effect: "allow" | "deny" }>
  >([]);
  const [editing, setEditing] = useState<Exercise | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<ContentDraft>(emptyDraft);
  const [selectedFolders, setSelectedFolders] = useState<string[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (isMockAdmin) {
      setItems([]);
      setLoading(false);
      return;
    }

    const [itemsResult, foldersResult, studentsResult, folderAccessResult, studentAccessResult] =
      await Promise.all([
        supabase.from("exercises").select("*").order("created_at", { ascending: false }),
        supabase.from("student_folders").select("*").order("sort_order"),
        supabase.from("profiles").select("*").eq("role", "student").order("full_name"),
        supabase.from("exercise_folder_access").select("*"),
        supabase.from("exercise_student_access").select("*"),
      ]);

    const queryError =
      itemsResult.error ??
      foldersResult.error ??
      studentsResult.error ??
      folderAccessResult.error ??
      studentAccessResult.error;
    if (queryError) {
      setError(`Не удалось загрузить библиотеку: ${queryError.message}`);
    } else {
      setItems(itemsResult.data ?? []);
      setFolders(foldersResult.data ?? []);
      setStudents(studentsResult.data ?? []);
      setFolderAccess(folderAccessResult.data ?? []);
      setStudentAccess(studentAccessResult.data ?? []);
    }
    setLoading(false);
  }, [isMockAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setDraft(emptyDraft);
    setSelectedFolders([]);
    setSelectedStudents([]);
    setFile(null);
    setCreateOpen(true);
  };

  const openEdit = (item: Exercise) => {
    setEditing(item);
    setDraft({
      title: item.title,
      description: item.description,
      type: item.type,
      min_tier_required: item.min_tier_required,
      min_cat_level: item.min_cat_level,
      active_students_only: item.active_students_only,
      audience_mode: item.audience_mode,
      is_published: item.is_published,
      visibilityPreset: detectPreset(item),
    });
    setSelectedFolders(
      folderAccess
        .filter((access) => access.exercise_id === item.id)
        .map((access) => access.folder_id)
    );
    setSelectedStudents(
      studentAccess
        .filter(
          (access) =>
            access.exercise_id === item.id && access.effect === "allow"
        )
        .map((access) => access.student_id)
    );
    setFile(null);
    setCreateOpen(true);
  };

  const save = async () => {
    if (!draft.title.trim() || (!editing?.storage_path && !file) || !user) return;
    setSaving(true);
    setError("");

    let storagePath = editing?.storage_path ?? null;
    let mediaUrl = editing?.media_url ?? "";
    if (file) {
      storagePath = `${crypto.randomUUID()}/${file.name.replace(/[^\w.-]+/g, "-")}`;
      const { error: uploadError } = await supabase.storage
        .from("exercise-media")
        .upload(storagePath, file, { upsert: false });
      if (uploadError) {
        setError(`Не удалось загрузить файл: ${uploadError.message}`);
        setSaving(false);
        return;
      }
      mediaUrl = "";
    }

    const { visibilityPreset: _preset, ...fields } = draft;
    const payload = {
      ...fields,
      title: draft.title.trim(),
      description: draft.description.trim(),
      media_url: mediaUrl,
      storage_path: storagePath,
      created_by: user.id,
    };

    const result = editing
      ? await supabase
          .from("exercises")
          .update(payload)
          .eq("id", editing.id)
          .select("*")
          .single()
      : await supabase.from("exercises").insert(payload).select("*").single();
    if (result.error) {
      setError(`Не удалось сохранить материал: ${result.error.message}`);
      setSaving(false);
      return;
    }

    const exerciseId = result.data.id;
    await Promise.all([
      supabase
        .from("exercise_folder_access")
        .delete()
        .eq("exercise_id", exerciseId),
      supabase
        .from("exercise_student_access")
        .delete()
        .eq("exercise_id", exerciseId),
    ]);
    const accessResults = await Promise.all([
      selectedFolders.length
        ? supabase.from("exercise_folder_access").insert(
            selectedFolders.map((folderId) => ({
              exercise_id: exerciseId,
              folder_id: folderId,
            }))
          )
        : Promise.resolve({ error: null }),
      selectedStudents.length
        ? supabase.from("exercise_student_access").insert(
            selectedStudents.map((studentId) => ({
              exercise_id: exerciseId,
              student_id: studentId,
              effect: "allow" as const,
            }))
          )
        : Promise.resolve({ error: null }),
    ]);

    if (accessResults.some((accessResult) => accessResult.error)) {
      setError("Материал сохранён, но аудитория обновилась не полностью");
      setSaving(false);
      return;
    }

    setSaving(false);
    setCreateOpen(false);
    await load();
  };

  const togglePublished = async (item: Exercise) => {
    const { data, error: updateError } = await supabase
      .from("exercises")
      .update({ is_published: !item.is_published })
      .eq("id", item.id)
      .select("*")
      .single();
    if (updateError) {
      setError(`Не удалось изменить публикацию: ${updateError.message}`);
      return;
    }
    setItems((current) =>
      current.map((candidate) => (candidate.id === item.id ? data : candidate))
    );
  };

  const remove = async (item: Exercise) => {
    const { error: deleteError } = await supabase
      .from("exercises")
      .delete()
      .eq("id", item.id);
    if (deleteError) {
      setError(`Не удалось удалить материал: ${deleteError.message}`);
      return;
    }
    if (item.storage_path) {
      await supabase.storage.from("exercise-media").remove([item.storage_path]);
    }
    setItems((current) => current.filter((candidate) => candidate.id !== item.id));
  };

  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-44 animate-pulse rounded-2xl bg-studio-surface" />
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h3 className="font-display text-xl font-semibold">Контент</h3>
            <p className="text-sm text-studio-muted">
              Аудио и видео с правилами видимости без доработки кода
            </p>
          </div>
          <Button onClick={openCreate} disabled={isMockAdmin}>
            <Plus className="h-4 w-4" />
            Добавить материал
          </Button>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <article
              key={item.id}
              className="rounded-2xl bg-studio-surface p-4 ring-1 ring-studio-border transition hover:ring-studio-accent/30"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-studio-accent/10">
                  {item.type === "audio" ? (
                    <Music2 className="h-5 w-5 text-studio-accent" />
                  ) : (
                    <FileVideo2 className="h-5 w-5 text-studio-accent" />
                  )}
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] ${
                    item.is_published
                      ? "bg-emerald-500/10 text-emerald-300"
                      : "bg-studio-card text-studio-muted"
                  }`}
                >
                  {item.is_published ? "Опубликован" : "Черновик"}
                </span>
              </div>
              <h4 className="mt-4 font-medium">{item.title}</h4>
              <p className="mt-1 line-clamp-2 text-xs text-studio-muted">
                {item.description || "Без описания"}
              </p>
              <p className="mt-3 text-[10px] uppercase tracking-wide text-studio-accent">
                {item.min_tier_required} · {item.min_cat_level} ·{" "}
                {item.audience_mode}
              </p>
              <div className="mt-4 flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => openEdit(item)}>
                  Настроить
                </Button>
                <button
                  type="button"
                  onClick={() => void togglePublished(item)}
                  className="rounded-lg p-2 text-studio-muted hover:text-white"
                  aria-label={item.is_published ? "Снять с публикации" : "Опубликовать"}
                >
                  {item.is_published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => void remove(item)}
                  className="rounded-lg p-2 text-studio-muted hover:text-red-400"
                  aria-label="Удалить материал"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </article>
          ))}
        </div>

        {items.length === 0 && (
          <div className="rounded-2xl bg-studio-surface p-10 text-center ring-1 ring-studio-border">
            <Upload className="mx-auto h-8 w-8 text-studio-muted" />
            <p className="mt-3 text-sm text-studio-muted">
              Загрузите первый материал
            </p>
          </div>
        )}
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={editing ? "Настройка материала" : "Новый материал"}
        size="lg"
      >
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="mb-1.5 block text-xs text-studio-muted">Название</span>
              <input
                value={draft.title}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                className="w-full rounded-xl bg-studio-surface px-4 py-3 text-sm ring-1 ring-studio-border"
              />
            </label>
            <label>
              <span className="mb-1.5 block text-xs text-studio-muted">Тип</span>
              <select
                value={draft.type}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    type: event.target.value as "audio" | "video",
                  }))
                }
                className="w-full rounded-xl bg-studio-surface px-4 py-3 text-sm ring-1 ring-studio-border"
              >
                <option value="audio">Аудио</option>
                <option value="video">Видео</option>
              </select>
            </label>
          </div>

          <label>
            <span className="mb-1.5 block text-xs text-studio-muted">Описание</span>
            <textarea
              value={draft.description}
              onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
              rows={3}
              className="w-full resize-none rounded-xl bg-studio-surface px-4 py-3 text-sm ring-1 ring-studio-border"
            />
          </label>

          <label className="block rounded-2xl border border-dashed border-studio-border p-5 text-center">
            <Upload className="mx-auto h-5 w-5 text-studio-accent" />
            <span className="mt-2 block text-sm">
              {file?.name || (editing?.storage_path ? "Заменить медиафайл" : "Выбрать медиафайл")}
            </span>
            <span className="mt-1 block text-xs text-studio-muted">До 100 МБ · MP3/WAV/OGG/MP4/WebM</span>
            <input
              type="file"
              accept={draft.type === "audio" ? "audio/*" : "video/*"}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="sr-only"
            />
          </label>

          <fieldset>
            <legend className="mb-2 text-xs text-studio-muted">Кто видит</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ["everyone", "Все ученики (любой Котик)"],
                  ["by_tier", "По тарифу платформы"],
                  ["by_cat", "По уровню Котика"],
                  ["folders", "Только выбранные папки"],
                  ["students", "Только выбранные ученики"],
                  ["hybrid", "Тариф/Котик или папки/ученики"],
                ] as Array<[VisibilityPreset, string]>
              ).map(([value, label]) => (
                <label
                  key={value}
                  className={`cursor-pointer rounded-xl px-3 py-2.5 text-sm ring-1 transition ${
                    draft.visibilityPreset === value
                      ? "bg-studio-accent/15 text-studio-accent-light ring-studio-accent"
                      : "bg-studio-surface text-studio-muted ring-studio-border"
                  }`}
                >
                  <input
                    type="radio"
                    className="sr-only"
                    checked={draft.visibilityPreset === value}
                    onChange={() =>
                      setDraft((current) => applyPreset(current, value))
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          {(draft.visibilityPreset === "by_tier" ||
            draft.visibilityPreset === "hybrid") && (
            <label>
              <span className="mb-1.5 block text-xs text-studio-muted">
                Минимальный тариф
              </span>
              <select
                value={draft.min_tier_required}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    min_tier_required: event.target.value as AppSubscriptionTier,
                  }))
                }
                className="w-full rounded-xl bg-studio-surface px-3 py-3 text-sm ring-1 ring-studio-border"
              >
                {tierOptions.map((tier) => (
                  <option key={tier} value={tier}>
                    {tier === "none" ? "любой" : tier}
                  </option>
                ))}
              </select>
            </label>
          )}

          {(draft.visibilityPreset === "by_cat" ||
            draft.visibilityPreset === "hybrid") && (
            <label>
              <span className="mb-1.5 block text-xs text-studio-muted">
                Уровень Котика
              </span>
              <select
                value={draft.min_cat_level}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    min_cat_level: event.target.value as CatLevel,
                  }))
                }
                className="w-full rounded-xl bg-studio-surface px-3 py-3 text-sm ring-1 ring-studio-border"
              >
                <option value="beginner">Все уровни Котика</option>
                {catOptions
                  .filter((cat) => cat.value !== "beginner")
                  .map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      от «{cat.label}» и выше
                    </option>
                  ))}
              </select>
            </label>
          )}

          {(draft.visibilityPreset === "folders" ||
            draft.visibilityPreset === "hybrid") && (
            <AudienceChips
              title="Папки"
              items={folders.map((folder) => ({
                id: folder.id,
                label: folder.name,
              }))}
              selected={selectedFolders}
              onChange={setSelectedFolders}
            />
          )}

          {(draft.visibilityPreset === "students" ||
            draft.visibilityPreset === "hybrid") && (
            <AudienceChips
              title="Конкретные ученики"
              items={students.map((student) => ({
                id: student.id,
                label:
                  student.full_name || student.email || student.id.slice(0, 8),
              }))}
              selected={selectedStudents}
              onChange={setSelectedStudents}
            />
          )}

          <div className="flex flex-wrap gap-4 rounded-2xl bg-studio-surface p-4 ring-1 ring-studio-border">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.active_students_only}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    active_students_only: event.target.checked,
                  }))
                }
              />
              Только активные ученики
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.is_published}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    is_published: event.target.checked,
                  }))
                }
              />
              Опубликовать сразу
            </label>
          </div>

          <Button
            fullWidth
            disabled={saving || !draft.title.trim() || (!editing?.storage_path && !file)}
            onClick={() => void save()}
          >
            {saving ? "Сохраняем и загружаем…" : "Сохранить материал"}
          </Button>
        </div>
      </Modal>
    </>
  );
}

function AudienceChips({
  title,
  items,
  selected,
  onChange,
}: {
  title: string;
  items: Array<{ id: string; label: string }>;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-xs text-studio-muted">{title}</legend>
      <div className="max-h-36 space-y-1 overflow-y-auto rounded-xl bg-studio-surface p-2 ring-1 ring-studio-border">
        {items.map((item) => {
          const checked = selected.includes(item.id);
          return (
            <label
              key={item.id}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-studio-card"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() =>
                  onChange(
                    checked
                      ? selected.filter((id) => id !== item.id)
                      : [...selected, item.id]
                  )
                }
              />
              <span className="truncate">{item.label}</span>
            </label>
          );
        })}
        {items.length === 0 && (
          <p className="px-2 py-3 text-center text-xs text-studio-muted">
            Пока пусто
          </p>
        )}
      </div>
    </fieldset>
  );
}
