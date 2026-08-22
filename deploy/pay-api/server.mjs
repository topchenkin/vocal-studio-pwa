/**
 * YooKassa-only pay-api for the static PWA.
 */
import { createServer } from "node:http";
import { yookassa } from "./providers.mjs";

const PORT = Number(process.env.PORT) || 8791;
const BIND = process.env.BIND || "127.0.0.1";
const SUPABASE_URL = (
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  ""
).replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const TIER_PRICES = { standard: 990, premium: 1990, vip: 3990 };
const DUO_PRICES = { standard: 1490, premium: 2990, vip: 5990 };

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sbHeaders(extra = {}) {
  return {
    apikey: SERVICE_KEY,
    authorization: `Bearer ${SERVICE_KEY}`,
    "content-type": "application/json",
    ...extra,
  };
}

async function sb(path, init = {}) {
  return fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: { ...sbHeaders(init.headers), ...(init.headers || {}) },
  });
}

async function authUser(accessToken) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SERVICE_KEY,
      authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) return null;
  return response.json();
}

async function loadProfile(userId) {
  const response = await sb(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,role,email,full_name,debt_amount,app_sub_variant,app_sub_tier&limit=1`
  );
  if (!response.ok) return null;
  const rows = await response.json();
  return Array.isArray(rows) ? rows[0] : null;
}

function money(value) {
  return Number(value).toFixed(2);
}

async function confirmPayment(invoiceNo, outSum, externalId) {
  return sb("/rest/v1/rpc/confirm_payment", {
    method: "POST",
    body: JSON.stringify({
      p_invoice_no: Number(invoiceNo),
      p_out_sum: Number(outSum),
      p_external_id: externalId || null,
      p_provider: "yookassa",
    }),
  });
}

async function patchExternalId(txId, externalId) {
  if (!externalId) return;
  await sb(`/rest/v1/payment_transactions?id=eq.${encodeURIComponent(txId)}`, {
    method: "PATCH",
    body: JSON.stringify({ external_id: externalId }),
  });
}

async function handleInitGift(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "method" });
  const auth = String(req.headers.authorization || "");
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return json(res, 401, { error: "Нужно войти" });

  const user = await authUser(token);
  if (!user?.id) {
    return json(res, 401, { error: "Сессия истекла, войдите снова" });
  }

  const profile = await loadProfile(user.id);
  if (!profile || profile.role !== "admin") {
    return json(res, 403, { error: "Ссылку на подарок создаёт преподаватель" });
  }

  let body = {};
  try {
    body = JSON.parse((await readBody(req)) || "{}");
  } catch {
    return json(res, 400, { error: "Некорректный запрос" });
  }

  const certificateId = String(body.certificateId || "").trim();
  if (!certificateId) return json(res, 400, { error: "Нет сертификата" });

  const certRes = await sb(
    `/rest/v1/gift_certificates?id=eq.${encodeURIComponent(certificateId)}&select=*&limit=1`
  );
  if (!certRes.ok) {
    return json(res, 500, { error: "Не удалось прочитать сертификат" });
  }
  const certRows = await certRes.json();
  const cert = Array.isArray(certRows) ? certRows[0] : certRows;
  if (!cert) return json(res, 404, { error: "Сертификат не найден" });
  if (cert.status === "redeemed" || cert.status === "cancelled") {
    return json(res, 400, { error: "Этот сертификат уже нельзя оплатить" });
  }
  if (cert.status === "paid") {
    return json(res, 400, { error: "Сертификат уже оплачен" });
  }

  const outSum = money(cert.amount_rub);
  const description = `Подарок Unique Vocal: ${cert.recipient_name}`.slice(0, 100);

  const insert = await sb("/rest/v1/payment_transactions", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({
      student_id: null,
      product_code: null,
      purpose: "gift_certificate",
      amount_rub: Number(outSum),
      provider: "yookassa",
      status: "pending",
      metadata: {
        is_test: yookassa.isTest,
        gift_id: cert.id,
        gift_code: cert.code,
        recipient_name: cert.recipient_name,
        gift_kind: cert.kind,
        description,
      },
    }),
  });
  if (!insert.ok) {
    console.error("gift invoice failed", insert.status, await insert.text());
    return json(res, 500, { error: "Не удалось создать счёт на подарок" });
  }
  const rows = await insert.json();
  const tx = Array.isArray(rows) ? rows[0] : rows;
  const invId = Number(tx?.invoice_no);
  if (!invId) return json(res, 500, { error: "Счёт создан без номера" });

  const patch = await sb(
    `/rest/v1/gift_certificates?id=eq.${encodeURIComponent(cert.id)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        payment_id: tx.id,
        invoice_no: invId,
        status: "pending_payment",
      }),
    }
  );
  if (!patch.ok) {
    return json(res, 500, { error: "Счёт создан, но сертификат не обновился" });
  }

  let paymentUrl;
  let externalId = null;
  try {
    const payment = await yookassa.createPayment({
      outSum,
      invId,
      description,
      email: null,
    });
    paymentUrl = payment.paymentUrl;
    externalId = payment.externalId;
  } catch (error) {
    console.error("gift payment init failed", error);
    return json(res, 502, {
      error:
        error instanceof Error ? error.message : "Не удалось создать платёж",
    });
  }

  await patchExternalId(tx.id, externalId);
  return json(res, 200, {
    paymentUrl,
    invoiceNo: invId,
    amount: Number(outSum),
    isTest: yookassa.isTest,
    provider: "yookassa",
    code: cert.code,
  });
}

