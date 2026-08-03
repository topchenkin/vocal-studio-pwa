"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  User,
  Notification,
  Lesson,
  ChatMessage,
  Note,
} from "@/lib/types";
import {
  loadFromStorage,
  saveToStorage,
  STORAGE_KEYS,
  generateId,
} from "@/lib/storage";
import {
  createInitialUsers,
  createInitialLessons,
  createInitialNotifications,
  createInitialNotes,
  createInitialChat,
} from "@/lib/constants";

interface AppDataContextValue {
  users: User[];
  notifications: Notification[];
  lessons: Lesson[];
  chatMessages: ChatMessage[];
  notes: Note[];
  unreadCount: (userId: string) => number;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: (userId: string) => void;
  sendNotification: (userId: string, title: string, message: string) => void;
  bookLesson: (lessonId: string, student: User) => void;
  cancelLesson: (lessonId: string) => void;
  rescheduleLesson: (lessonId: string, newDate: string, newTime: string) => void;
  createAvailableSlot: (date: string, time: string) => void;
  sendChatMessage: (chatId: string, sender: User, text: string) => void;
  getNoteForStudent: (studentId: string) => Note | undefined;
  updateNote: (studentId: string, homework: string, teacherComment: string) => void;
  refreshUsers: () => void;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

function initializeStorage() {
  const initialized = loadFromStorage<boolean>(STORAGE_KEYS.initialized, false);
  if (!initialized) {
    saveToStorage(STORAGE_KEYS.users, createInitialUsers());
    saveToStorage(STORAGE_KEYS.lessons, createInitialLessons());
    saveToStorage(STORAGE_KEYS.notifications, createInitialNotifications());
    saveToStorage(STORAGE_KEYS.notes, createInitialNotes());
    saveToStorage(STORAGE_KEYS.chat, createInitialChat());
    saveToStorage(STORAGE_KEYS.initialized, true);
  }
}

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [users, setUsers] = useState<User[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const loadAll = useCallback(() => {
    initializeStorage();
    setUsers(loadFromStorage(STORAGE_KEYS.users, createInitialUsers()));
    setNotifications(
      loadFromStorage(STORAGE_KEYS.notifications, createInitialNotifications())
    );
    setLessons(loadFromStorage(STORAGE_KEYS.lessons, createInitialLessons()));
    setChatMessages(loadFromStorage(STORAGE_KEYS.chat, createInitialChat()));
    setNotes(loadFromStorage(STORAGE_KEYS.notes, createInitialNotes()));
  }, []);

  useEffect(() => {
    loadAll();
    setHydrated(true);

    const handler = () => {
      setUsers(loadFromStorage(STORAGE_KEYS.users, createInitialUsers()));
    };
    window.addEventListener("uvs-data-update", handler);
    return () => window.removeEventListener("uvs-data-update", handler);
  }, [loadAll]);

  useEffect(() => {
    if (!hydrated) return;
    saveToStorage(STORAGE_KEYS.users, users);
  }, [users, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    saveToStorage(STORAGE_KEYS.notifications, notifications);
  }, [notifications, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    saveToStorage(STORAGE_KEYS.lessons, lessons);
  }, [lessons, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    saveToStorage(STORAGE_KEYS.chat, chatMessages);
  }, [chatMessages, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    saveToStorage(STORAGE_KEYS.notes, notes);
  }, [notes, hydrated]);

  const unreadCount = useCallback(
    (userId: string) =>
      notifications.filter((n) => n.userId === userId && !n.read).length,
    [notifications]
  );

  const markNotificationRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const markAllNotificationsRead = useCallback((userId: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.userId === userId ? { ...n, read: true } : n))
    );
  }, []);

  const sendNotification = useCallback(
    (userId: string, title: string, message: string) => {
      const notification: Notification = {
        id: generateId("n"),
        userId,
        title,
        message,
        read: false,
        createdAt: new Date().toISOString(),
      };
      setNotifications((prev) => [notification, ...prev]);
    },
    []
  );

  const bookLesson = useCallback((lessonId: string, student: User) => {
    setLessons((prev) =>
      prev.map((l) =>
        l.id === lessonId
          ? {
              ...l,
              status: "booked" as const,
              studentId: student.id,
              studentName: student.name,
            }
          : l
      )
    );
  }, []);

  const cancelLesson = useCallback((lessonId: string) => {
    setLessons((prev) =>
      prev.map((l) =>
        l.id === lessonId
          ? {
              ...l,
              status: "cancelled" as const,
              studentId: undefined,
              studentName: undefined,
            }
          : l
      )
    );
  }, []);

  const rescheduleLesson = useCallback(
    (lessonId: string, newDate: string, newTime: string) => {
      setLessons((prev) =>
        prev.map((l) =>
          l.id === lessonId ? { ...l, date: newDate, time: newTime } : l
        )
      );
    },
    []
  );

  const createAvailableSlot = useCallback((date: string, time: string) => {
    const slot: Lesson = {
      id: generateId("l"),
      date,
      time,
      status: "available",
      duration: 60,
    };
    setLessons((prev) => [...prev, slot]);
  }, []);

  const sendChatMessage = useCallback(
    (chatId: string, sender: User, text: string) => {
      const msg: ChatMessage = {
        id: generateId("c"),
        chatId,
        senderId: sender.id,
        senderName: sender.name,
        text,
        createdAt: new Date().toISOString(),
      };
      setChatMessages((prev) => [...prev, msg]);
    },
    []
  );

  const getNoteForStudent = useCallback(
    (studentId: string) => notes.find((n) => n.studentId === studentId),
    [notes]
  );

  const updateNote = useCallback(
    (studentId: string, homework: string, teacherComment: string) => {
      setNotes((prev) => {
        const existing = prev.find((n) => n.studentId === studentId);
        if (existing) {
          return prev.map((n) =>
            n.studentId === studentId
              ? { ...n, homework, teacherComment, updatedAt: new Date().toISOString() }
              : n
          );
        }
        return [
          ...prev,
          {
            id: generateId("note"),
            studentId,
            homework,
            teacherComment,
            updatedAt: new Date().toISOString(),
          },
        ];
      });
    },
    []
  );

  const refreshUsers = useCallback(() => {
    setUsers(loadFromStorage(STORAGE_KEYS.users, createInitialUsers()));
  }, []);

  const value = useMemo<AppDataContextValue>(
    () => ({
      users,
      notifications,
      lessons,
      chatMessages,
      notes,
      unreadCount,
      markNotificationRead,
      markAllNotificationsRead,
      sendNotification,
      bookLesson,
      cancelLesson,
      rescheduleLesson,
      createAvailableSlot,
      sendChatMessage,
      getNoteForStudent,
      updateNote,
      refreshUsers,
    }),
    [
      users,
      notifications,
      lessons,
      chatMessages,
      notes,
      unreadCount,
      markNotificationRead,
      markAllNotificationsRead,
      sendNotification,
      bookLesson,
      cancelLesson,
      rescheduleLesson,
      createAvailableSlot,
      sendChatMessage,
      getNoteForStudent,
      updateNote,
      refreshUsers,
    ]
  );

  if (!hydrated) return null;

  return (
    <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
  );
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within AppDataProvider");
  return ctx;
}
