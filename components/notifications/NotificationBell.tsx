"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { realtimeTopic } from "@/lib/client-instance";
import { isIosDevice } from "@/lib/ios";
import { supabase } from "@/lib/supabase";
import type { AppNotification } from "@/types";

function formatNotificationDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((character) => character.charCodeAt(0)));
}

function keysMatch(current: ArrayBuffer | null, expected: Uint8Array) {
  if (!current) return false;
  const currentBytes = new Uint8Array(current);
  return (
    currentBytes.length === expected.length &&
    currentBytes.every((byte, index) => byte === expected[index])
  );
}

export default function NotificationBell() {
  const { user, isAdmin, isMockAdmin } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | null>(
    null
  );
  const [pushError, setPushError] = useState("");

  const subscribeToPush = useCallback(async () => {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (
      !user ||
      isMockAdmin ||
      !publicKey ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      isIosDevice()
    ) {
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const applicationServerKey = urlBase64ToUint8Array(publicKey);
      let subscription = await registration.pushManager.getSubscription();
      if (
        subscription &&
        !keysMatch(
          subscription.options.applicationServerKey,
          applicationServerKey
        )
      ) {
        await subscription.unsubscribe();
        subscription = null;
      }
      subscription ??= await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
      const serialized = subscription.toJSON();
      if (!serialized.endpoint || !serialized.keys?.p256dh || !serialized.keys.auth) {
        throw new Error("Браузер не вернул ключи push-подписки");
      }

      const { error } = await supabase.rpc("register_push_subscription", {
        subscription_endpoint: serialized.endpoint,
        subscription_p256dh: serialized.keys.p256dh,
        subscription_auth: serialized.keys.auth,
      });
      if (error) throw error;
      setPushError("");
    } catch (error) {
      setPushError(
        error instanceof Error ? error.message : "Не удалось включить push"
      );
    }
  }, [isMockAdmin, user]);

  const loadNotifications = useCallback(async () => {
    if (!user || isMockAdmin) {
      setNotifications([]);
      return;
    }

    let query = supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    query = isAdmin
      ? query.or(
          `recipient_id.eq.${user.id},and(recipient_role.eq.admin,recipient_id.is.null)`
        )
      : query.eq("recipient_id", user.id);

    const { data, error } = await query;
    if (error) {
      console.error("Unable to load notifications:", error.message);
      return;
    }
    setNotifications(data ?? []);
  }, [isAdmin, isMockAdmin, user]);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermission(window.Notification.permission);
      if (window.Notification.permission === "granted") {
        void subscribeToPush();
      }
    }
    void loadNotifications();
  }, [loadNotifications, subscribeToPush]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const registerAfterWorkerUpdate = () => void subscribeToPush();
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      registerAfterWorkerUpdate
    );
    return () =>
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        registerAfterWorkerUpdate
      );
  }, [subscribeToPush]);

  useEffect(() => {
    if (!user || isMockAdmin) return;

    const channel = supabase
      .channel(realtimeTopic(`notifications:${user.id}`))
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (payload) => {
          const incoming = payload.new as AppNotification;
          const belongsToUser =
            incoming.recipient_id === user.id ||
            (isAdmin &&
              incoming.recipient_role === "admin" &&
              incoming.recipient_id === null);

          if (!belongsToUser) return;

          setNotifications((current) => [
            incoming,
            ...current.filter((item) => item.id !== incoming.id),
          ]);

        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void loadNotifications();
      });

    const refreshWhenActive = () => {
      if (document.visibilityState === "visible") void loadNotifications();
    };
    const refreshWhenOnline = () => void loadNotifications();
    document.addEventListener("visibilitychange", refreshWhenActive);
    window.addEventListener("online", refreshWhenOnline);

    return () => {
      document.removeEventListener("visibilitychange", refreshWhenActive);
      window.removeEventListener("online", refreshWhenOnline);
      void supabase.removeChannel(channel);
    };
  }, [isAdmin, isMockAdmin, loadNotifications, user]);

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.is_read).length,
    [notifications]
  );

  const enablePush = async () => {
    if (!("Notification" in window)) return;
    const nextPermission = await window.Notification.requestPermission();
    setPermission(nextPermission);
    if (nextPermission === "granted") {
      await subscribeToPush();
    }
  };

  const markNotificationRead = async (id: string) => {
    const readAt = new Date().toISOString();
    setNotifications((current) =>
      current.map((item) =>
        item.id === id ? { ...item, is_read: true, read_at: readAt } : item
      )
    );
    await supabase
      .from("notifications")
      .update({ is_read: true, read_at: readAt })
      .eq("id", id);
  };

  const markAllNotificationsRead = async () => {
    const unreadIds = notifications
      .filter((item) => !item.is_read)
      .map((item) => item.id);
    if (unreadIds.length === 0) return;

    setNotifications((current) =>
      current.map((item) => ({
        ...item,
        is_read: true,
        read_at: new Date().toISOString(),
      }))
    );
    const readAt = new Date().toISOString();
    await supabase
      .from("notifications")
      .update({ is_read: true, read_at: readAt })
      .in("id", unreadIds);
  };

  if (!user) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((current) => !current);
          void loadNotifications();
        }}
        className="relative rounded-lg p-2 text-studio-muted transition-colors hover:bg-studio-card hover:text-white"
        aria-label="Уведомления"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-studio-accent px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl bg-studio-card ring-1 ring-studio-border shadow-card"
            >
              <div className="flex items-center justify-between border-b border-studio-border px-4 py-3">
                <span className="text-sm font-medium">Уведомления</span>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => void markAllNotificationsRead()}
                    className="text-xs text-studio-accent hover:underline"
                  >
                    Прочитать все
                  </button>
                )}
              </div>

              {permission === "default" && (
                <button
                  type="button"
                  onClick={() => void enablePush()}
                  className="w-full border-b border-studio-border bg-studio-accent/10 px-4 py-2.5 text-xs text-studio-accent-light hover:bg-studio-accent/15"
                >
                  Включить системные push-уведомления
                </button>
              )}
              {pushError && (
                <p className="border-b border-studio-border px-4 py-2 text-xs text-red-400">
                  Push: {pushError}
                </p>
              )}

              <div className="max-h-72 overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-studio-muted">
                    Нет уведомлений
                  </p>
                ) : (
                  notifications.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        void markNotificationRead(item.id).then(() => {
                          if (item.action_url) {
                            window.location.assign(item.action_url);
                          }
                        });
                      }}
                      className={`w-full border-b border-studio-border/50 px-4 py-3 text-left transition-colors hover:bg-studio-surface ${
                        !item.is_read ? "bg-studio-accent/5" : ""
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {!item.is_read && (
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-studio-accent" />
                        )}
                        <div className={!item.is_read ? "" : "pl-4"}>
                          <p className="text-sm">{item.message}</p>
                          <p className="mt-1 text-[10px] text-studio-muted/70">
                            {formatNotificationDate(item.created_at)}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
