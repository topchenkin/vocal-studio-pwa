"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ChatWindow from "@/components/chat/ChatWindow";
import PaywallOverlay from "@/components/ui/PaywallOverlay";
import { useAuth } from "@/context/AuthContext";
import { useChatMessages } from "@/hooks/useChatMessages";
import { useGroupChatMessages } from "@/hooks/useGroupChatMessages";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { GroupChat } from "@/types";

type ChatMode = "teacher" | "groups";

export default function StudentChatSection() {
  const { user, tier } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<ChatMode>("teacher");
  const [groups, setGroups] = useState<GroupChat[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const hasChatAccess = tier !== "none";
  const activeGroupId = selectedGroupId ?? groups[0]?.id ?? null;
  const { messages: teacherMessages, error: teacherError, sending: sendingTeacher, send: sendTeacher, edit: editTeacher, remove: removeTeacher } =
    useChatMessages(user?.id ?? null);
  const { messages: groupMessages, error: groupError, sending: sendingGroup, send: sendGroup, edit: editGroup, remove: removeGroup } =
    useGroupChatMessages(mode === "groups" ? activeGroupId : null);

  useEffect(() => {
    if (!user) return;
    const loadGroups = async () => {
      const { data: memberships } = await supabase
        .from("group_chat_members")
        .select("group_id")
        .eq("student_id", user.id);
      const ids = (memberships ?? []).map((item) => item.group_id);
      if (ids.length === 0) {
        setGroups([]);
        return;
      }
      const { data } = await supabase
        .from("group_chats")
        .select("*")
        .in("id", ids)
        .order("created_at", { ascending: false });
      setGroups(data ?? []);
    };
    void loadGroups();
  }, [user]);

  useEffect(() => {
    const group = searchParams.get("group");
    if (group) {
      setMode("groups");
      setSelectedGroupId(group);
    }
  }, [searchParams]);

  if (!user) return null;
  const localUser = {
    id: user.id,
    name: String(user.user_metadata.full_name ?? user.email ?? "Ученик"),
    email: user.email ?? "",
    phone: "",
    role: "student_free" as const,
    createdAt: user.created_at,
  };
  const activeGroup = groups.find((group) => group.id === activeGroupId);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex shrink-0 gap-1">
        <button
          type="button"
          onClick={() => setMode("teacher")}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-medium transition",
            mode === "teacher"
              ? "bg-studio-accent/20 text-studio-accent-light"
              : "text-studio-muted hover:text-studio-text"
          )}
        >
          Преподаватель
        </button>
        <button
          type="button"
          onClick={() => setMode("groups")}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-medium transition",
            mode === "groups"
              ? "bg-studio-accent/20 text-studio-accent-light"
              : "text-studio-muted hover:text-studio-text"
          )}
        >
          Группы
        </button>
      </div>

      {mode === "groups" && (
        <div className="mb-2 flex shrink-0 gap-1 overflow-x-hidden">
          <div className="flex max-w-full flex-wrap gap-1">
            {groups.map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() => setSelectedGroupId(group.id)}
                className={cn(
                  "max-w-full rounded-full px-3 py-1 text-xs leading-snug transition",
                  activeGroupId === group.id
                    ? "bg-studio-accent/20 text-studio-accent-light"
                    : "bg-studio-surface text-studio-muted"
                )}
              >
                <span className="break-words">{group.title}</span>
              </button>
            ))}
            {groups.length === 0 && (
              <p className="px-1 py-1 text-xs text-studio-muted">
                Вас пока не добавили в группы
              </p>
            )}
          </div>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1 flex-col">
        {mode === "teacher" ? (
          <ChatWindow
            flush
            chatId={user.id}
            messages={teacherMessages}
            currentUser={localUser}
            onSend={(text) => void sendTeacher(text)}
            onEdit={(id, text) => void editTeacher(id, text)}
            onDelete={(id) => void removeTeacher(id)}
            disabled={!hasChatAccess}
            sendError={teacherError}
            sending={sendingTeacher}
            focusMessageId={searchParams.get("message")}
          />
        ) : activeGroup ? (
          <ChatWindow
            flush
            chatId={activeGroup.id}
            messages={groupMessages}
            currentUser={localUser}
            onSend={(text) => void sendGroup(text)}
            onEdit={(id, text) => void editGroup(id, text)}
            onDelete={(id) => void removeGroup(id)}
            disabled={!hasChatAccess}
            placeholder={`Сообщение в «${activeGroup.title}»...`}
            sendError={groupError}
            sending={sendingGroup}
          />
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <p className="text-sm text-studio-muted">Выберите группу</p>
          </div>
        )}

        {(teacherError || groupError) && (
          <p className="mt-2 shrink-0 text-sm text-red-400">
            {teacherError || groupError}
          </p>
        )}

        {!hasChatAccess && (
          <PaywallOverlay
            title="Чат с преподавателем"
            description="Доступно с подпиской Standard и выше"
            onUpgrade={() => router.push("/")}
          />
        )}
      </div>
    </div>
  );
}
