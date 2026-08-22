/**
 * YooKassa payment adapter for the static PWA pay-api.
 *
 * Accepts payments via shop credentials only:
 *   Basic shopId:secret → https://api.yookassa.ru/v3/payments
 * Payouts gateway (agentId) secrets authenticate for /me and /payouts but
 * cannot create payments ("Authentication type is not allowed").
 *
 * Health also probes the payouts gateway (SBP) via /v3/me when
 * YOOKASSA_AGENT_ID + payout secret are set — no payout is created.
 */
import { randomUUID } from "node:crypto";

const APP_ORIGIN = (
  process.env.NEXT_PUBLIC_APP_URL || "https://www.uniquevocal.ru"
).replace(/\/$/, "");
const RETURN_URL = `${APP_ORIGIN}/pay/success`;

const SHOP_ID = process.env.YOOKASSA_SHOP_ID || "";
const SECRET_KEY = process.env.YOOKASSA_SECRET_KEY || "";
/** Payouts gateway agentId (gate_id). Separate from shopId. */
const AGENT_ID = process.env.YOOKASSA_AGENT_ID || "";
/** Prefer dedicated payout secret; fall back to YOOKASSA_SECRET_KEY. */
const PAYOUT_SECRET =
  process.env.YOOKASSA_PAYOUT_SECRET_KEY || SECRET_KEY || "";
const IS_TEST =
  process.env.YOOKASSA_IS_TEST != null
    ? ["1", "true", "yes"].includes(
        String(process.env.YOOKASSA_IS_TEST).toLowerCase()
      )
    : SECRET_KEY.startsWith("test_") || PAYOUT_SECRET.startsWith("test_");
const API = "https://api.yookassa.ru/v3";

const AUTH_HINT_SHOP =
  "Нужны shopId и секретный ключ магазина: в ЛК переключитесь на магазин (не шлюз выплат) → Интеграция → Ключи API. Ключ шлюза (agentId) подходит только для выплат, не для приёма платежей.";

function authHeader(userId = SHOP_ID, secret = SECRET_KEY) {
  return `Basic ${Buffer.from(`${userId}:${secret}`).toString("base64")}`;
}

async function fetchMe(userId, secret) {
  const response = await fetch(`${API}/me`, {
    headers: { authorization: authHeader(userId, secret) },
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = {};
  }
  return { response, body };
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
      message = `ЮKassa отклонила авторизацию для приёма платежей. ${AUTH_HINT_SHOP}`;
    }
    const error = new Error(message);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

/**
 * Probe /v3/me with configured shopId:secret.
 * Classifies credentials as shop (payment_methods) vs payouts gateway.
 */
async function diagnoseAuth() {
  if (!SHOP_ID || !SECRET_KEY) {
    return { authOk: false, accountKind: "missing", hint: AUTH_HINT_SHOP };
  }
  try {
    const { response, body } = await fetchMe(SHOP_ID, SECRET_KEY);
    if (!response.ok) {
      return {
        authOk: false,
        accountKind: "unknown",
        httpStatus: response.status,
        code: body?.code || null,
        hint: AUTH_HINT_SHOP,
      };
    }
    const hasPayouts = Array.isArray(body.payout_methods);
    const hasPayments = Array.isArray(body.payment_methods);
    let accountKind = "unknown";
    if (hasPayouts && !hasPayments) accountKind = "payouts_gateway";
    else if (hasPayments) accountKind = "shop";
    return {
      authOk: true,
      accountKind,
      accountId: body.account_id || null,
      test: Boolean(body.test),
      canAcceptPayments: accountKind === "shop",
      hint:
        accountKind === "payouts_gateway"
          ? "Сейчас в env ключ шлюза выплат (agentId). Для оплаты нужен отдельный ключ магазина (shopId)."
          : accountKind === "shop"
            ? null
            : AUTH_HINT_SHOP,
    };
  } catch (error) {
    return {
      authOk: false,
      accountKind: "error",
      hint: error?.message || AUTH_HINT_SHOP,
    };
  }
}

function normalizePayoutMethods(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === "string") return item.toLowerCase();
      if (item && typeof item === "object") {
        return String(item.type || item.method || item.id || "")
          .toLowerCase()
          .trim();
      }
      return "";
    })
    .filter(Boolean);
}

/**
 * Probe /v3/me with agentId:payoutSecret. Reports SBP availability only —
 * does not create a payout or move money.
 */
async function diagnosePayouts() {
  if (!AGENT_ID || !PAYOUT_SECRET) {
    return {
      configured: false,
      authOk: false,
      sbpAvailable: false,
      hint: "Задайте YOOKASSA_AGENT_ID и YOOKASSA_PAYOUT_SECRET_KEY (или YOOKASSA_SECRET_KEY).",
    };
  }
  try {
    const { response, body } = await fetchMe(AGENT_ID, PAYOUT_SECRET);
    if (!response.ok) {
      return {
        configured: true,
        authOk: false,
        sbpAvailable: false,
        httpStatus: response.status,
        code: body?.code || null,
        hint: "ЮKassa отклонила agentId:secret для /v3/me.",
      };
    }
    const methods = normalizePayoutMethods(body.payout_methods);
    const sbpAvailable = methods.some(
      (m) => m === "sbp" || m.includes("sbp")
    );
    return {
      configured: true,
      authOk: true,
      accountKind: "payouts_gateway",
      accountId: body.account_id || AGENT_ID,
      test: Boolean(body.test),
      payoutMethods: methods,
      sbpAvailable,
      hint: sbpAvailable
        ? null
        : methods.length
          ? "Шлюз отвечает, но SBP нет в payout_methods."
          : "Шлюз отвечает, payout_methods пуст или отсутствует.",
    };
  } catch (error) {
    return {
      configured: true,
      authOk: false,
      sbpAvailable: false,
      hint: error?.message || "ошибка запроса /v3/me",
    };
  }
}

export const yookassa = {
  id: "yookassa",
  isReady() {
    return Boolean(SHOP_ID && SECRET_KEY);
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
      shopId: SHOP_ID || null,
      agentId: AGENT_ID || null,
      secretLooksTest: SECRET_KEY.startsWith("test_"),
      secretConfigured: Boolean(SECRET_KEY),
      secretHasAsterisk: SECRET_KEY.includes("*"),
      payoutSecretConfigured: Boolean(PAYOUT_SECRET),
      payoutSecretLooksTest: PAYOUT_SECRET.startsWith("test_"),
      payoutSecretHasAsterisk: PAYOUT_SECRET.includes("*"),
    };
  },
  diagnoseAuth,
  diagnosePayouts,
};
