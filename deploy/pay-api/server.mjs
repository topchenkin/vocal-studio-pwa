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
const ALLOWED_MONTHS = new Set([1, 3, 6, 12]);
const TEST_PAYMENT_AMOUNT = 1;

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
    `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,role,email,full_name,debt_amount,app_sub_variant,app_sub_tier,app_sub_expires_at,lesson_pay_type,custom_abonement_price,custom_lesson_price,lessons_balance&limit=1`
  );
  if (!response.ok) return null;
  const rows = await response.json();
  return Array.isArray(rows) ? rows[0] : null;
}

function money(value) {
  return Number(value).toFixed(2);
}

function parseMonths(raw) {
  const months = Number(raw);
  if (!ALLOWED_MONTHS.has(months)) return null;
  return months;
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

async function markInvoiceFailed(txId) {
  await sb(`/rest/v1/payment_transactions?id=eq.${encodeURIComponent(txId)}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "failed" }),
  });
}

async function syncYookassaPayment(tx) {
  const paymentId = String(tx.external_id || "").trim();
  if (!paymentId) return { status: tx.status || "pending", paid: false };

  let payment;
  try {
    payment = await yookassa.fetchPayment(paymentId);
  } catch (error) {
    console.error("yookassa fetch payment failed", paymentId, error);
    throw error;
  }

  if (payment.status === "succeeded") {
    const invoiceNo = Number(
      payment?.metadata?.invoice_no || tx.invoice_no
    );
    const outSum = Number(payment?.amount?.value || tx.amount_rub || 0);
    if (!invoiceNo || !(outSum > 0)) {
      throw new Error("missing invoice metadata");
    }
    const confirm = await confirmPayment(invoiceNo, outSum, payment.id);
    if (!confirm.ok) {
      const text = await confirm.text();
      console.error("yookassa confirm failed", confirm.status, text);
      throw new Error("confirm failed");
    }
    return { status: "confirmed", paid: true };
  }

  if (payment.status === "canceled") {
    if (tx.id && tx.status === "pending") await markInvoiceFailed(tx.id);
    return { status: "failed", paid: false };
  }

  return { status: "pending", paid: false };
}

let pendingSyncRunning = false;

async function syncPendingPayments() {
  if (pendingSyncRunning) return;
  pendingSyncRunning = true;
  try {
    const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const response = await sb(
      `/rest/v1/payment_transactions?status=eq.pending&external_id=not.is.null&created_at=gte.${encodeURIComponent(since)}&select=id,invoice_no,amount_rub,external_id,status&order=created_at.desc&limit=30`
    );
    if (!response.ok) {
      console.error("pending payments query failed", response.status);
      return;
    }
    const rows = await response.json();
    if (!Array.isArray(rows) || rows.length === 0) return;
    for (const tx of rows) {
      try {
        const result = await syncYookassaPayment(tx);
        if (result.paid) {
          console.log("pending payment confirmed", tx.invoice_no);
        }
      } catch (error) {
        console.error(
          "pending payment sync failed",
          tx.invoice_no,
          error?.message || error
        );
      }
    }
  } finally {
    pendingSyncRunning = false;
  }
}

async function handleStatus(req, res) {
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

  const invoiceNo = Number(body.invoiceNo);
  if (!invoiceNo) return json(res, 400, { error: "Нет номера счёта" });

  const txRes = await sb(
    `/rest/v1/payment_transactions?invoice_no=eq.${encodeURIComponent(String(invoiceNo))}&student_id=eq.${encodeURIComponent(user.id)}&select=id,invoice_no,amount_rub,external_id,status,student_id,purpose&limit=1`
  );
  if (!txRes.ok) {
    return json(res, 500, { error: "Не удалось прочитать счёт" });
  }
  const rows = await txRes.json();
  const tx = Array.isArray(rows) ? rows[0] : rows;
  if (!tx) return json(res, 404, { error: "Счёт не найден" });
  if (tx.student_id && tx.student_id !== user.id) {
    return json(res, 403, { error: "Это не ваш счёт" });
  }

  if (tx.status === "confirmed") {
    return json(res, 200, { status: "confirmed", paid: true, invoiceNo });
  }
  if (tx.status === "failed" || tx.status === "cancelled") {
    return json(res, 200, { status: "failed", paid: false, invoiceNo });
  }

  try {
    const result = await syncYookassaPayment(tx);
    return json(res, 200, { ...result, invoiceNo });
  } catch (error) {
    return json(res, 502, {
      error:
        error instanceof Error ? error.message : "Не удалось проверить оплату",
    });
  }
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
  const description = `Unique Vocal Studio — подарок: ${cert.recipient_name}`.slice(
    0,
    128
  );

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

function samePaymentIntent(tx, purpose, metadata) {
  const meta = tx.metadata || {};
  if (purpose === "lesson_one_time") {
    return String(meta.lesson_id || "") === String(metadata.lesson_id || "");
  }
  if (purpose === "app_subscription") {
    return (
      String(meta.tier || "") === String(metadata.tier || "") &&
      Number(meta.months || 1) === Number(metadata.months || 1) &&
      Boolean(meta.is_duo) === Boolean(metadata.is_duo)
    );
  }
  if (purpose === "lesson_package") {
    return Number(meta.lessons_count || 0) === Number(metadata.lessons_count || 0);
  }
  return purpose === "lesson_debt" || purpose === "test_payment";
}

async function findReusableInvoice(studentId, purpose, metadata, amount) {
  const since = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const res = await sb(
    `/rest/v1/payment_transactions?student_id=eq.${encodeURIComponent(studentId)}&purpose=eq.${encodeURIComponent(purpose)}&status=eq.pending&amount_rub=eq.${encodeURIComponent(String(amount))}&created_at=gte.${encodeURIComponent(since)}&select=id,invoice_no,amount_rub,external_id,metadata&order=created_at.desc&limit=20`
  );
  if (!res.ok) return null;
  const rows = await res.json();
  const list = Array.isArray(rows) ? rows : [];
  const tx = list.find((row) => samePaymentIntent(row, purpose, metadata));
  if (!tx?.external_id || !tx.invoice_no) return null;
  try {
    const payment = await yookassa.fetchPayment(tx.external_id);
    const url = payment?.confirmation?.confirmation_url;
    if (!url) return null;
    if (payment.status === "canceled" || payment.status === "succeeded") {
      return null;
    }
    return { paymentUrl: url, invoiceNo: Number(tx.invoice_no) };
  } catch {
    return null;
  }
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
  let months = null;
  let lessonsCount = null;
  const metadata = {
    is_test: yookassa.isTest,
  };

  if (kind === "debt") {
    amount = Number(profile.debt_amount || 0);
    if (!(amount > 0)) return json(res, 400, { error: "Задолженности нет" });
    purpose = "lesson_debt";
    description = "Unique Vocal Studio — задолженность за занятия";
  } else if (kind === "abonement" || kind === "lesson_package") {
    amount = Number(profile.custom_abonement_price || 0);
    if (!(amount > 0)) {
      return json(res, 400, { error: "Стоимость абонемента не задана" });
    }
    lessonsCount = Math.max(1, Number(body.lessonsCount) || 8);
    purpose = "lesson_package";
    // not in subscription_products catalog — keep FK happy
    productCode = null;
    description = `Unique Vocal Studio — абонемент (${lessonsCount} занятий)`;
    metadata.lessons_count = lessonsCount;
  } else if (kind === "lesson") {
    if (profile.lesson_pay_type !== "one_time") {
      return json(res, 400, { error: "Этот урок оплачивается абонементом" });
    }
    const lessonId = String(body.lessonId || "").trim();
    if (!lessonId) return json(res, 400, { error: "Нет урока" });
    amount = Number(profile.custom_lesson_price || 0);
    if (!(amount > 0)) {
      return json(res, 400, { error: "Стоимость урока не задана" });
    }
    const lessonRes = await sb(
      `/rest/v1/lessons?id=eq.${encodeURIComponent(lessonId)}&student_id=eq.${encodeURIComponent(user.id)}&select=id,status,paid_at&limit=1`
    );
    if (!lessonRes.ok) {
      return json(res, 500, { error: "Не удалось проверить урок" });
    }
    const lessonRows = await lessonRes.json();
    const lesson = Array.isArray(lessonRows) ? lessonRows[0] : lessonRows;
    if (!lesson) return json(res, 404, { error: "Урок не найден" });
    if (lesson.status !== "scheduled" && lesson.status !== "completed") {
      return json(res, 400, { error: "Этот урок нельзя оплатить" });
    }
    if (lesson.paid_at) {
      return json(res, 400, { error: "Урок уже оплачен" });
    }
    purpose = "lesson_one_time";
    productCode = null;
    description = "Unique Vocal Studio — занятие";
    metadata.lesson_id = lessonId;
  } else if (kind === "subscription" || kind === "duo_subscription") {
    tier = String(body.tier || "");
    if (!["standard", "premium", "vip"].includes(tier)) {
      return json(res, 400, { error: "Неизвестный тариф" });
    }
    months = parseMonths(body.months);
    if (!months) {
      return json(res, 400, { error: "Выберите срок 1, 3, 6 или 12 месяцев" });
    }
    isDuo = kind === "duo_subscription";
    if (profile.app_sub_variant === "duo_member") {
      return json(res, 400, { error: "Тариф Duo меняет владелец подписки" });
    }
    const monthly = isDuo ? DUO_PRICES[tier] : TIER_PRICES[tier];
    amount = monthly * months;
    purpose = "app_subscription";
    productCode = isDuo ? `${tier}_duo` : tier;
    description = isDuo
      ? `Unique Vocal Studio — подписка ${tier} Duo · ${months} мес.`
      : `Unique Vocal Studio — подписка ${tier} · ${months} мес.`;
    metadata.tier = tier;
    metadata.is_duo = isDuo;
    metadata.months = months;
  } else if (kind === "test_payment") {
    amount = TEST_PAYMENT_AMOUNT;
    purpose = "test_payment";
    // product_code FK → subscription_products; test is not a catalog product
    productCode = null;
    description = "Unique Vocal Studio — тестовая оплата";
  } else {
    return json(res, 400, { error: "Неизвестный тип оплаты" });
  }

  metadata.description = description;

  const outSum = money(amount);
  const reusable = await findReusableInvoice(user.id, purpose, metadata, Number(outSum));
  if (reusable) {
    return json(res, 200, {
      paymentUrl: reusable.paymentUrl,
      invoiceNo: reusable.invoiceNo,
      amount: Number(outSum),
      isTest: yookassa.isTest,
      provider: "yookassa",
      months,
      reused: true,
    });
  }

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
      metadata,
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
    months,
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
  console.log("yookassa webhook", event || "unknown", paymentId || "no-id");
  if (!paymentId) return json(res, 400, { error: "missing payment id" });
  if (event !== "payment.succeeded" && event !== "payment.canceled") {
    return json(res, 200, { ok: true, ignored: event || "unknown" });
  }

  const invoiceNo = Number(
    notification?.object?.metadata?.invoice_no || ""
  );
  let tx = null;
  if (invoiceNo) {
    const txRes = await sb(
      `/rest/v1/payment_transactions?invoice_no=eq.${encodeURIComponent(String(invoiceNo))}&select=id,invoice_no,amount_rub,external_id,status&limit=1`
    );
    const rows = txRes.ok ? await txRes.json() : [];
    tx = Array.isArray(rows) ? rows[0] : rows;
  }
  if (!tx) {
    const txRes = await sb(
      `/rest/v1/payment_transactions?external_id=eq.${encodeURIComponent(paymentId)}&select=id,invoice_no,amount_rub,external_id,status&limit=1`
    );
    const rows = txRes.ok ? await txRes.json() : [];
    tx = Array.isArray(rows) ? rows[0] : rows;
  }
  if (!tx) {
    tx = {
      invoice_no: invoiceNo,
      amount_rub: Number(notification?.object?.amount?.value || 0),
      external_id: paymentId,
      status: "pending",
    };
  } else if (!tx.external_id) {
    tx.external_id = paymentId;
  }

  try {
    const result = await syncYookassaPayment(tx);
    return json(res, 200, { ok: true, ...result });
  } catch (error) {
    console.error("yookassa webhook sync failed", paymentId, error);
    return json(res, 500, { error: "confirm failed" });
  }
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
      const [auth, payouts] = await Promise.all([
        yookassa.isReady()
          ? yookassa.diagnoseAuth()
          : Promise.resolve({ authOk: false, accountKind: "missing" }),
        yookassa.diagnosePayouts(),
      ]);
      return json(res, 200, {
        ok: ready() && auth.canAcceptPayments === true,
        provider: "yookassa",
        isTest: yookassa.isTest,
        yookassaReady: yookassa.isReady(),
        ...yookassa.healthExtra(),
        auth,
        payouts,
        payoutsSbpOk: payouts.authOk === true && payouts.sbpAvailable === true,
      });
    }

    if (!ready()) {
      return json(res, 503, {
        error:
          "pay-api: нужны YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY магазина",
      });
    }

    if (path === "/api/payments/init") return handleInit(req, res);
    if (path === "/api/payments/status") return handleStatus(req, res);
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
  void syncPendingPayments();
  setInterval(() => void syncPendingPayments(), 4000);
});
