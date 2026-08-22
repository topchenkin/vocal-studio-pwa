/**
 * Payment provider adapters: YooKassa (active) and Robokassa (legacy switch).
 */
import { createHash, randomUUID } from "node:crypto";

const APP_ORIGIN = (
  process.env.NEXT_PUBLIC_APP_URL || "https://www.uniquevocal.ru"
).replace(/\/$/, "");
const SUCCESS_URL = `${APP_ORIGIN}/pay/success`;
const FAIL_URL = `${APP_ORIGIN}/pay/fail`;

/** --- Robokassa --- */

const RB_MERCHANT = process.env.ROBOKASSA_MERCHANT_LOGIN || "uniquevocal";
const RB_HASH = (process.env.ROBOKASSA_HASH || "md5").toLowerCase();
const RB_IS_TEST = ["1", "true", "yes"].includes(
  String(process.env.ROBOKASSA_IS_TEST || "1").toLowerCase()
);
const RB_PASS1 = RB_IS_TEST
  ? process.env.ROBOKASSA_TEST_PASS1 || ""
  : process.env.ROBOKASSA_PASS1 || "";
const RB_PASS2 = RB_IS_TEST
  ? process.env.ROBOKASSA_TEST_PASS2 || ""
  : process.env.ROBOKASSA_PASS2 || "";
const RB_PAY_URL = "https://auth.robokassa.ru/Merchant/Index.aspx";

function rbDigest(value) {
  const algo = RB_HASH === "sha256" ? "sha256" : "md5";
  return createHash(algo).update(String(value), "utf8").digest("hex");
}

function rbSignInit(outSum, invId) {
  return rbDigest(
    [
      RB_MERCHANT,
      outSum,
      String(invId),
      encodeURIComponent(SUCCESS_URL),
      "GET",
      encodeURIComponent(FAIL_URL),
      "GET",
      RB_PASS1,
    ].join(":")
  );
}

function rbSignResult(outSum, invId) {
  return rbDigest(`${outSum}:${invId}:${RB_PASS2}`);
}

export const robokassa = {
  id: "robokassa",
  isReady() {
    return Boolean(RB_MERCHANT && RB_PASS1 && RB_PASS2);
  },
  isTest: RB_IS_TEST,
  buildPaymentUrl({ outSum, invId, description, email }) {
    const signature = rbSignInit(outSum, invId);
    const pay = new URL(RB_PAY_URL);
    pay.searchParams.set("MerchantLogin", RB_MERCHANT);
    pay.searchParams.set("OutSum", outSum);
    pay.searchParams.set("InvId", String(invId));
    pay.searchParams.set("Description", description.slice(0, 100));
    pay.searchParams.set("SignatureValue", signature);
    pay.searchParams.set("Culture", "ru");
    pay.searchParams.set("IncCurrLabel", "SBP");
    pay.searchParams.append("PaymentMethods", "SBP");
    pay.searchParams.set("SuccessUrl2", SUCCESS_URL);
    pay.searchParams.set("SuccessUrl2Method", "GET");
    pay.searchParams.set("FailUrl2", FAIL_URL);
    pay.searchParams.set("FailUrl2Method", "GET");
    if (RB_IS_TEST) pay.searchParams.set("IsTest", "1");
    if (email) pay.searchParams.set("Email", email);
    return { paymentUrl: pay.toString(), externalId: null };
  },
  verifyResult({ outSum, invId, signature }) {
    const expected = rbSignResult(outSum, invId).toLowerCase();
    return Boolean(outSum && invId && signature && signature === expected);
  },
  healthExtra() {
    return { merchant: RB_MERCHANT };
  },
};

/** --- YooKassa --- */

const YK_SHOP_ID = process.env.YOOKASSA_SHOP_ID || "";
const YK_SECRET = process.env.YOOKASSA_SECRET_KEY || "";
const YK_IS_TEST =
  process.env.YOOKASSA_IS_TEST != null
    ? ["1", "true", "yes"].includes(
        String(process.env.YOOKASSA_IS_TEST).toLowerCase()
      )
    : YK_SECRET.startsWith("test_");
const YK_API = "https://api.yookassa.ru/v3";

function ykAuthHeader() {
  const token = Buffer.from(`${YK_SHOP_ID}:${YK_SECRET}`).toString("base64");
  return `Basic ${token}`;
}

async function ykRequest(path, init = {}) {
  const response = await fetch(`${YK_API}${path}`, {
    ...init,
    headers: {
      authorization: ykAuthHeader(),
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
    const message =
      body?.description ||
      body?.type ||
      `YooKassa HTTP ${response.status}`;
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
    return Boolean(YK_SHOP_ID && YK_SECRET);
  },
  isTest: YK_IS_TEST,
  async createPayment({ outSum, invId, description, email }) {
    const payload = {
      amount: { value: outSum, currency: "RUB" },
      capture: true,
      description: description.slice(0, 128),
      payment_method_data: { type: "sbp" },
      confirmation: { type: "redirect", return_url: SUCCESS_URL },
      metadata: {
        invoice_no: String(invId),
      },
    };
    if (email) {
      payload.metadata.payer_email = email;
    }

    const payment = await ykRequest("/payments", {
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
    return ykRequest(`/payments/${encodeURIComponent(paymentId)}`, {
      method: "GET",
    });
  },
  healthExtra() {
    return { shopId: YK_SHOP_ID };
  },
};

export function getProvider(name) {
  const id = String(name || "yookassa").toLowerCase();
  if (id === "robokassa") return robokassa;
  if (id === "yookassa") return yookassa;
  return null;
}
