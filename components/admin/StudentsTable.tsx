"use client";

import { useEffect, useState } from "react";
import {
  CalendarX2,
  Folder,
  FolderPlus,
  Link2,
  Minus,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserRoundCheck,
} from "lucide-react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import NumberInput from "@/components/ui/NumberInput";
import HomeworkAssigner from "@/components/admin/HomeworkAssigner";
import BulkCancelLessonsModal from "@/components/admin/BulkCancelLessonsModal";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { CAT_LEVEL_OPTIONS } from "@/lib/cat-levels";
import CatLevelText from "@/components/ui/CatLevelText";
import type {
  AppSubscriptionTier,
  CatLevel,
  LessonPayType,
  StudentFolder,
  StudentFolderMember,
  StudentProfile,
} from "@/types";

const tierOptions: Array<{ value: AppSubscriptionTier; label: string }> = [
  { value: "none", label: "None" },
  { value: "standard", label: "Standard" },
  { value: "premium", label: "Premium" },
  { value: "vip", label: "VIP" },
];

const catOptions = CAT_LEVEL_OPTIONS;

const mockStudents: StudentProfile[] = [
  {
    id: "demo-student-anna",
    email: "anna@example.com",
    full_name: "Анна Волкова",
    role: "student",
    app_sub_tier: "premium",
    app_sub_variant: "individual",
    cat_level: "pro",
    is_active_student: true,
    lesson_pay_type: "abonement",
    custom_lesson_price: 3000,
    custom_abonement_price: 20000,
    lessons_balance: 5,
    debt_amount: 0,
  },
  {
    id: "demo-student-max",
    email: "max@example.com",
    full_name: "Максим Орлов",
    role: "student",
    app_sub_tier: "standard",
    app_sub_variant: "individual",
    cat_level: "basic",
    is_active_student: true,
    lesson_pay_type: "one_time",
    custom_lesson_price: 3500,
    custom_abonement_price: 0,
    lessons_balance: 0,
    debt_amount: 3500,
  },
];

function AdminGiftNote({
  giftCertificateId,
  buyerName,
  giftKind,
}: {
  giftCertificateId: string;
  buyerName?: string | null;
  giftKind?: string | null;
}) {
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("gift_certificates")
        .select("note")
        .eq("id", giftCertificateId)
        .maybeSingle();
      if (!cancelled) setNote(data?.note ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [giftCertificateId]);

  return (
    <div className="rounded-2xl bg-studio-gold/10 p-4 ring-1 ring-studio-gold/35">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-studio-gold">
        Подарочный сертификат
      </p>
      <p className="mt-2 text-sm">
        {buyerName ? `От: ${buyerName}. ` : ""}
        {note || "Есть активированный подарок — не забудьте одобрить ученика."}
      </p>
      {giftKind && (
        <p className="mt-2 text-xs text-studio-muted">Тип: {giftKind}</p>
      )}
    </div>
  );
}

