"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, UsersRound } from "lucide-react";
import ChatWindow from "@/components/chat/ChatWindow";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { useAuth } from "@/context/AuthContext";
import { useChatMessages } from "@/hooks/useChatMessages";
import { useGroupChatMessages } from "@/hooks/useGroupChatMessages";
import { ADMIN_DISPLAY_NAME } from "@/lib/admin";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { GroupChat, StudentFolder, StudentFolderMember, StudentProfile } from "@/types";

type ChatMode = "direct" | "groups";

export default function AdminChat() {
  const { user, isMockAdmin } = useAuth();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<ChatMode>("direct");
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [groups, setGroups] = useState<GroupChat[]>([]);
  const [folders, setFolders] = useState<StudentFolder[]>([]);
  const [folderMembers, setFolderMembers] = useState<StudentFolderMember[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [groupTitle, setGroupTitle] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [seedFolderId, setSeedFolderId] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const activeStudentId = selectedStudentId ?? students[0]?.id ?? null;
  const activeGroupId = selectedGroupId ?? groups[0]?.id ?? null;
  const { messages: directMessages, error: directError, sending: sendingDirect, send: sendDirect, edit: editDirect, remove: removeDirect } =
    useChatMessages(mode === "direct" ? activeStudentId : null);
  const { messages: groupMessages, error: groupError, sending: sendingGroup, send: sendGroup, edit: editGroup, remove: removeGroup } =
    useGroupChatMessages(mode === "groups" ? activeGroupId : null);

  useEffect(() => {
    if (isMockAdmin) {
      setStudents([]);
      setGroups([]);
      return;
    }

    const load = async () => {
      const [studentsResult, groupsResult, foldersResult, membersResult] =
        await Promise.all([
          supabase
            .from("profiles")
            .select("*")
            .eq("role", "student")
            .neq("app_sub_tier", "none")
            .order("full_name"),
          supabase
            .from("group_chats")
            .select("*")
            .order("created_at", { ascending: false }),
          supabase.from("student_folders").select("*").order("sort_order"),
          supabase.from("student_folder_members").select("*"),
        ]);
      setStudents(studentsResult.data ?? []);
      setGroups(groupsResult.data ?? []);
      setFolders(foldersResult.data ?? []);
      setFolderMembers(membersResult.data ?? []);
    };
    void load();
  }, [isMockAdmin]);

  useEffect(() => {
    const group = searchParams.get("group");
    const student = searchParams.get("student");
    if (group) {
      setMode("groups");
      setSelectedGroupId(group);
      return;
    }
    if (student) {
      setMode("direct");
      setSelectedStudentId(student);
    }
  }, [searchParams]);

  const allStudentsForPicker = useMemo(() => students, [students]);

  if (!user) return null;
  const localAdmin = {
    id: user.id,
    name: ADMIN_DISPLAY_NAME,
    email: user.email ?? "",
    phone: "",
    role: "admin" as const,
    createdAt: user.created_at,
  };

  const activeStudent = students.find((student) => student.id === activeStudentId);
  const activeGroup = groups.find((group) => group.id === activeGroupId);

  const applyFolderSeed = (folderId: string) => {
    setSeedFolderId(folderId);
    if (!folderId) return;
    const ids = folderMembers
      .filter((member) => member.folder_id === folderId)
      .map((member) => member.student_id);
    setSelectedMemberIds([...new Set([...selectedMemberIds, ...ids])]);
  };

  const createGroup = async () => {
    if (!groupTitle.trim() || selectedMemberIds.length === 0) return;
    setCreating(true);
    setCreateError("");
    const { data, error } = await supabase.rpc("create_group_chat", {
      chat_title: groupTitle.trim(),
      student_ids: selectedMemberIds,
    });
    setCreating(false);
    if (error) {
      setCreateError(error.message);
      return;
    }
    const { data: created } = await supabase
      .from("group_chats")
      .select("*")
      .eq("id", data)
      .single();
    if (created) {
      setGroups((current) => [created, ...current]);
      setSelectedGroupId(created.id);
      setMode("groups");
    }
    setCreateOpen(false);
    setGroupTitle("");
    setSelectedMemberIds([]);
    setSeedFolderId("");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <div className="flex rounded-xl bg-studio-surface p-1 ring-1 ring-studio-border">
          <button
            type="button"
            onClick={() => setMode("direct")}
            className={cn(
              "rounded-lg px-3 py-2 text-xs transition",
              mode === "direct"
                ? "bg-studio-accent/20 text-studio-accent-light"
                : "text-studio-muted"
            )}
          >
            Личные
          </button>
          <button
            type="button"
            onClick={() => setMode("groups")}
            className={cn(
              "rounded-lg px-3 py-2 text-xs transition",
              mode === "groups"
                ? "bg-studio-accent/20 text-studio-accent-light"
                : "text-studio-muted"
            )}
          >
            Группы
          </button>
        </div>
        {mode === "groups" && (
          <Button size="sm" onClick={() => setCreateOpen(true)} disabled={isMockAdmin}>
            <Plus className="h-4 w-4" />
            Создать группу
          </Button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        <div className="max-h-28 w-full shrink-0 overflow-y-auto rounded-2xl bg-studio-surface ring-1 ring-studio-border lg:max-h-none lg:w-64">
          <p className="border-b border-studio-border px-4 py-3 text-xs font-medium uppercase tracking-wider text-studio-muted">
            {mode === "direct" ? "Диалоги" : "Групповые чаты"}
          </p>

          {mode === "direct" &&
            students.map((student) => (
              <button
                key={student.id}
                type="button"
                onClick={() => setSelectedStudentId(student.id)}
                className={cn(
                  "w-full border-b border-studio-border/50 px-4 py-3 text-left transition-colors hover:bg-studio-card",
                  activeStudentId === student.id && "bg-studio-accent/10"
                )}
              >
                <p className="truncate text-sm font-medium">
                  {student.full_name || student.email || "Ученик"}
                </p>
              </button>
            ))}

          {mode === "groups" &&
            groups.map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() => setSelectedGroupId(group.id)}
                className={cn(
                  "w-full border-b border-studio-border/50 px-4 py-3 text-left transition-colors hover:bg-studio-card",
                  activeGroupId === group.id && "bg-studio-accent/10"
                )}
              >
                <p className="flex items-center gap-2 truncate text-sm font-medium">
                  <UsersRound className="h-3.5 w-3.5 shrink-0 text-studio-accent" />
                  {group.title}
                </p>
              </button>
            ))}

          {mode === "direct" && students.length === 0 && (
            <p className="px-4 py-6 text-center text-xs text-studio-muted">
              {isMockAdmin
                ? "Чат недоступен в тестовом входе"
                : "Нет учеников с доступом к чату"}
            </p>
          )}
          {mode === "groups" && groups.length === 0 && (
            <p className="px-4 py-6 text-center text-xs text-studio-muted">
              Создайте первую группу
            </p>
          )}
        </div>

        <div className="min-h-0 flex-1">
          {mode === "direct" && activeStudent ? (
            <ChatWindow
              chatId={activeStudent.id}
              messages={directMessages}
              currentUser={localAdmin}
              onSend={(text) => void sendDirect(text)}
              onEdit={(id, text) => void editDirect(id, text)}
              onDelete={(id) => void removeDirect(id)}
              sendError={directError}
              sending={sendingDirect}
              focusMessageId={searchParams.get("message")}
            />
          ) : mode === "groups" && activeGroup ? (
            <ChatWindow
              chatId={activeGroup.id}
              messages={groupMessages}
              currentUser={localAdmin}
              onSend={(text) => void sendGroup(text)}
              onEdit={(id, text) => void editGroup(id, text)}
              onDelete={(id) => void removeGroup(id)}
              placeholder={`Сообщение в «${activeGroup.title}»...`}
              sendError={groupError}
              sending={sendingGroup}
            />
          ) : (
            <div className="flex h-full items-center justify-center rounded-2xl bg-studio-surface ring-1 ring-studio-border">
              <p className="text-sm text-studio-muted">Выберите диалог</p>
            </div>
          )}
        </div>
      </div>

      {(directError || groupError) && (
        <p className="text-sm text-red-400">{directError || groupError}</p>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Новый групповой чат"
        size="md"
      >
        <div className="space-y-4">
          <label>
            <span className="mb-1.5 block text-xs text-studio-muted">Название</span>
            <input
              value={groupTitle}
              onChange={(event) => setGroupTitle(event.target.value)}
              maxLength={80}
              placeholder="Например, Концертная группа"
              className="w-full rounded-xl bg-studio-surface px-4 py-3 text-sm ring-1 ring-studio-border"
            />
          </label>

          {folders.length > 0 && (
            <label>
              <span className="mb-1.5 block text-xs text-studio-muted">
                Добавить из папки
              </span>
              <select
                value={seedFolderId}
                onChange={(event) => applyFolderSeed(event.target.value)}
                className="w-full rounded-xl bg-studio-surface px-4 py-3 text-sm ring-1 ring-studio-border"
              >
                <option value="">Без папки</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <fieldset>
            <legend className="mb-2 text-xs text-studio-muted">
              Участники · {selectedMemberIds.length}
            </legend>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl bg-studio-surface p-2 ring-1 ring-studio-border">
              {allStudentsForPicker.map((student) => {
                const checked = selectedMemberIds.includes(student.id);
                return (
                  <label
                    key={student.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-studio-card"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setSelectedMemberIds((current) =>
                          checked
                            ? current.filter((id) => id !== student.id)
                            : [...current, student.id]
                        )
                      }
                    />
                    <span className="truncate">
                      {student.full_name || student.email || student.id.slice(0, 8)}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {createError && <p className="text-sm text-red-400">{createError}</p>}

          <Button
            fullWidth
            disabled={!groupTitle.trim() || selectedMemberIds.length === 0 || creating}
            onClick={() => void createGroup()}
          >
            {creating ? "Создаём…" : "Создать групповой чат"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
