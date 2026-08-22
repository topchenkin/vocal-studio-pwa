import { supabase } from "@/lib/supabase";
import { PAYMENT_API_BASE } from "@/lib/payment-config";
import type { PaymentPurpose } from "@/components/payment/SbpPaymentSheet";

type InitResponse = {
  error?: string;
  paymentUrl?: string;
  invoiceNo?: number;
  provider?: string;
};

async function postPayment(path: string, body: unknown) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error("Нужно войти в кабинет");
  }

  const response = await fetch(`${PAYMENT_API_BASE}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  let payload: InitResponse = {};
  try {
    payload = (await response.json()) as InitResponse;
  } catch {
    payload = {};
  }

  if (!response.ok || !payload.paymentUrl) {
    throw new Error(payload.error || "Не удалось открыть оплату");
  }

  return payload;
}

export async function startPayment(purpose: PaymentPurpose) {
  const payload = await postPayment("/init", {
    type: purpose.type,
    tier: purpose.type === "debt" ? undefined : purpose.tier,
  });
  window.location.assign(payload.paymentUrl!);
}

export async function createGiftPaymentLink(certificateId: string) {
  const payload = await postPayment("/init-gift", { certificateId });
  return payload.paymentUrl!;
}
