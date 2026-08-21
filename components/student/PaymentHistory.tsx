"use client";

import { useEffect, useState } from "react";
import { ReceiptText } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import type { PaymentTransaction } from "@/types";

const purposeLabels: Record<PaymentTransaction["purpose"], string> = {
  app_subscription: "Подписка платформы",
  lesson_debt: "Оплата задолженности",
  lesson_package: "Пакет уроков",
  gift_certificate: "Подарочный сертификат",
};

export default function PaymentHistory({
  limit = 5,
  showEmpty = false,
}: {
  limit?: number;
  showEmpty?: boolean;
}) {
  const { user } = useAuth();
  const [items, setItems] = useState<PaymentTransaction[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from("payment_transactions")
        .select("*")
        .eq("student_id", user.id)
        .order("created_at", { ascending: false })
        .limit(limit);
      setItems(data ?? []);
      setLoaded(true);
    };
    void load();
    window.addEventListener("uvs-payment-completed", load);
    return () => window.removeEventListener("uvs-payment-completed", load);
  }, [user, limit]);

  if (!loaded) return null;
  if (items.length === 0 && !showEmpty) return null;

  return (
    <details className="rounded-2xl bg-studio-surface ring-1 ring-studio-border">
      <summary className="flex cursor-pointer list-none items-center gap-3 p-4">
        <ReceiptText className="h-5 w-5 text-studio-accent" />
        <span className="font-medium">История операций</span>
        <span className="ml-auto text-xs text-studio-muted">
          {items.length || ""}
        </span>
      </summary>
      <div className="space-y-1 border-t border-studio-border p-3">
        {items.length === 0 ? (
          <p className="px-3 py-4 text-center text-sm text-studio-muted">
            Операций пока нет
          </p>
        ) : (
          items.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between rounded-xl bg-studio-bg/40 px-3 py-2.5 text-sm"
          >
            <div>
              <p>{purposeLabels[item.purpose]}</p>
              <p className="text-[10px] text-studio-muted">
                {new Date(item.created_at).toLocaleDateString("ru-RU")}
                {item.status === "pending"
                  ? " · ожидает оплату"
                  : item.provider === "sandbox"
                    ? " · Beta без списания"
                    : item.provider === "robokassa" &&
                        Boolean(
                          (item.metadata as { is_test?: boolean } | null)?.is_test
                        )
                      ? " · тест Робокассы"
                      : ""}
              </p>
            </div>
            <span className="font-medium">
              {Number(item.amount_rub).toLocaleString("ru-RU")} ₽
            </span>
          </div>
          ))
        )}
      </div>
    </details>
  );
}
