"use client";

import { useEffect, useMemo, useState } from "react";
import { BellRing, Send, WalletCards } from "lucide-react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Toast from "@/components/ui/Toast";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import type { StudentProfile } from "@/types";

const PAYMENT_TITLE = "Оплата занятий";
const SUBSCRIPTION_URL = "/dashboard/student/subscription";

const DEMO_STUDENTS: StudentProfile[] = [
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

function formatRub(amount: number) {
  return `${amount.toLocaleString("ru-RU")} ₽`;
}

function studentLabel(student: StudentProfile) {
  return student.full_name?.trim() || student.email || "Ученик";
}

function fillTemplate(template: string, student: StudentProfile) {
  return template
    .split("{name}")
    .join(studentLabel(student))
    .split("{amount}")
    .join(formatRub(student.debt_amount))
    .trim();
}

function defaultMessage(student?: StudentProfile) {
  if (student) {
    return `Здравствуйте, ${studentLabel(student)}! По данным студии у вас задолженность ${formatRub(student.debt_amount)}. Пожалуйста, оплатите в разделе «Подписка».`;
  }
  return "Здравствуйте, {name}! По данным студии у вас задолженность {amount}. Пожалуйста, оплатите в разделе «Подписка».";
}

export default function DebtorsPanel() {
  const { isMockAdmin } = useAuth();
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState("");
  const [draft, setDraft] = useState("");
  const [targets, setTargets] = useState<StudentProfile[] | null>(null);

  useEffect(() => {
    if (isMockAdmin) {
      setStudents(DEMO_STUDENTS);
      setLoading(false);
      return;
    }

    const load = async () => {
      const { data, error: loadError } = await supabase
        .from("profiles")
        .select("*")
        .eq("role", "student")
        .gt("debt_amount", 0)
        .order("debt_amount", { ascending: false });

      if (loadError) {
        setError("Не удалось загрузить список должников");
        console.error("Unable to load debtors:", loadError.message);
      } else {
        setStudents(data ?? []);
      }
      setLoading(false);
    };

    void load();
  }, [isMockAdmin]);

  const debtors = useMemo(
    () => students.filter((student) => student.debt_amount > 0),
    [students]
  );
  const totalDebt = useMemo(
    () => debtors.reduce((sum, student) => sum + student.debt_amount, 0),
    [debtors]
  );

  const openPreview = (nextTargets: StudentProfile[]) => {
    if (nextTargets.length === 0) return;
    setError("");
    setTargets(nextTargets);
    setDraft(
      nextTargets.length === 1
        ? defaultMessage(nextTargets[0])
        : defaultMessage()
    );
  };

  const send = async () => {
    if (!targets?.length || !draft.trim()) return;
    const message = draft.trim();
    if (message.length > 500) {
      setError("Текст уведомления не длиннее 500 символов");
      return;
    }

    setSending(true);
    setError("");

    if (!isMockAdmin) {
      const rows = targets.map((student) => ({
        recipient_id: student.id,
        recipient_role: "student" as const,
        title: PAYMENT_TITLE,
        message: fillTemplate(message, student).slice(0, 500),
        kind: "payment" as const,
        action_url: SUBSCRIPTION_URL,
        email_fallback_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      }));

      const { error: insertError } = await supabase
        .from("notifications")
        .insert(rows);

      if (insertError) {
        setError(`Не удалось отправить уведомление: ${insertError.message}`);
        setSending(false);
        return;
      }
    }

    const count = targets.length;
    setTargets(null);
    setSending(false);
    setToast(
      `Уведомление отправлено ${count} ${
        count === 1 ? "ученику" : "должникам"
      }. Push придёт автоматически.`
    );
    window.setTimeout(() => setToast(""), 3500);
  };

  return (
    <>
      <div className="mx-auto max-w-3xl space-y-4">
        <section className="rounded-2xl bg-studio-surface p-5 ring-1 ring-studio-border">
          <div className="flex items-start justify-between gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-studio-accent/10">
              <WalletCards className="h-5 w-5 text-studio-accent" />
            </div>
            {debtors.length > 0 && (
              <Button
                size="sm"
                onClick={() => openPreview(debtors)}
                disabled={loading}
              >
                <BellRing className="h-4 w-4" />
                Уведомить всех
              </Button>
            )}
          </div>
          <h3 className="mt-4 font-display text-xl font-semibold">Должники</h3>
          <p className="mt-2 text-sm leading-relaxed text-studio-muted">
            Ученики с текущей задолженностью. Можно напомнить одному или всем
            сразу — после отправки придёт push об оплате.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-studio-bg/50 p-3">
              <p className="text-xl font-semibold">{debtors.length}</p>
              <p className="text-xs text-studio-muted">должников</p>
            </div>
            <div className="rounded-xl bg-studio-bg/50 p-3">
              <p className="text-xl font-semibold text-red-400">
                {formatRub(totalDebt)}
              </p>
              <p className="text-xs text-studio-muted">сумма долга</p>
            </div>
          </div>
        </section>

        {error && !targets && <p className="text-sm text-red-400">{error}</p>}

        {loading ? (
          <div className="flex justify-center py-10">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-studio-accent border-t-transparent" />
          </div>
        ) : debtors.length === 0 ? (
          <div className="rounded-2xl bg-studio-card p-6 text-center ring-1 ring-studio-border">
            <p className="font-medium">Сейчас никто не должен</p>
            <p className="mt-1 text-sm text-studio-muted">
              Список появится, когда у ученика будет долг больше нуля.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {debtors.map((student) => (
              <li
                key={student.id}
                className="flex items-center gap-3 rounded-2xl bg-studio-card px-4 py-3 ring-1 ring-studio-border"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {studentLabel(student)}
                  </p>
                  <p className="text-sm text-red-400">
                    {formatRub(student.debt_amount)}
                  </p>
                </div>
                <Button size="sm" onClick={() => openPreview([student])}>
                  Уведомить
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal
        open={Boolean(targets)}
        onClose={() => {
          if (!sending) setTargets(null);
        }}
        title={
          targets?.length === 1
            ? `Уведомить: ${studentLabel(targets[0])}`
            : `Уведомить всех (${targets?.length ?? 0})`
        }
      >
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-studio-muted">
            Текст уведомления
          </span>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={7}
            maxLength={500}
            className="w-full resize-none rounded-xl bg-studio-surface px-4 py-3 text-sm leading-relaxed ring-1 ring-studio-border focus:outline-none focus:ring-studio-accent"
          />
          <span className="mt-1 flex justify-between text-[10px] text-studio-muted">
            <span>
              {targets && targets.length > 1
                ? "{name} и {amount} подставятся для каждого ученика"
                : "После отправки придёт push об оплате"}
            </span>
            <span>{draft.length}/500</span>
          </span>
        </label>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        <div className="mt-5 flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            disabled={sending}
            onClick={() => setTargets(null)}
          >
            Отмена
          </Button>
          <Button
            className="flex-1"
            disabled={!draft.trim() || sending}
            onClick={() => void send()}
          >
            <Send className="h-4 w-4" />
            {sending ? "Отправка…" : "Отправить"}
          </Button>
        </div>
      </Modal>

      <Toast open={Boolean(toast)} message={toast} onClose={() => setToast("")} />
    </>
  );
}