async function handleInit(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "method" });
  const auth = String(req.headers.authorization || "");
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return json(res, 401, { error: "Нужно войти в кабинет" });

  const user = await authUser(token);
  if (!user?.id) {
    return json(res, 401, { error: "Сессия истекла, войдите снова" });
  }

  let body = {};
  try {
    body = JSON.parse((await readBody(req)) || "{}");
  } catch {
    return json(res, 400, { error: "Некорректный запрос" });
  }

  const profile = await loadProfile(user.id);
  if (!profile || profile.role !== "student") {
    return json(res, 403, { error: "Оплата доступна ученикам" });
  }

  const kind = String(body.type || "");
  let purpose = "";
  let amount = 0;
  let productCode = null;
  let description = "";
  let tier = null;
  let isDuo = false;

  if (kind === "debt") {
    amount = Number(profile.debt_amount || 0);
    if (!(amount > 0)) return json(res, 400, { error: "Задолженности нет" });
    purpose = "lesson_debt";
    description = "Задолженность за занятия Unique Vocal";
  } else if (kind === "subscription" || kind === "duo_subscription") {
    tier = String(body.tier || "");
    if (!["standard", "premium", "vip"].includes(tier)) {
      return json(res, 400, { error: "Неизвестный тариф" });
    }
    isDuo = kind === "duo_subscription";
    if (profile.app_sub_variant === "duo_member") {
      return json(res, 400, { error: "Тариф Duo меняет владелец подписки" });
    }
    amount = isDuo ? DUO_PRICES[tier] : TIER_PRICES[tier];
    purpose = "app_subscription";
    productCode = isDuo ? `${tier}_duo` : tier;
    description = isDuo
      ? `Подписка ${tier} Duo Unique Vocal`
      : `Подписка ${tier} Unique Vocal`;
  } else {
    return json(res, 400, { error: "Неизвестный тип оплаты" });
  }

  const outSum = money(amount);
  const insert = await sb("/rest/v1/payment_transactions", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({
      student_id: user.id,
      product_code: productCode,
      purpose,
      amount_rub: Number(outSum),
      provider: "yookassa",
      status: "pending",
      metadata: {
        is_test: yookassa.isTest,
        tier,
        is_duo: isDuo,
        description,
      },
    }),
  });
  if (!insert.ok) {
    console.error("create invoice failed", insert.status, await insert.text());
    return json(res, 500, { error: "Не удалось создать счёт" });
  }
  const rows = await insert.json();
  const tx = Array.isArray(rows) ? rows[0] : rows;
  const invId = Number(tx?.invoice_no);
  if (!invId) return json(res, 500, { error: "Счёт создан без номера" });

  const email = String(user.email || profile.email || "").trim();
  let paymentUrl;
  let externalId = null;
  try {
    const payment = await yookassa.createPayment({
      outSum,
      invId,
      description,
      email: email || null,
    });
    paymentUrl = payment.paymentUrl;
    externalId = payment.externalId;
  } catch (error) {
    console.error("payment init failed", error);
    return json(res, 502, {
      error:
        error instanceof Error ? error.message : "Не удалось создать платёж",
    });
  }

  await patchExternalId(tx.id, externalId);
  return json(res, 200, {
    paymentUrl,
    invoiceNo: invId,
    amount: Number(outSum),
    isTest: yookassa.isTest,
    provider: "yookassa",
  });
}

async function handleYookassaWebhook(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "method" });
  const raw = await readBody(req);
  let notification = {};
  try {
    notification = JSON.parse(raw || "{}");
  } catch {
    return json(res, 400, { error: "invalid json" });
  }

  const event = String(notification.event || "");
  const paymentId = String(notification?.object?.id || "");
  if (!paymentId) return json(res, 400, { error: "missing payment id" });
  if (event !== "payment.succeeded") {
    return json(res, 200, { ok: true, ignored: event || "unknown" });
  }

  let payment;
  try {
    payment = await yookassa.fetchPayment(paymentId);
  } catch (error) {
    console.error("yookassa fetch payment failed", paymentId, error);
    return json(res, 502, { error: "verify failed" });
  }

  if (payment.status !== "succeeded") {
    return json(res, 400, { error: "payment not succeeded" });
  }

  const invoiceNo = Number(
    payment?.metadata?.invoice_no || notification?.object?.metadata?.invoice_no
  );
  const outSum = Number(payment?.amount?.value || 0);
  if (!invoiceNo || !(outSum > 0)) {
    console.error("yookassa webhook missing invoice", { paymentId, invoiceNo });
    return json(res, 400, { error: "missing invoice metadata" });
  }

  const confirm = await confirmPayment(invoiceNo, outSum, paymentId);
  if (!confirm.ok) {
    console.error("yookassa confirm failed", confirm.status, await confirm.text());
    return json(res, 500, { error: "confirm failed" });
  }

  return json(res, 200, { ok: true });
}

function ready() {
  return Boolean(SUPABASE_URL && SERVICE_KEY && yookassa.isReady());
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (
      path === "/health" ||
      path === "/api/payments/health" ||
      path === "/api/payments"
    ) {
      return json(res, 200, {
        ok: ready(),
        provider: "yookassa",
        isTest: yookassa.isTest,
        yookassaReady: yookassa.isReady(),
        ...yookassa.healthExtra(),
      });
    }

    if (!ready()) {
      return json(res, 503, {
        error:
          "pay-api: нужны YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY магазина",
      });
    }

    if (path === "/api/payments/init") return handleInit(req, res);
    if (path === "/api/payments/init-gift") return handleInitGift(req, res);
    if (path === "/api/yookassa/webhook") return handleYookassaWebhook(req, res);

    return json(res, 404, { error: "not found" });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: "internal" });
  }
});

server.listen(PORT, BIND, () => {
  console.log(
    `pay-api listening on ${BIND}:${PORT} provider=yookassa test=${yookassa.isTest}`
  );
});