function StudentEditor({
  student,
  open,
  onClose,
  onSaved,
  folders,
  memberFolderIds,
  onFoldersSaved,
  mockMode,
  onBulkCancel,
}: {
  student: StudentProfile | null;
  open: boolean;
  onClose: () => void;
  onSaved: (profile: StudentProfile) => void;
  folders: StudentFolder[];
  memberFolderIds: string[];
  onFoldersSaved: (studentId: string, folderIds: string[]) => void;
  mockMode: boolean;
  onBulkCancel: (student: StudentProfile) => void;
}) {
  const [draft, setDraft] = useState<StudentProfile | null>(student);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selectedFolderIds, setSelectedFolderIds] =
    useState<string[]>(memberFolderIds);
  const [newDuoPartnerEmail, setNewDuoPartnerEmail] = useState("");
  const [changingDuo, setChangingDuo] = useState(false);

  useEffect(() => {
    setDraft(student);
    setSelectedFolderIds(memberFolderIds);
    setError("");
  }, [memberFolderIds, student]);

  if (!draft) return null;

  const updateDraft = <K extends keyof StudentProfile>(
    key: K,
    value: StudentProfile[K]
  ) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  };

  const save = async () => {
    setSaving(true);
    setError("");

    const updates = {
      is_active_student: draft.is_active_student,
      app_sub_tier: draft.app_sub_tier,
      app_sub_expires_at: draft.app_sub_expires_at || null,
      cat_level: draft.cat_level,
      lesson_pay_type: draft.lesson_pay_type,
      custom_lesson_price:
        draft.lesson_pay_type === "one_time"
          ? draft.custom_lesson_price
          : 0,
      custom_abonement_price:
        draft.lesson_pay_type === "abonement"
          ? draft.custom_abonement_price
          : 0,
      lessons_balance: draft.lessons_balance,
      debt_amount: draft.debt_amount,
    };

    if (mockMode) {
      setSaving(false);
      onSaved({ ...draft, ...updates });
      onFoldersSaved(draft.id, selectedFolderIds);
      onClose();
      return;
    }

    const { data, error: updateError } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", draft.id)
      .select("*")
      .single();

    if (updateError) {
      setSaving(false);
      setError("Не удалось сохранить профиль");
      console.error("Unable to update student:", updateError.message);
      return;
    }

    const { error: deleteFoldersError } = await supabase
      .from("student_folder_members")
      .delete()
      .eq("student_id", draft.id);
    const { error: insertFoldersError } =
      selectedFolderIds.length > 0
        ? await supabase.from("student_folder_members").insert(
            selectedFolderIds.map((folderId) => ({
              folder_id: folderId,
              student_id: draft.id,
            }))
          )
        : { error: null };
    setSaving(false);

    if (deleteFoldersError || insertFoldersError) {
      setError("Профиль сохранён, но не удалось обновить папки");
      return;
    }

    onSaved(data);
    onFoldersSaved(draft.id, selectedFolderIds);
    onClose();
  };

  const changeDuoPartner = async () => {
    if (!draft || !newDuoPartnerEmail.trim()) return;
    setChangingDuo(true);
    setError("");
    const { error: duoError } = await supabase.rpc("admin_change_duo_partner", {
      duo_owner_id: draft.id,
      new_partner_email: newDuoPartnerEmail.trim(),
    });
    setChangingDuo(false);
    if (duoError) {
      setError(`Не удалось сменить Duo-партнёра: ${duoError.message}`);
      return;
    }
    setNewDuoPartnerEmail("");
  };

  return (
    <Modal open={open} onClose={onClose} title="Карточка ученика" size="lg">
      <div className="space-y-6">
        <div className="flex items-center justify-between rounded-2xl bg-studio-surface p-4 ring-1 ring-studio-border">
          <div>
            <p className="font-medium">Активный ученик</p>
            <p className="mt-0.5 text-xs text-studio-muted">
              Открывает доступ к расписанию занятий
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={draft.is_active_student}
            onClick={() =>
              updateDraft("is_active_student", !draft.is_active_student)
            }
            className={`relative h-7 w-12 rounded-full transition ${
              draft.is_active_student ? "bg-studio-accent" : "bg-studio-border"
            }`}
          >
            <span
              className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                draft.is_active_student ? "left-6" : "left-1"
              }`}
            />
          </button>
        </div>

        {draft.gift_certificate_id && (
          <AdminGiftNote
            giftCertificateId={draft.gift_certificate_id}
            buyerName={draft.gift_buyer_name}
            giftKind={draft.gift_kind}
          />
        )}

        <fieldset>
          <legend className="mb-2 text-xs font-medium text-studio-muted">
            Подписка платформы
          </legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {tierOptions.map((tier) => (
              <label
                key={tier.value}
                className={`cursor-pointer rounded-xl px-3 py-2.5 text-center text-sm ring-1 transition ${
                  draft.app_sub_tier === tier.value
                    ? "bg-studio-accent/15 text-studio-accent-light ring-studio-accent"
                    : "bg-studio-surface text-studio-muted ring-studio-border"
                }`}
              >
                <input
                  type="radio"
                  name="tier"
                  value={tier.value}
                  checked={draft.app_sub_tier === tier.value}
                  disabled={draft.app_sub_variant !== "individual"}
                  onChange={() => updateDraft("app_sub_tier", tier.value)}
                  className="sr-only"
                />
                {tier.label}
              </label>
            ))}
          </div>
          {draft.app_sub_variant !== "individual" && (
            <p className="mt-2 text-xs text-studio-muted">
              Тариф управляется подпиской Duo.
            </p>
          )}
          <label className="mt-3 block">
            <span className="mb-1.5 block text-xs text-studio-muted">
              Подписка действует до
            </span>
            <input
              type="date"
              value={
                draft.app_sub_expires_at
                  ? draft.app_sub_expires_at.slice(0, 10)
                  : ""
              }
              onChange={(event) => {
                const value = event.target.value;
                updateDraft(
                  "app_sub_expires_at",
                  value ? `${value}T23:59:59.000Z` : null
                );
              }}
              className="w-full rounded-xl bg-studio-surface px-4 py-3 text-sm ring-1 ring-studio-border focus:outline-none focus:ring-studio-accent"
            />
          </label>
        </fieldset>

        <fieldset className="rounded-2xl bg-studio-accent/5 p-4 ring-1 ring-studio-accent/20">
          <legend className="mb-2 px-1 text-xs font-medium text-studio-accent-light">
            Распределить по папкам
          </legend>
          {folders.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {folders.map((folder) => {
                const checked = selectedFolderIds.includes(folder.id);
                return (
                  <label
                    key={folder.id}
                    className={`cursor-pointer rounded-xl px-3 py-2 text-sm ring-1 transition ${
                      checked
                        ? "bg-studio-accent/15 text-studio-accent-light ring-studio-accent"
                        : "bg-studio-surface text-studio-muted ring-studio-border"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setSelectedFolderIds((current) =>
                          checked
                            ? current.filter((id) => id !== folder.id)
                            : [...current, folder.id]
                        )
                      }
                      className="sr-only"
                    />
                    {folder.name}
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-studio-muted">
              Сначала создайте папку кнопкой «Папки» над списком учеников, затем
              отметьте её здесь и сохраните карточку.
            </p>
          )}
        </fieldset>

        {draft.app_sub_variant === "duo_owner" && (
          <div className="rounded-2xl bg-studio-accent/10 p-4 ring-1 ring-studio-accent/25">
            <p className="font-medium">Управление Duo</p>
            <p className="mt-1 text-xs text-studio-muted">
              Только администратор может заменить уже подключённого партнёра.
            </p>
            <div className="mt-3 flex gap-2">
              <input
                type="email"
                value={newDuoPartnerEmail}
                onChange={(event) => setNewDuoPartnerEmail(event.target.value)}
                placeholder="Email нового партнёра"
                className="min-w-0 flex-1 rounded-xl bg-studio-surface px-3 py-2.5 text-sm ring-1 ring-studio-border"
              />
              <Button
                size="sm"
                disabled={!newDuoPartnerEmail.trim() || changingDuo}
                onClick={() => void changeDuoPartner()}
              >
                <Link2 className="h-4 w-4" />
                Заменить
              </Button>
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <span className="mb-1.5 block text-xs font-medium text-studio-muted">
              Уровень кота
            </span>
            <select
              value={draft.cat_level}
              onChange={(event) =>
                updateDraft("cat_level", event.target.value as CatLevel)
              }
              className="w-full rounded-xl bg-studio-surface px-4 py-3 text-sm ring-1 ring-studio-border focus:outline-none focus:ring-studio-accent"
            >
              {catOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="mb-1.5 block text-xs font-medium text-studio-muted">
              Тип оплаты уроков
            </span>
            <select
              value={draft.lesson_pay_type}
              onChange={(event) => {
                const nextType = event.target.value as LessonPayType;
                // Keep both prices in draft — zeroing the inactive one made
                // the field stick at 0 after switching pay type.
                setDraft((current) =>
                  current
                    ? { ...current, lesson_pay_type: nextType }
                    : current
                );
              }}
              className="w-full rounded-xl bg-studio-surface px-4 py-3 text-sm ring-1 ring-studio-border focus:outline-none focus:ring-studio-accent"
            >
              <option value="abonement">Абонемент</option>
              <option value="one_time">Разово</option>
            </select>
          </label>
        </div>

        <NumberInput
          label={
            draft.lesson_pay_type === "abonement"
              ? "Стоимость абонемента, ₽"
              : "Стоимость одного урока, ₽"
          }
          value={
            draft.lesson_pay_type === "abonement"
              ? draft.custom_abonement_price
              : draft.custom_lesson_price
          }
          onChange={(value) =>
            updateDraft(
              draft.lesson_pay_type === "abonement"
                ? "custom_abonement_price"
                : "custom_lesson_price",
              value
            )
          }
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-xs font-medium text-studio-muted">
              Остаток уроков
            </p>
            <div className="flex items-center gap-2 rounded-xl bg-studio-surface p-2 ring-1 ring-studio-border">
              <button
                type="button"
                onClick={() =>
                  updateDraft(
                    "lessons_balance",
                    Math.max(0, draft.lessons_balance - 1)
                  )
                }
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-studio-card text-studio-muted hover:text-studio-text"
              >
                <Minus className="h-4 w-4" />
              </button>
              <NumberInput
                value={draft.lessons_balance}
                onChange={(value) => updateDraft("lessons_balance", value)}
                className="w-full rounded-lg bg-studio-bg px-2 py-2 text-center text-lg font-semibold tabular-nums ring-1 ring-studio-border focus:outline-none focus:ring-studio-accent"
              />
              <button
                type="button"
                onClick={() =>
                  updateDraft("lessons_balance", draft.lessons_balance + 1)
                }
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-studio-accent/20 text-studio-accent hover:bg-studio-accent/30"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
          <NumberInput
            label="Задолженность, ₽"
            value={draft.debt_amount}
            onChange={(value) => updateDraft("debt_amount", value)}
          />
        </div>

        <HomeworkAssigner studentId={draft.id} mockMode={mockMode} />

        <Button
          fullWidth
          size="sm"
          variant="danger"
          onClick={() => onBulkCancel(draft)}
        >
          <CalendarX2 className="h-4 w-4" />
          Отменить занятия за период
        </Button>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex gap-3">
          <Button variant="secondary" fullWidth onClick={onClose}>
            Отмена
          </Button>
          <Button fullWidth onClick={() => void save()} disabled={saving}>
            {saving ? "Сохраняем..." : "Сохранить"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default function StudentsTable() {
  const { isMockAdmin } = useAuth();
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [folders, setFolders] = useState<StudentFolder[]>([]);
  const [members, setMembers] = useState<StudentFolderMember[]>([]);
  const [selected, setSelected] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">(
    "all"
  );
  const [tierFilter, setTierFilter] = useState<AppSubscriptionTier | "all">(
    "all"
  );
  const [folderFilter, setFolderFilter] = useState<string>("all");
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderSaving, setFolderSaving] = useState(false);
  const [bulkStudent, setBulkStudent] = useState<StudentProfile | null>(null);
  const [bulkSuccess, setBulkSuccess] = useState("");

  useEffect(() => {
    if (isMockAdmin) {
      setStudents(mockStudents);
      setFolders([
        {
          id: "demo-folder-active",
          name: "Концертная группа",
          description: null,
          color: null,
          sort_order: 0,
          created_at: new Date(0).toISOString(),
        },
      ]);
      setMembers([
        {
          folder_id: "demo-folder-active",
          student_id: "demo-student-anna",
          created_at: new Date(0).toISOString(),
        },
      ]);
      setLoading(false);
      return;
    }

    const loadStudents = async () => {
      const [studentsResult, foldersResult, membersResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("*")
          .eq("role", "student")
          .order("is_active_student", { ascending: false }),
        supabase
          .from("student_folders")
          .select("*")
          .order("sort_order", { ascending: true }),
        supabase.from("student_folder_members").select("*"),
      ]);

      if (
        studentsResult.error ||
        foldersResult.error ||
        membersResult.error
      ) {
        setError("Не удалось загрузить учеников");
        console.error(
          "Unable to load CRM:",
          studentsResult.error?.message ??
            foldersResult.error?.message ??
            membersResult.error?.message
        );
      } else {
        setStudents(studentsResult.data ?? []);
        setFolders(foldersResult.data ?? []);
        setMembers(membersResult.data ?? []);
      }
      setLoading(false);
    };

    void loadStudents();
  }, [isMockAdmin]);

  const visibleStudents = students.filter((student) => {
    const query = search.trim().toLowerCase();
    const matchesSearch =
      !query ||
      student.full_name?.toLowerCase().includes(query) ||
      student.email?.toLowerCase().includes(query);
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active"
        ? student.is_active_student
        : !student.is_active_student);
    const matchesTier =
      tierFilter === "all" || student.app_sub_tier === tierFilter;
    const matchesFolder =
      folderFilter === "all" ||
      members.some(
        (member) =>
          member.folder_id === folderFilter &&
          member.student_id === student.id
      );
    return matchesSearch && matchesStatus && matchesTier && matchesFolder;
  });

  const saveFolder = async () => {
    if (!folderName.trim()) return;
    setFolderSaving(true);

    if (isMockAdmin) {
      setFolders((current) => [
        ...current,
        {
          id: `demo-folder-${Date.now()}`,
          name: folderName.trim(),
          description: null,
          color: null,
          sort_order: current.length,
          created_at: new Date().toISOString(),
        },
      ]);
    } else {
      const { data, error: createError } = await supabase
        .from("student_folders")
        .insert({ name: folderName.trim(), sort_order: folders.length })
        .select("*")
        .single();
      if (createError) {
        setError(`Не удалось создать папку: ${createError.message}`);
        setFolderSaving(false);
        return;
      }
      setFolders((current) => [...current, data]);
    }

    setFolderName("");
    setFolderSaving(false);
  };

  const deleteFolder = async (folderId: string) => {
    if (!isMockAdmin) {
      const { error: deleteError } = await supabase
        .from("student_folders")
        .delete()
        .eq("id", folderId);
      if (deleteError) {
        setError(`Не удалось удалить папку: ${deleteError.message}`);
        return;
      }
    }
    setFolders((current) => current.filter((folder) => folder.id !== folderId));
    setMembers((current) =>
      current.filter((member) => member.folder_id !== folderId)
    );
    if (folderFilter === folderId) setFolderFilter("all");
  };

  if (loading) {
    return (
      <div className="h-64 animate-pulse rounded-2xl bg-studio-surface ring-1 ring-studio-border" />
    );
  }

  return (
    <>
      <div className="mb-4 space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row">
          <label className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-studio-muted" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Поиск по имени или email"
              className="w-full rounded-xl bg-studio-surface py-3 pl-10 pr-4 text-sm ring-1 ring-studio-border focus:outline-none focus:ring-studio-accent"
            />
          </label>
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as typeof statusFilter)
            }
            className="rounded-xl bg-studio-surface px-4 py-3 text-sm ring-1 ring-studio-border"
          >
            <option value="all">Все статусы</option>
            <option value="active">Активные</option>
            <option value="inactive">Неактивные</option>
          </select>
          <select
            value={tierFilter}
            onChange={(event) =>
              setTierFilter(event.target.value as typeof tierFilter)
            }
            className="rounded-xl bg-studio-surface px-4 py-3 text-sm ring-1 ring-studio-border"
          >
            <option value="all">Все тарифы</option>
            {tierOptions.map((tier) => (
              <option key={tier.value} value={tier.value}>
                {tier.label}
              </option>
            ))}
          </select>
          <Button variant="secondary" onClick={() => setFolderModalOpen(true)}>
            <FolderPlus className="h-4 w-4" />
            Папки
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFolderFilter("all")}
            className={`min-w-max rounded-xl px-3 py-2 text-xs ring-1 transition ${
              folderFilter === "all"
                ? "bg-studio-accent/15 text-studio-accent-light ring-studio-accent"
                : "bg-studio-surface text-studio-muted ring-studio-border"
            }`}
          >
            Все ученики · {students.length}
          </button>
          {folders.map((folder) => (
            <button
              key={folder.id}
              type="button"
              onClick={() => setFolderFilter(folder.id)}
              className={`flex min-w-max items-center gap-1.5 rounded-xl px-3 py-2 text-xs ring-1 transition ${
                folderFilter === folder.id
                  ? "bg-studio-accent/15 text-studio-accent-light ring-studio-accent"
                  : "bg-studio-surface text-studio-muted ring-studio-border"
              }`}
            >
              <Folder className="h-3.5 w-3.5" />
              {folder.name} ·{" "}
              {
                members.filter((member) => member.folder_id === folder.id)
                  .length
              }
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
        {visibleStudents.map((student) => {
          const studentFolders = members
            .filter((member) => member.student_id === student.id)
            .map((member) =>
              folders.find((folder) => folder.id === member.folder_id)
            )
            .filter((folder): folder is StudentFolder => Boolean(folder));
          const lessonPrice =
            student.lesson_pay_type === "abonement"
              ? student.custom_abonement_price
              : student.custom_lesson_price;

          return (
            <article
              key={student.id}
              className="min-w-0 rounded-2xl bg-studio-surface p-4 ring-1 ring-studio-border transition hover:ring-studio-accent/35"
            >
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-studio-accent/10">
                  <UserRoundCheck className="h-4 w-4 text-studio-accent" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {student.full_name || "Ученик без имени"}
                      </p>
                      <p className="truncate text-xs text-studio-muted">
                        {student.email || student.id.slice(0, 12)}
                      </p>
                    </div>
                    <Badge
                      variant={student.is_active_student ? "success" : "muted"}
                    >
                      {student.is_active_student ? "Активен" : "Новый"}
                    </Badge>
                  </div>
                  {student.gift_certificate_id && (
                    <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-studio-gold">
                      Сертификат
                      {student.gift_buyer_name
                        ? ` · ${student.gift_buyer_name}`
                        : ""}
                    </p>
                  )}
                  <p className="mt-1 whitespace-nowrap text-[10px] text-studio-accent">
                    <CatLevelText
                      label={
                        catOptions.find(
                          (option) => option.value === student.cat_level
                        )?.label ?? ""
                      }
                    />
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl bg-studio-bg/50 p-3">
                  <p className="text-studio-muted">Платформа</p>
                  <p className="mt-1 font-medium capitalize">
                    {student.app_sub_tier}
                    {student.app_sub_variant !== "individual" ? " Duo" : ""}
                  </p>
                  {student.app_sub_expires_at && (
                    <p className="mt-1 text-[10px] text-studio-gold">
                      до{" "}
                      {new Date(student.app_sub_expires_at).toLocaleDateString(
                        "ru-RU"
                      )}
                    </p>
                  )}
                </div>
                <div className="rounded-xl bg-studio-bg/50 p-3">
                  <p className="text-studio-muted">
                    {student.lesson_pay_type === "abonement"
                      ? "Абонемент"
                      : "Разовый урок"}
                  </p>
                  <p className="mt-1 font-medium">
                    {lessonPrice > 0
                      ? `${lessonPrice.toLocaleString("ru-RU")} ₽`
                      : "Цена не задана"}
                  </p>
                </div>
                <div className="rounded-xl bg-studio-bg/50 p-3">
                  <p className="text-studio-muted">Уроков</p>
                  <p className="mt-1 font-medium">{student.lessons_balance}</p>
                </div>
                <div className="rounded-xl bg-studio-bg/50 p-3">
                  <p className="text-studio-muted">Долг</p>
                  <p
                    className={`mt-1 font-medium ${
                      student.debt_amount > 0 ? "text-red-400" : ""
                    }`}
                  >
                    {student.debt_amount.toLocaleString("ru-RU")} ₽
                  </p>
                </div>
              </div>

              <div className="mt-3">
                <p className="text-[10px] uppercase tracking-wide text-studio-muted">
                  Папки
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {studentFolders.length > 0 ? (
                    studentFolders.map((folder) => (
                      <span
                        key={folder.id}
                        className="flex items-center gap-1 rounded-lg bg-studio-accent/10 px-2 py-1 text-[10px] text-studio-accent-light"
                      >
                        <Folder className="h-3 w-3" />
                        {folder.name}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-studio-muted">
                      Не распределён
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button
                  fullWidth
                  size="sm"
                  variant="secondary"
                  onClick={() => setSelected(student)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Карточка
                </Button>
                <Button
                  fullWidth
                  size="sm"
                  variant="danger"
                  onClick={() => setBulkStudent(student)}
                >
                  <CalendarX2 className="h-3.5 w-3.5" />
                  Отменить занятия
                </Button>
              </div>
            </article>
          );
        })}
      </div>

      {visibleStudents.length === 0 && (
        <p className="rounded-2xl bg-studio-surface py-10 text-center text-sm text-studio-muted ring-1 ring-studio-border">
          {students.length === 0
            ? "Зарегистрированных учеников пока нет"
            : "По выбранным фильтрам учеников нет"}
        </p>
      )}
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      {bulkSuccess && (
        <p className="mt-3 text-sm text-emerald-400">{bulkSuccess}</p>
      )}

      <StudentEditor
        student={selected}
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        onSaved={(profile) =>
          setStudents((current) =>
            current.map((student) =>
              student.id === profile.id ? profile : student
            )
          )
        }
        folders={folders}
        memberFolderIds={members
          .filter((member) => member.student_id === selected?.id)
          .map((member) => member.folder_id)}
        onFoldersSaved={(studentId, folderIds) => {
          setMembers((current) => [
            ...current.filter((member) => member.student_id !== studentId),
            ...folderIds.map((folderId) => ({
              folder_id: folderId,
              student_id: studentId,
              created_at: new Date().toISOString(),
            })),
          ]);
        }}
        mockMode={isMockAdmin}
        onBulkCancel={(student) => {
          setSelected(null);
          setBulkStudent(student);
        }}
      />

      <BulkCancelLessonsModal
        open={Boolean(bulkStudent)}
        onClose={() => setBulkStudent(null)}
        students={students}
        lockedStudentId={bulkStudent?.id}
        mockMode={isMockAdmin}
        onDone={({ count }) => {
          setBulkSuccess(
            count === 1 ? "Отменено 1 занятие" : `Отменено занятий: ${count}`
          );
          window.setTimeout(() => setBulkSuccess(""), 4000);
        }}
      />

      <Modal
        open={folderModalOpen}
        onClose={() => setFolderModalOpen(false)}
        title="Папки учеников"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              value={folderName}
              onChange={(event) => setFolderName(event.target.value)}
              onKeyDown={(event) =>
                event.key === "Enter" && void saveFolder()
              }
              placeholder="Например, Концертная группа"
              maxLength={80}
              className="min-w-0 flex-1 rounded-xl bg-studio-surface px-4 py-3 text-sm ring-1 ring-studio-border focus:outline-none focus:ring-studio-accent"
            />
            <Button
              disabled={!folderName.trim() || folderSaving}
              onClick={() => void saveFolder()}
            >
              <Plus className="h-4 w-4" />
              Добавить
            </Button>
          </div>
          <div className="space-y-2">
            {folders.map((folder) => (
              <div
                key={folder.id}
                className="flex items-center justify-between rounded-xl bg-studio-surface px-3 py-2.5 ring-1 ring-studio-border"
              >
                <div className="flex items-center gap-2">
                  <Folder className="h-4 w-4 text-studio-accent" />
                  <span className="text-sm">{folder.name}</span>
                </div>
                <button
                  type="button"
                  onClick={() => void deleteFolder(folder.id)}
                  className="rounded-lg p-2 text-studio-muted transition hover:bg-red-500/10 hover:text-red-400"
                  aria-label={`Удалить папку ${folder.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </>
  );
}
