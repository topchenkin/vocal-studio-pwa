/**
 * pay-api for the static PWA:
 *   Robokassa  — RF SBP / MIR / RU cards (default)
 *   YooKassa   — RF fallback, switched from admin or RF_PAYMENT_PROVIDER
 *   Prodamus   — international cards (client provider=prodamus)
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { yookassa } from "./providers.mjs";
import {
  goToken,
  paymentFields,
  paymentUrlFromFields,
  ROBOKASSA_FLOW,
  robokassa,
} from "./robokassa.mjs";
import {
  parseFormBody,
  PRODAMUS_FLOW,
  prodamus,
  verifySignature,
  webhookPayloads,
} from "./prodamus.mjs";

const RF_KASSA_FILE = fileURLToPath(new URL("./rf-kassa.json", import.meta.url));

const PORT = Number(process.env.PORT) || 8791;
const BIND = process.env.BIND || "127.0.0.1";
const SUPABASE_URL = (
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  ""
).replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const TIER_PRICES = { standard: 990, premium: 1990, vip: 2990 };
const DUO_PRICES = { standard: 1490, premium: 2990, vip: 4490 };
const ALLOWED_MONTHS = new Set([1, 3, 6, 12]);
/** Keep in sync with lib/constants.ts SUBSCRIPTION_PERIOD_DISCOUNT. */
const PERIOD_DISCOUNT = { 1: 0, 3: 10, 6: 15, 12: 20 };
const TEST_PAYMENT_AMOUNT = 1;

