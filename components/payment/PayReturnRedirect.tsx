"use client";

import { useEffect } from "react";
import Link from "next/link";

const CABINET = "/dashboard/student/subscription";

export default function PayReturnRedirect({ result }: { result: "ok" | "fail" }) {
  useEffect(() => {
    sessionStorage.setItem("uvs_pay_notice", result);
    window.location.replace(CABINET);
  }, [result]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-sm text-studio-muted">
        {result === "ok"
          ? "Оплата прошла, возвращаем в кабинет…"
          : "Оплата не завершена, возвращаем в кабинет…"}
      </p>
      <Link
        href={CABINET}
        className="text-sm text-studio-accent-light underline"
      >
        Открыть подписку
      </Link>
    </main>
  );
}
