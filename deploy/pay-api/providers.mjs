/**
 * YooKassa payment adapter for the static PWA pay-api.
 */
import { randomUUID } from "node:crypto";

const APP_ORIGIN = (
  process.env.NEXT_PUBLIC_APP_URL || "https://www.uniquevocal.ru"
).replace(/\/$/, "");
const RETURN_URL = `${APP_ORIGIN}/pay/success`;

const SHOP_ID = process.env.YOOKASSA_SHOP_ID || "";
const SECRET_KEY = process.env.YOOKASSA_SECRET_KEY || "";
const IS_TEST =
  process.env.YOOKASSA_IS_TEST != null
    ? ["1", "true", "yes"].includes(
        String(process.env.YOOKASSA_IS_TEST).toLowerCase()
      )
    : SECRET_KEY.startsWith("test_");
const API = "https://api.yookassa.ru/v3";

function authHeader() {
  return `Basic ${Buffer.from(`${SHOP_ID}:${SECRET_KEY}`).toString("base64")}`;
}

async function request(path, init = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      authorization: authHeader(),
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    const raw =
      body?.description || body?.type || `YooKassa HTTP ${response.status}`;
    const lower = String(raw).toLowerCase();
    let message = raw;
    if (
      lower.includes("authentication type is not allowed") ||
      lower.includes("invalid_credentials") ||
      response.status === 401
    ) {
      message =
        "ЮKassa не приняла ключ. Нужны идентификатор магазина (shopId) и секретный ключ из раздела «Интеграция → Ключи API» для приёма платежей. Ключ выплат / agentId не подходят.";
    }
    const error = new Error(message);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

export const yookassa = {
  id: "yookassa",
  isReady() {
    return Boolean(SHOP_ID && SECRET_KEY && !SECRET_KEY.includes("*"));
  },
  isTest: IS_TEST,
  async createPayment({ outSum, invId, description, email }) {
    const payload = {
      amount: { value: outSum, currency: "RUB" },
      capture: true,
      description: description.slice(0, 128),
      // SBP by default; YooKassa page still handles redirect/QR.
      payment_method_data: { type: "sbp" },
      confirmation: { type: "redirect", return_url: RETURN_URL },
      metadata: { invoice_no: String(invId) },
    };
    if (email) payload.metadata.payer_email = email;

    const payment = await request("/payments", {
      method: "POST",
      headers: { "Idempotence-Key": randomUUID() },
      body: JSON.stringify(payload),
    });

    const paymentUrl = payment?.confirmation?.confirmation_url;
    if (!paymentUrl) {
      throw new Error("YooKassa did not return confirmation_url");
    }
    return { paymentUrl, externalId: payment.id || null };
  },
  async fetchPayment(paymentId) {
    return request(`/payments/${encodeURIComponent(paymentId)}`, {
      method: "GET",
    });
  },
  healthExtra() {
    return {
      shopId: SHOP_ID,
      secretLooksTest: SECRET_KEY.startsWith("test_"),
      secretLooksValid: Boolean(SECRET_KEY) && !SECRET_KEY.includes("*"),
    };
  },
};