function html(res, status, body) {
  const payload = String(body);
  res.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

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
    `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,role,email,full_name,phone,debt_amount,app_sub_variant,app_sub_tier,app_sub_expires_at,lesson_pay_type,custom_abonement_price,custom_lesson_price,lessons_balance&limit=1`
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

function subscriptionAmount(monthly, months) {
  const list = Number(monthly) * Number(months);
  const pct = PERIOD_DISCOUNT[months] || 0;
  if (!pct) return list;
  return Math.round((list * (100 - pct)) / 100 / 10) * 10;
}

function envRfProvider() {
  const raw = String(process.env.RF_PAYMENT_PROVIDER || "robokassa")
    .trim()
    .toLowerCase();
  return raw === "yookassa" ? "yookassa" : "robokassa";
}

function readRfOverride() {
  try {
    if (!existsSync(RF_KASSA_FILE)) return null;
    const parsed = JSON.parse(readFileSync(RF_KASSA_FILE, "utf8"));
    const value = String(parsed?.provider || "")
      .trim()
      .toLowerCase();
    if (value === "yookassa" || value === "robokassa") return value;
  } catch (error) {
    console.error("[uvs:pay] rf-kassa file unreadable", error?.message || error);
  }
  return null;
}

function getRfProvider() {
  return readRfOverride() || envRfProvider();
}

function setRfProvider(next) {
  const provider = next === "yookassa" ? "yookassa" : "robokassa";
  writeFileSync(
    RF_KASSA_FILE,
    `${JSON.stringify({ provider, updated_at: new Date().toISOString() }, null, 2)}\n`,
    "utf8"
  );
  return provider;
}

function rfAdapter(provider = getRfProvider()) {
  return provider === "yookassa" ? yookassa : robokassa;
}

function rfReady(provider = getRfProvider()) {
  return rfAdapter(provider).isReady();
}

async function confirmPayment(invoiceNo, outSum, externalId, provider = "robokassa") {
  return sb("/rest/v1/rpc/confirm_payment", {
    method: "POST",
    body: JSON.stringify({
      p_invoice_no: Number(invoiceNo),
      p_out_sum: Number(outSum),
      p_external_id: externalId || null,
      p_provider: provider,
    }),
  });
}

function pickProdamusInvoiceNo(data) {
  const candidates = [
    data.order_num,
    data._param_invoice_no,
    data.invoice_no,
    data.customer_extra,
    data.products?.[0]?.sku,
  ];
  const orderId = String(data.order_id || "").trim();
  if (/^\d+$/.test(orderId)) candidates.unshift(orderId);
  for (const value of candidates) {
    const n = Number(String(value || "").replace(/^uvs-/i, ""));
    if (Number.isInteger(n) && n > 0) return n;
  }
  return 0;
}

async function loadPaymentByInvoice(invoiceNo) {
  if (!invoiceNo) return null;
  const txRes = await sb(
    `/rest/v1/payment_transactions?invoice_no=eq.${encodeURIComponent(String(invoiceNo))}&select=id,invoice_no,amount_rub,status,provider,student_id,external_id&limit=1`
  );
  const rows = txRes.ok ? await txRes.json() : [];
  return Array.isArray(rows) ? rows[0] : rows || null;
}

/**
 * Prodamus stored-link / LK payments often webhook their own UUID as
 * order_id and leave order_num / _param_invoice_no empty. Fall back to
 * the pending Prodamus invoice for that email and amount.
 */
async function findProdamusTx(data) {
  const byInvoice = await loadPaymentByInvoice(pickProdamusInvoiceNo(data));
  if (byInvoice) return byInvoice;

  const orderId = String(data.order_id || "").trim();
  if (orderId) {
    const extRes = await sb(
      `/rest/v1/payment_transactions?external_id=eq.${encodeURIComponent(orderId)}&select=id,invoice_no,amount_rub,status,provider,student_id,external_id&limit=1`
    );
    const extRows = extRes.ok ? await extRes.json() : [];
    const byExt = Array.isArray(extRows) ? extRows[0] : extRows;
    if (byExt) return byExt;
  }

  const email = String(data.customer_email || "").trim().toLowerCase();
  const paid = Number(data.sum);
  if (!email || !Number.isFinite(paid) || paid <= 0) return null;

  const profileRes = await sb(
    `/rest/v1/profiles?email=ilike.${encodeURIComponent(email)}&select=id,email&limit=1`
  );
  const profiles = profileRes.ok ? await profileRes.json() : [];
  const profile = Array.isArray(profiles) ? profiles[0] : profiles;
  if (!profile?.id) return null;

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const txRes = await sb(
    `/rest/v1/payment_transactions?student_id=eq.${encodeURIComponent(profile.id)}&provider=eq.prodamus&created_at=gte.${encodeURIComponent(since)}&select=id,invoice_no,amount_rub,status,provider,student_id,external_id,created_at&order=created_at.desc&limit=20`
  );
  const list = txRes.ok ? await txRes.json() : [];
  const rows = Array.isArray(list) ? list : [];
  const amountOk = (row) => Math.abs(Number(row.amount_rub) - paid) <= 1;
  const pending = rows.find((row) => row.status === "pending" && amountOk(row));
  if (pending) {
    console.log("[uvs:prodamus] matched pending by email", email, pending.invoice_no);
    return pending;
  }
  const confirmed = rows.find(
    (row) => row.status === "confirmed" && amountOk(row)
  );
  if (confirmed) {
    console.log("[uvs:prodamus] matched confirmed by email", email, confirmed.invoice_no);
    return confirmed;
  }
  return null;
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
    const confirm = await confirmPayment(invoiceNo, outSum, payment.id, "yookassa");
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

async function syncRobokassaPayment(tx) {
  const invoiceNo = Number(tx.invoice_no);
  if (!invoiceNo) return { status: tx.status || "pending", paid: false };

  let payment;
  try {
    payment = await robokassa.fetchPayment(invoiceNo);
  } catch (error) {
    console.error("[uvs:robokassa] fetch failed", invoiceNo, error);
    throw error;
  }

  if (payment.status === "succeeded") {
    const outSum = Number(tx.amount_rub || 0);
    if (!(outSum > 0)) throw new Error("missing invoice amount");
    const confirm = await confirmPayment(
      invoiceNo,
      outSum,
      String(tx.external_id || invoiceNo),
      "robokassa"
    );
    if (!confirm.ok) {
      const text = await confirm.text();
      console.error("[uvs:robokassa] confirm failed", confirm.status, text);
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

async function syncRfPayment(tx) {
  if (tx.provider === "robokassa") return syncRobokassaPayment(tx);
  if (tx.provider === "yookassa") return syncYookassaPayment(tx);
  return { status: tx.status || "pending", paid: false };
}

let pendingSyncRunning = false;

async function syncPendingPayments() {
  if (pendingSyncRunning) return;
  pendingSyncRunning = true;
  try {
    const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const response = await sb(
      `/rest/v1/payment_transactions?status=eq.pending&created_at=gte.${encodeURIComponent(since)}&select=id,invoice_no,amount_rub,external_id,status,provider&order=created_at.desc&limit=40`
    );
    if (!response.ok) {
      console.error("pending payments query failed", response.status);
      return;
    }
    const rows = await response.json();
    if (!Array.isArray(rows) || rows.length === 0) return;
    for (const tx of rows) {
      if (tx.provider === "prodamus") continue;
      if (tx.provider === "yookassa" && !tx.external_id) continue;
      try {
        const result = await syncRfPayment(tx);
        if (result.paid) {
          console.log("pending payment confirmed", tx.provider, tx.invoice_no);
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
    `/rest/v1/payment_transactions?invoice_no=eq.${encodeURIComponent(String(invoiceNo))}&student_id=eq.${encodeURIComponent(user.id)}&select=id,invoice_no,amount_rub,external_id,status,student_id,purpose,provider&limit=1`
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

  // Prodamus has no status API: only its signed webhook confirms the invoice.
  if (tx.provider === "prodamus") {
    return json(res, 200, { status: "pending", paid: false, invoiceNo });
  }

  try {
    const result = await syncRfPayment(tx);
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

  const rfProvider = getRfProvider();
  const kassa = rfAdapter(rfProvider);
  if (!kassa.isReady()) {
    return json(res, 503, {
      error:
        rfProvider === "robokassa"
          ? "Robokassa ещё не настроена. Задайте ключи магазина."
          : "ЮKassa ещё не настроена.",
    });
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
      provider: rfProvider,
      status: "pending",
      metadata: {
        is_test: kassa.isTest,
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
  const rkToken = rfProvider === "robokassa" ? goToken() : "";
  try {
    const payment = await kassa.createPayment({
      outSum,
      invId,
      description,
      email: null,
      token: rkToken,
    });
    paymentUrl = payment.paymentUrl;
    externalId = payment.externalId;
  } catch (error) {
    console.error("gift payment init failed", rfProvider, error);
    return json(res, 502, {
      error:
        error instanceof Error ? error.message : "Не удалось создать платёж",
    });
  }

  await patchExternalId(tx.id, externalId);
  if (rfProvider === "robokassa") {
    await sb(`/rest/v1/payment_transactions?id=eq.${encodeURIComponent(tx.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        metadata: {
          is_test: kassa.isTest,
          gift_id: cert.id,
          gift_code: cert.code,
          recipient_name: cert.recipient_name,
          gift_kind: cert.kind,
          description,
          robokassa_url: paymentUrl,
          robokassa_flow: ROBOKASSA_FLOW,
          robokassa_go: rkToken,
        },
      }),
    });
  }
  return json(res, 200, {
    paymentUrl,
    invoiceNo: invId,
    amount: Number(outSum),
    isTest: kassa.isTest,
    provider: rfProvider,
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
    `/rest/v1/payment_transactions?student_id=eq.${encodeURIComponent(studentId)}&purpose=eq.${encodeURIComponent(purpose)}&provider=eq.yookassa&status=eq.pending&amount_rub=eq.${encodeURIComponent(String(amount))}&created_at=gte.${encodeURIComponent(since)}&select=id,invoice_no,amount_rub,external_id,metadata&order=created_at.desc&limit=20`
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

async function findReusableProdamus(studentId, purpose, metadata, amount) {
  const since = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const res = await sb(
    `/rest/v1/payment_transactions?student_id=eq.${encodeURIComponent(studentId)}&purpose=eq.${encodeURIComponent(purpose)}&provider=eq.prodamus&status=eq.pending&amount_rub=eq.${encodeURIComponent(String(amount))}&created_at=gte.${encodeURIComponent(since)}&select=id,invoice_no,metadata&order=created_at.desc&limit=20`
  );
  if (!res.ok) return null;
  const rows = await res.json();
  const list = Array.isArray(rows) ? rows : [];
  const tx = list.find(
    (row) =>
      row.metadata?.prodamus_url &&
      row.metadata?.prodamus_flow === PRODAMUS_FLOW &&
      samePaymentIntent(row, purpose, metadata)
  );
  if (!tx) return null;
  return {
    paymentUrl: String(tx.metadata.prodamus_url),
    invoiceNo: Number(tx.invoice_no),
  };
}

async function findReusableRobokassa(studentId, purpose, metadata, amount) {
  const since = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const res = await sb(
    `/rest/v1/payment_transactions?student_id=eq.${encodeURIComponent(studentId)}&purpose=eq.${encodeURIComponent(purpose)}&provider=eq.robokassa&status=eq.pending&amount_rub=eq.${encodeURIComponent(String(amount))}&created_at=gte.${encodeURIComponent(since)}&select=id,invoice_no,metadata&order=created_at.desc&limit=20`
  );
  if (!res.ok) return null;
  const rows = await res.json();
  const list = Array.isArray(rows) ? rows : [];
  const tx = list.find(
    (row) =>
      row.metadata?.robokassa_url &&
      row.metadata?.robokassa_flow === ROBOKASSA_FLOW &&
      samePaymentIntent(row, purpose, metadata)
  );
  if (!tx) return null;
  return {
    paymentUrl: String(tx.metadata.robokassa_url),
    invoiceNo: Number(tx.invoice_no),
  };
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

  const useProdamus = body.provider === "prodamus";
  const rfProvider = getRfProvider();
  const providerId = useProdamus ? "prodamus" : rfProvider;
  if (useProdamus && !prodamus.isInternational()) {
    return json(res, 503, {
      error: "Оплата международной картой временно недоступна",
    });
  }
  if (!useProdamus && !rfReady(rfProvider)) {
    return json(res, 503, {
      error:
        rfProvider === "robokassa"
          ? "Robokassa ещё не настроена. Задайте ключи магазина."
          : "ЮKassa ещё не настроена.",
    });
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
    is_test: useProdamus
      ? prodamus.isTest
      : rfAdapter(rfProvider).isTest,
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
    // Fixed 4-lesson pack. Never trust client lessonsCount (price is profile-set).
    lessonsCount = 4;
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
    amount = subscriptionAmount(monthly, months);
    purpose = "app_subscription";
    productCode = isDuo ? `${tier}_duo` : tier;
    const tierTitle = tier === "standard" ? "Standart" : tier;
    description = isDuo
      ? `Unique Vocal Studio — подписка ${tierTitle} Duo · ${months} мес.`
      : `Unique Vocal Studio — подписка ${tierTitle} · ${months} мес.`;
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
  const reusable = useProdamus
    ? await findReusableProdamus(user.id, purpose, metadata, Number(outSum))
    : rfProvider === "robokassa"
      ? await findReusableRobokassa(user.id, purpose, metadata, Number(outSum))
      : await findReusableInvoice(user.id, purpose, metadata, Number(outSum));
  if (reusable) {
    return json(res, 200, {
      paymentUrl: reusable.paymentUrl,
      invoiceNo: reusable.invoiceNo,
      amount: Number(outSum),
      isTest: useProdamus
        ? prodamus.isTest
        : rfAdapter(rfProvider).isTest,
      provider: providerId,
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
      provider: providerId,
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
  const rkToken = !useProdamus && rfProvider === "robokassa" ? goToken() : "";
  try {
    const payment = useProdamus
      ? await prodamus.createPayment({
          outSum,
          invId,
          description,
          email: email || null,
          phone: String(profile.phone || "").trim() || null,
        })
      : await rfAdapter(rfProvider).createPayment({
          outSum,
          invId,
          description,
          email: email || null,
          token: rkToken,
        });
    paymentUrl = payment.paymentUrl;
    externalId = payment.externalId;
  } catch (error) {
    console.error("[uvs:pay] payment init failed", providerId, error);
    if (useProdamus) {
      await markInvoiceFailed(tx.id);
      return json(res, 502, {
        error: "Не удалось открыть оплату международной картой. Попробуйте ещё раз.",
      });
    }
    return json(res, 502, {
      error:
        error instanceof Error ? error.message : "Не удалось создать платёж",
    });
  }

  if (useProdamus || rfProvider === "robokassa") {
    // Keep the link so a repeated tap reuses the same invoice.
    await sb(`/rest/v1/payment_transactions?id=eq.${encodeURIComponent(tx.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        metadata: useProdamus
          ? {
              ...metadata,
              prodamus_url: paymentUrl,
              prodamus_flow: PRODAMUS_FLOW,
            }
          : {
              ...metadata,
              robokassa_url: paymentUrl,
              robokassa_flow: ROBOKASSA_FLOW,
              robokassa_go: rkToken,
            },
        ...(externalId ? { external_id: externalId } : {}),
      }),
    });
    let payHost = "";
    try {
      payHost = new URL(paymentUrl).host;
    } catch {
      payHost = "invalid";
    }
    console.log(useProdamus ? "[uvs:prodamus] init" : "[uvs:robokassa] init", {
      invoice: invId,
      purpose,
      amount: outSum,
      host: payHost,
      urlBytes: String(paymentUrl || "").length,
    });
  } else {
    await patchExternalId(tx.id, externalId);
  }
  return json(res, 200, {
    paymentUrl,
    invoiceNo: invId,
    amount: Number(outSum),
    isTest: useProdamus
      ? prodamus.isTest
      : rfAdapter(rfProvider).isTest,
    provider: providerId,
    months,
  });
}

async function handleProdamusWebhook(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "method" });
  const raw = await readBody(req);
  const contentType = String(req.headers["content-type"] || "");
  let parsed;
  try {
    parsed =
      contentType.includes("json") || raw.trim().startsWith("{")
        ? JSON.parse(raw || "{}")
        : parseFormBody(raw);
  } catch {
    return json(res, 400, { error: "invalid body" });
  }

  const signature = String(
    req.headers.sign || parsed?.sign || parsed?.signature || ""
  );
  const candidates = webhookPayloads(parsed, raw);
  const data = candidates.find((item) => verifySignature(item, signature));
  if (!data) {
    const sample = candidates[0] || {};
    console.error("[uvs:prodamus] webhook rejected: bad signature", {
      contentType,
      hasSign: Boolean(signature),
      signLen: signature.length,
      keys: Object.keys(sample),
      nestedSubmit: Boolean(parsed && parsed.submit),
      paymentStatus: sample.payment_status || null,
      orderNum: sample.order_num || sample._param_invoice_no || null,
    });
    return json(res, 400, { error: "bad signature" });
  }

  const status = String(data.payment_status || "");
  console.log(
    "[uvs:prodamus] webhook",
    status || "unknown",
    pickProdamusInvoiceNo(data) || data.order_id || "no-invoice"
  );
  if (status !== "success") {
    return json(res, 200, { ok: true, ignored: status || "unknown" });
  }
  const tx = await findProdamusTx(data);
  if (!tx) {
    console.error("[uvs:prodamus] invoice not matched", {
      orderId: data.order_id || null,
      orderNum: data.order_num || null,
      email: data.customer_email || null,
      sum: data.sum || null,
      keys: Object.keys(data),
    });
    return json(res, 400, { error: "missing invoice" });
  }
  // A Prodamus webhook may only settle Prodamus invoices.
  if (tx.provider !== "prodamus") {
    console.error("[uvs:prodamus] invoice belongs to", tx.provider, tx.invoice_no);
    return json(res, 400, { error: "wrong provider" });
  }
  if (tx.status === "confirmed") return json(res, 200, { ok: true, already: true });

  // The price is fixed by our signed link; the webhook sum may be reported
  // in the card currency, so only log a mismatch.
  const paid = Number(data.sum);
  if (Number.isFinite(paid) && Math.abs(paid - Number(tx.amount_rub)) > 0.009) {
    console.warn("[uvs:prodamus] sum differs", tx.invoice_no, paid, tx.amount_rub);
  }

  const confirm = await confirmPayment(
    tx.invoice_no,
    tx.amount_rub,
    String(data.order_id || "").trim() || null,
    "prodamus"
  );
  if (!confirm.ok) {
    console.error("[uvs:prodamus] confirm failed", confirm.status, await confirm.text());
    return json(res, 500, { error: "confirm failed" });
  }
  return json(res, 200, { ok: true });
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
  return Boolean(SUPABASE_URL && SERVICE_KEY && rfReady());
}

function plain(res, status, body) {
  const payload = String(body);
  res.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function pickParam(params, names) {
  for (const name of names) {
    if (params[name] != null && String(params[name]).length) {
      return String(params[name]);
    }
  }
  return "";
}

async function handleRobokassaResult(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    return json(res, 405, { error: "method" });
  }
  const url = new URL(req.url || "/", "http://127.0.0.1");
  let params = Object.fromEntries(url.searchParams.entries());
  if (req.method === "POST") {
    const raw = await readBody(req);
    const contentType = String(req.headers["content-type"] || "");
    try {
      const parsed =
        contentType.includes("json") || raw.trim().startsWith("{")
          ? JSON.parse(raw || "{}")
          : parseFormBody(raw);
      params = { ...params, ...parsed };
    } catch {
      return json(res, 400, { error: "invalid body" });
    }
  }

  const outSum = pickParam(params, ["OutSum", "out_sum", "outsum"]);
  const invRaw = pickParam(params, ["InvId", "InvID", "inv_id", "invid"]);
  const signature = pickParam(params, [
    "SignatureValue",
    "signaturevalue",
    "crc",
  ]);
  const invoiceNo = Number(invRaw);
  console.log("[uvs:robokassa] result", invoiceNo || "no-invoice");
  if (!invoiceNo || !outSum) {
    return json(res, 400, { error: "missing invoice" });
  }
  if (!robokassa.verifyResult({ outSum, invId: invRaw, signature })) {
    console.error("[uvs:robokassa] bad signature", invoiceNo);
    return json(res, 400, { error: "bad signature" });
  }

  const txRes = await sb(
    `/rest/v1/payment_transactions?invoice_no=eq.${encodeURIComponent(String(invoiceNo))}&select=id,invoice_no,amount_rub,status,provider&limit=1`
  );
  const rows = txRes.ok ? await txRes.json() : [];
  const tx = Array.isArray(rows) ? rows[0] : rows;
  if (!tx) return json(res, 404, { error: "invoice not found" });
  if (tx.provider !== "robokassa") {
    console.error("[uvs:robokassa] invoice belongs to", tx.provider, invoiceNo);
    return json(res, 400, { error: "wrong provider" });
  }
  if (tx.status === "confirmed") return plain(res, 200, `OK${invoiceNo}`);

  const confirm = await confirmPayment(
    invoiceNo,
    tx.amount_rub,
    invRaw,
    "robokassa"
  );
  if (!confirm.ok) {
    console.error("[uvs:robokassa] confirm failed", confirm.status, await confirm.text());
    return json(res, 500, { error: "confirm failed" });
  }
  return plain(res, 200, `OK${invoiceNo}`);
}

async function handleRobokassaGo(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "method" });
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const invoiceNo = Number(url.searchParams.get("invoice") || "");
  const token = String(url.searchParams.get("t") || "");
  if (!invoiceNo || !token) {
    return json(res, 400, { error: "Нет счёта" });
  }
  if (!robokassa.isReady()) {
    return json(res, 503, { error: "Robokassa ещё не настроена" });
  }
  const txRes = await sb(
    `/rest/v1/payment_transactions?invoice_no=eq.${encodeURIComponent(String(invoiceNo))}&select=id,invoice_no,amount_rub,status,provider,metadata&limit=1`
  );
  const rows = txRes.ok ? await txRes.json() : [];
  const tx = Array.isArray(rows) ? rows[0] : rows;
  if (!tx || tx.provider !== "robokassa") {
    return json(res, 404, { error: "Счёт не найден" });
  }
  if (String(tx.metadata?.robokassa_go || "") !== token) {
    return json(res, 403, { error: "Ссылка недействительна" });
  }
  if (tx.status === "confirmed") {
    return json(res, 400, { error: "Счёт уже оплачен" });
  }
  const built = paymentFields({
    outSum: money(tx.amount_rub),
    invId: invoiceNo,
    description: tx.metadata?.description || "Unique Vocal Studio",
    email: null,
  });
  const dest = paymentUrlFromFields(built.fields);
  console.log("[uvs:robokassa] go", invoiceNo);
  res.writeHead(302, {
    Location: dest,
    "cache-control": "no-store",
  });
  res.end();
}

async function handleRfKassa(req, res) {
  const auth = String(req.headers.authorization || "");
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return json(res, 401, { error: "Нужно войти" });
  const user = await authUser(token);
  if (!user?.id) return json(res, 401, { error: "Сессия истекла, войдите снова" });
  const profile = await loadProfile(user.id);
  if (!profile || profile.role !== "admin") {
    return json(res, 403, { error: "Кассу переключает преподаватель" });
  }

  if (req.method === "GET") {
    const provider = getRfProvider();
    return json(res, 200, {
      provider,
      envDefault: envRfProvider(),
      robokassaReady: robokassa.isReady(),
      yookassaReady: yookassa.isReady(),
      resultUrl: "https://www.uniquevocal.ru/api/robokassa/result",
    });
  }

  if (req.method !== "POST") return json(res, 405, { error: "method" });
  let body = {};
  try {
    body = JSON.parse((await readBody(req)) || "{}");
  } catch {
    return json(res, 400, { error: "Некорректный запрос" });
  }
  const next = String(body.provider || "").trim().toLowerCase();
  if (next !== "robokassa" && next !== "yookassa") {
    return json(res, 400, { error: "Выберите Robokassa или ЮKassa" });
  }
  if (!rfAdapter(next).isReady()) {
    return json(res, 400, {
      error:
        next === "robokassa"
          ? "Robokassa не настроена: нет логина или паролей магазина."
          : "ЮKassa не настроена: нет shopId или секрета.",
    });
  }
  const provider = setRfProvider(next);
  console.log("[uvs:pay] rf kassa switched", provider);
  return json(res, 200, {
    provider,
    robokassaReady: robokassa.isReady(),
    yookassaReady: yookassa.isReady(),
  });
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (path === "/api/payments/methods") {
      return json(res, 200, {
        international: prodamus.isInternational(),
        rfProvider: getRfProvider(),
      });
    }

    if (path === "/api/payments/rf-kassa") {
      return handleRfKassa(req, res);
    }

    if (path === "/api/robokassa/result") {
      return handleRobokassaResult(req, res);
    }

    if (path === "/api/payments/robokassa-go") {
      return handleRobokassaGo(req, res);
    }

    if (
      path === "/health" ||
      path === "/api/payments/health" ||
      path === "/api/payments"
    ) {
      const rfProvider = getRfProvider();
      const [auth, payouts] = await Promise.all([
        yookassa.isReady()
          ? yookassa.diagnoseAuth()
          : Promise.resolve({ authOk: false, accountKind: "missing" }),
        yookassa.diagnosePayouts(),
      ]);
      const kassa = rfAdapter(rfProvider);
      return json(res, 200, {
        ok: ready(),
        provider: rfProvider,
        isTest: kassa.isTest,
        yookassaReady: yookassa.isReady(),
        ...yookassa.healthExtra(),
        ...robokassa.healthExtra(),
        ...prodamus.healthExtra(),
        auth,
        payouts,
        payoutsSbpOk: payouts.authOk === true && payouts.sbpAvailable === true,
      });
    }

    if (!ready()) {
      const rfProvider = getRfProvider();
      return json(res, 503, {
        error:
          rfProvider === "robokassa"
            ? "pay-api: нужны ROBOKASSA_MERCHANT_LOGIN, ROBOKASSA_PASSWORD1 и ROBOKASSA_PASSWORD2"
            : "pay-api: нужны YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY магазина",
      });
    }

    if (path === "/api/payments/init") return handleInit(req, res);
    if (path === "/api/payments/status") return handleStatus(req, res);
    if (path === "/api/payments/init-gift") return handleInitGift(req, res);
    if (path === "/api/yookassa/webhook") return handleYookassaWebhook(req, res);
    if (path === "/api/prodamus/webhook") return handleProdamusWebhook(req, res);

    return json(res, 404, { error: "not found" });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: "internal" });
  }
});

server.listen(PORT, BIND, () => {
  const rfProvider = getRfProvider();
  console.log(
    `pay-api listening on ${BIND}:${PORT} rf=${rfProvider} robokassa=${robokassa.isReady()} yookassa=${yookassa.isReady()} test=${rfAdapter(rfProvider).isTest}`
  );
  void syncPendingPayments();
  setInterval(() => void syncPendingPayments(), 4000);
});
