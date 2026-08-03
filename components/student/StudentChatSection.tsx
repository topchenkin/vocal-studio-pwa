"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { UsersRound } from "lucide-react";
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
  const { messages: teacherMessages, error: teacherError, send: sendTeacher } =
    useChatMessages(user?.id ?? null);
  const { messages: groupMessages, error: groupError, send: sendGroup } =
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
      <div className="mb-3 flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex rounded-xl bg-studio-surface p-1 ring-1 ring-studio-border">
          <button
            type="button"
            onClick={() => setMode("teacher")}
            className={cn(
              "rounded-lg px-3 py-2 text-xs transition",
              mode === "teacher"
                ? "bg-studio-accent/20 text-studio-accent-light"
                : "text-studio-muted"
            )}
          >
            Преподаватель
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
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        {mode === "teacher" ? (
          <ChatWindow
            chatId={user.id}
            messages={teacherMessages}
            currentUser={localUser}
            onSend={(text) => void sendTeacher(text)}
            disabled={!hasChatAccess}
          />
        ) : (
          <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[200px_1fr]">
            <div className="max-h-28 overflow-y-auto rounded-2xl bg-studio-surface ring-1 ring-studio-border lg:max-h-none">
              {groups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => setSelectedGroupId(group.id)}
                  className={cn(
                    "flex w-full items-center gap-2 border-b border-studio-border/50 px-3 py-3 text-left text-sm hover:bg-studio-card",
                    activeGroupId === group.id && "bg-studio-accent/10"
                  )}
                >
                  <UsersRound className="h-3.5 w-3.5 shrink-0 text-studio-accent" />
                  <span className="truncate">{group.title}</span>
                </button>
              ))}
              {groups.length === 0 && (
                <p className="px-3 py-6 text-center text-xs text-studio-muted">
                  Вас пока не добавили в группы
                </p>
              )}
            </div>
            {activeGroup ? (
              <div className="min-h-0 flex-1">
                <ChatWindow
                  chatId={activeGroup.id}
                  messages={groupMessages}
                  currentUser={localUser}
                  onSend={(text) => void sendGroup(text)}
                  disabled={!hasChatAccess}
                  placeholder={`Сообщение в «${activeGroup.title}»...`}
                />
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl bg-studio-surface ring-1 ring-studio-border">
                <p className="text-sm text-studio-muted">Выберите группу</p>
              </div>
            )}
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
