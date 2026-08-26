"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  readPayInvoice,
  readPayReturnPath,
  waitForPayment,
} from "@/lib/payment-client";

export default function PayReturnRedirect({ result }: { result: "ok" | "fail" }) {
  const [message, setMessage] = useState(
    result === "ok"
      ? "Проверяем оплату в ЮKassa…"
      : "Оплата не завершена, проверяем статус…"
  );
  const back = typeof window === "undefined" ? "/dashboard/student?tab=lessons" : readPayReturnPath();

  useEffect(() => {
    let cancelled = false;
    const invoiceNo = readPayInvoice();

    void (async () => {
      let notice: "ok" | "fail" = result;
      if (invoiceNo) {
        try {
          const synced = await waitForPayment(invoiceNo, {
            intervalMs: 1500,
            timeoutMs: 45_000,
          });
          if (synced.status === "confirmed" || synced.paid) {
            notice = "ok";
            if (!cancelled) setMessage("Оплата прошла, возвращаем в кабинет…");
          } else if (synced.status === "failed") {
            notice = "fail";
            if (!cancelled) setMessage("Оплата не прошла, возвращаем в кабинет…");
          } else if (!cancelled) {
            setMessage("Ещё подтверждаем оплату, возвращаем в кабинет…");
          }
        } catch {
          if (!cancelled) setMessage("Возвращаем в кабинет…");
        }
      }

      sessionStorage.setItem("uvs_pay_notice", notice);
      window.dispatchEvent(new Event("uvs-profile-updated"));
      window.location.replace(readPayReturnPath());
    })();

    return () => {
      cancelled = true;
    };
  }, [result]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-sm text-studio-muted">{message}</p>
      <Link
        href={back}
        className="text-sm text-studio-accent-light underline"
      >
        Открыть кабинет
      </Link>
    </main>
  );
}
