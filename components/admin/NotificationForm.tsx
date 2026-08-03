"use client";

import { useEffect, useMemo, useState } from "react";
import { BellRing, Send, UsersRound, WalletCards } from "lucide-react";
import Button from "@/components/ui/Button";
import Toast from "@/components/ui/Toast";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import type {
  StudentFolder,
  StudentFolderMember,
  StudentProfile,
} from "@/types";

type Recipient = "all" | "debtors" | string;

const templates = [
  {
    id: "lesson",
    title: "Напоминание об уроке",
    message: "Напоминаем о предстоящем уроке. Проверьте дату и время в приложении.",
  },
  {
    id: "payment",
    title: "Оплата занятий",
    message: "Пожалуйста, проверьте баланс занятий и задолженность в личном кабинете.",
  },
  {
    id: "content",
    title: "Новый материал",
    message: "Для вас опубликован новый материал в разделе «Обучение».",
  },
];

export default function NotificationForm() {
  const { isMockAdmin } = useAuth();
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [folders, setFolders] = useState<StudentFolder[]>([]);
  const [folderMembers, setFolderMembers] = useState<StudentFolderMember[]>([]);
  const [recipient, setRecipient] = useState<Recipient>("all");
  const [message, setMessage] = useState("");
  const [title, setTitle] = useState("Уведомление");
  const [toastOpen, setToastOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [error, setError] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");

  useEffect(() => {
    if (isMockAdmin) {
      setStudents([
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
      ]);
      setLoading(false);
      return;
    }

    const loadStudents = async () => {
      const [studentsResult, foldersResult, membersResult] = await Promise.all([
        supabase.from("profiles").select("*").eq("role", "student"),
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
        setError("Не удалось загрузить получателей");
        console.error(
          "Unable to load notification recipients:",
          studentsResult.error?.message ??
            foldersResult.error?.message ??
            membersResult.error?.message
        );
      } else {
        setStudents(studentsResult.data ?? []);
        setFolders(foldersResult.data ?? []);
        setFolderMembers(membersResult.data ?? []);
      }
      setLoading(false);
    };

    void loadStudents();
  }, [isMockAdmin]);

  const recipientIds = useMemo(() => {
    if (recipient === "all") return students.map((student) => student.id);
    if (recipient === "debtors") {
      return students
        .filter((student) => student.debt_amount > 0)
        .map((student) => student.id);
    }
    if (recipient.startsWith("folder:")) {
      const folderId = recipient.slice("folder:".length);
      return folderMembers
        .filter((member) => member.folder_id === folderId)
        .map((member) => member.student_id);
    }
    return recipient ? [recipient] : [];
  }, [folderMembers, recipient, students]);

  const send = async () => {
    if (!message.trim() || recipientIds.length === 0) return;

    setSending(true);
    setError("");
    setDeliveryNote("");

    if (!isMockAdmin) {
      let {
        data: { session },
      } = await supabase.auth.getSession();
      const expiresSoon =
        !session?.expires_at || session.expires_at * 1000 < Date.now() + 60_000;
      if (expiresSoon) {
        const { data, error: refreshError } =
          await supabase.auth.refreshSession();
        if (refreshError) {
          setError("Сессия администратора истекла. Войдите повторно.");
          setSending(false);
          return;
        }
        session = data.session;
      }
      if (!session?.access_token) {
        setError("Сессия администратора не найдена. Войдите повторно.");
        setSending(false);
        return;
      }

      const response = await fetch("/api/notifications/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          recipientIds,
          title: title.trim(),
          message: message.trim(),
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        pushConfigured?: boolean;
        pushDelivered?: number;
        pushMissing?: string[];
      };

      if (!response.ok) {
        setError(`Не удалось отправить уведомление: ${result.error ?? "ошибка сервера"}`);
        setSending(false);
        return;
      }

      if (!result.pushConfigured) {
        setDeliveryNote(
          `Сообщение сохранено, но сервер не получил: ${
            result.pushMissing?.join(", ") || "VAPID-ключи"
          }.`
        );
      } else if ((result.pushDelivered ?? 0) === 0) {
        setDeliveryNote(
          "Сообщение сохранено, но у получателей пока нет активной push-подписки."
        );
      }
    }

    setSentCount(recipientIds.length);
    setMessage("");
    setSending(false);
    setToastOpen(true);
    window.setTimeout(() => setToastOpen(false), 3500);
  };

  return (
    <>
      <div className="mx-auto grid max-w-4xl gap-4 lg:grid-cols-[.8fr_1.2fr]">
        <aside className="rounded-2xl bg-studio-surface p-5 ring-1 ring-studio-border">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-studio-accent/10">
            <BellRing className="h-5 w-5 text-studio-accent" />
          </div>
          <h3 className="mt-4 font-display text-xl font-semibold">
            Центр рассылок
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-studio-muted">
            In-app и Push отправляются сразу. Если сообщение не прочитано за 5
            минут, система ставит email в очередь.
          </p>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-studio-bg/50 p-3">
              <UsersRound className="h-4 w-4 text-studio-accent" />
              <p className="mt-2 text-xl font-semibold">{students.length}</p>
              <p className="text-xs text-studio-muted">учеников</p>
            </div>
            <div className="rounded-xl bg-studio-bg/50 p-3">
              <WalletCards className="h-4 w-4 text-red-400" />
              <p className="mt-2 text-xl font-semibold">
                {students.filter((student) => student.debt_amount > 0).length}
              </p>
              <p className="text-xs text-studio-muted">должников</p>
            </div>
          </div>
        </aside>

        <section className="rounded-2xl bg-studio-surface p-5 ring-1 ring-studio-border">
          <div className="space-y-5">
            <label>
              <span className="mb-1.5 block text-xs font-medium text-studio-muted">
                Получатель
              </span>
              <select
                value={recipient}
                disabled={loading}
                onChange={(event) => setRecipient(event.target.value)}
                className="w-full rounded-xl bg-studio-card px-4 py-3 text-sm ring-1 ring-studio-border focus:outline-none focus:ring-studio-accent"
              >
                <option value="all">Все ученики</option>
                <option value="debtors">Должники</option>
                {folders.length > 0 && (
                  <optgroup label="Папки">
                    {folders.map((folder) => (
                      <option key={folder.id} value={`folder:${folder.id}`}>
                        Папка: {folder.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="Конкретный ученик">
                  {students.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.full_name || student.email || student.id.slice(0, 8)}
                      {" · "}
                      {student.app_sub_tier}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <span className="mb-1.5 block text-xs font-medium text-studio-muted">
                  Шаблон
                </span>
                <select
                  defaultValue=""
                  onChange={(event) => {
                    const template = templates.find(
                      (item) => item.id === event.target.value
                    );
                    if (template) {
                      setTitle(template.title);
                      setMessage(template.message);
                    }
                  }}
                  className="w-full rounded-xl bg-studio-card px-4 py-3 text-sm ring-1 ring-studio-border"
                >
                  <option value="">Свободный текст</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="mb-1.5 block text-xs font-medium text-studio-muted">
                  Тема в чате
                </span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={80}
                  placeholder="Например: Напоминание об уроке"
                  className="w-full rounded-xl bg-studio-card px-4 py-3 text-sm ring-1 ring-studio-border"
                />
                <span className="mt-1 block text-[10px] text-studio-muted">
                  В push заголовком всегда будет «Иришка»
                </span>
              </label>
            </div>

            <label>
              <span className="mb-1.5 block text-xs font-medium text-studio-muted">
                Текст сообщения
              </span>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={6}
                maxLength={500}
                placeholder="Например: Ваш урок состоится завтра в 14:00"
                className="w-full resize-none rounded-xl bg-studio-card px-4 py-3 text-sm leading-relaxed ring-1 ring-studio-border focus:outline-none focus:ring-studio-accent"
              />
              <span className="mt-1 flex justify-between text-[10px] text-studio-muted">
                <span>Получателей: {recipientIds.length}</span>
                <span>{message.length}/500</span>
              </span>
            </label>

            {error && <p className="text-sm text-red-400">{error}</p>}
            {deliveryNote && (
              <p className="text-sm text-amber-300">{deliveryNote}</p>
            )}

            <Button
              fullWidth
              size="lg"
              disabled={!message.trim() || recipientIds.length === 0 || sending}
              onClick={() => void send()}
            >
              <Send className="h-5 w-5" />
              {sending ? "Отправка…" : "Отправить In-app + Push"}
            </Button>
          </div>
        </section>
      </div>

      <Toast
        open={toastOpen}
        message={`Уведомление отправлено: ${sentCount} получател${
          sentCount === 1 ? "ю" : "ям"
        }`}
        onClose={() => setToastOpen(false)}
      />
    </>
  );
}
