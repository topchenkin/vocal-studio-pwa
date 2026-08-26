import { supabase } from "@/lib/supabase";
import { PAYMENT_API_BASE } from "@/lib/payment-config";
import type { PaymentPurpose } from "@/components/payment/SbpPaymentSheet";

type InitResponse = {
  error?: string;
  paymentUrl?: string;
  invoiceNo?: number;
  provider?: string;
};

export type PaymentSyncResult = {
  error?: string;
  status?: "pending" | "confirmed" | "failed";
  paid?: boolean;
  invoiceNo?: number;
};

const INVOICE_KEY = "uvs_pay_invoice";
const RETURN_KEY = "uvs_pay_return";

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error("Нужно войти в кабинет");
  }
  return {
    "content-type": "application/json",
    authorization: `Bearer ${token}`,
  };
}

async function postPayment(path: string, body: unknown) {
  const response = await fetch(`${PAYMENT_API_BASE}${path}`, {
    method: "POST",
    headers: await authHeaders(),
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

function rememberCheckout(invoiceNo?: number) {
  if (typeof window === "undefined") return;
  if (invoiceNo) sessionStorage.setItem(INVOICE_KEY, String(invoiceNo));
  const path = `${window.location.pathname}${window.location.search}`;
  if (path.startsWith("/dashboard")) {
    sessionStorage.setItem(RETURN_KEY, path);
  }
}

function openCheckout(paymentUrl: string) {
  const popup = window.open(paymentUrl, "_blank", "noopener,noreferrer");
  if (!popup) {
    window.location.assign(paymentUrl);
    return false;
  }
  return true;
}

export function readPayInvoice() {
  if (typeof window === "undefined") return null;
  const fromQuery = Number(
    new URLSearchParams(window.location.search).get("invoice") || ""
  );
  if (fromQuery > 0) return fromQuery;
  const stored = Number(sessionStorage.getItem(INVOICE_KEY) || "");
  return stored > 0 ? stored : null;
}

export function readPayReturnPath() {
  if (typeof window === "undefined") return "/dashboard/student?tab=lessons";
  const stored = sessionStorage.getItem(RETURN_KEY) || "";
  if (stored.startsWith("/dashboard")) return stored;
  return "/dashboard/student?tab=lessons";
}

export async function syncPaymentStatus(invoiceNo: number) {
  const response = await fetch(`${PAYMENT_API_BASE}/status`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ invoiceNo }),
  });
  let payload: PaymentSyncResult = {};
  try {
    payload = (await response.json()) as PaymentSyncResult;
  } catch {
    payload = {};
  }
  if (!response.ok) {
    throw new Error(payload.error || "Не удалось проверить оплату");
  }
  return payload;
}

export async function waitForPayment(
  invoiceNo: number,
  options?: { intervalMs?: number; timeoutMs?: number; signal?: AbortSignal }
) {
  const intervalMs = options?.intervalMs ?? 2000;
  const timeoutMs = options?.timeoutMs ?? 8 * 60 * 1000;
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    if (options?.signal?.aborted) {
      return { status: "pending" as const, paid: false, invoiceNo };
    }
    const result = await syncPaymentStatus(invoiceNo);
    if (result.status === "confirmed" || result.paid) return result;
    if (result.status === "failed") return result;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return { status: "pending" as const, paid: false, invoiceNo };
}

export async function startPayment(purpose: PaymentPurpose) {
  const body =
    purpose.type === "debt"
      ? { type: "debt" }
      : purpose.type === "abonement"
        ? { type: "abonement", lessonsCount: purpose.lessonsCount }
        : purpose.type === "lesson"
          ? { type: "lesson", lessonId: purpose.lessonId }
          : purpose.type === "test_payment"
            ? { type: "test_payment" }
            : {
                type: purpose.type,
                tier: purpose.tier,
                months: purpose.months,
              };

  const payload = await postPayment("/init", body);
  rememberCheckout(payload.invoiceNo);
  openCheckout(payload.paymentUrl!);
  return payload;
}

export async function createGiftPaymentLink(certificateId: string) {
  const payload = await postPayment("/init-gift", { certificateId });
  return payload.paymentUrl!;
}
