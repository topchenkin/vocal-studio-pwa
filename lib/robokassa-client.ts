import { supabase } from "@/lib/supabase";
import type { PaymentPurpose } from "@/components/payment/SbpPaymentSheet";

export async function startRobokassaPayment(purpose: PaymentPurpose) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error("Нужно войти в кабинет");
  }

  const response = await fetch("/api/robokassa/init", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      type: purpose.type,
      tier: purpose.type === "debt" ? undefined : purpose.tier,
    }),
  });

  let payload: { error?: string; paymentUrl?: string } = {};
  try {
    payload = (await response.json()) as { error?: string; paymentUrl?: string };
  } catch {
    payload = {};
  }

  if (!response.ok || !payload.paymentUrl) {
    throw new Error(payload.error || "Не удалось открыть оплату");
  }

  window.location.assign(payload.paymentUrl);
}
