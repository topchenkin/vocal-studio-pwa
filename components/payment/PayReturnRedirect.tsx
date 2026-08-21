"use client";

import { useEffect } from "react";

export default function PayReturnRedirect({ result }: { result: "ok" | "fail" }) {
  useEffect(() => {
    sessionStorage.setItem("uvs_pay_notice", result);
    window.location.replace("/dashboard/student/subscription");
  }, [result]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <p className="text-sm text-studio-muted">
        {result === "ok"
          ? "Возвращаем в кабинет…"
          : "Оплата не завершена, возвращаем в кабинет…"}
      </p>
    </main>
  );
}
