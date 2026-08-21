/**
 * Robokassa init + ResultURL for the static PWA.
 * Passwords stay on the VPS. The browser only receives a signed payment URL.
 */
import { createHash } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number(process.env.PORT) || 8791;
const BIND = process.env.BIND || "127.0.0.1";
const SUPABASE_URL = (
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  ""
).replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const MERCHANT = process.env.ROBOKASSA_MERCHANT_LOGIN || "uniquevocal";
const HASH_ALG = (process.env.ROBOKASSA_HASH || "md5").toLowerCase();
const IS_TEST = ["1", "true", "yes"].includes(
  String(process.env.ROBOKASSA_IS_TEST || "1").toLowerCase()
);
const PASS1 = IS_TEST
  ? process.env.ROBOKASSA_TEST_PASS1 || ""
  : process.env.ROBOKASSA_PASS1 || "";
const PASS2 = IS_TEST
  ? process.env.ROBOKASSA_TEST_PASS2 || ""
  : process.env.ROBOKASSA_PASS2 || "";
const APP_ORIGIN = (
  process.env.NEXT_PUBLIC_APP_URL || "https://www.uniquevocal.ru"
).replace(/\/$/, "");
const PAY_URL = "https://auth.robokassa.ru/Merchant/Index.aspx";
const SUCCESS_URL = `${APP_ORIGIN}/pay/success`;
const FAIL_URL = `${APP_ORIGIN}/pay/fail`;

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

function text(res, status, body) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(body);
}

function digest(value) {
  const algo = HASH_ALG === "sha256" ? "sha256" : "md5";
  return createHash(algo).update(String(value), "utf8").digest("hex");
}

function signInit(outSum, invId) {
  return digest(
    [
      MERCHANT,
      outSum,
      String(invId),
      encodeURIComponent(SUCCESS_URL),
      "GET",
      encodeURIComponent(FAIL_URL),
      "GET",
      PASS1,
    ].join(":")
  );
}

function signResult(outSum, invId) {
  return digest(`${outSum}:${invId}:${PASS2}`);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function paramsFrom(req, raw, url) {
  const merged = new URLSearchParams(url.search);
  const contentType = String(req.headers["content-type"] || "");
  if (raw) {
    if (contentType.includes("application/json")) {
      try {
        const data = JSON.parse(raw);
        for (const [key, value] of Object.entries(data || {})) {
          if (value != null) merged.set(key, String(value));
        }
      } catch {
        /* ignore */
      }
    } else {
      const form = new URLSearchParams(raw);
      for (const [key, value] of form) merged.set(key, value);
    }
  }
  const pick = (name) =>
    merged.get(name) ||
    merged.get(name.toLowerCase()) ||
    merged.get(name[0].toUpperCase() + name.slice(1)) ||
    "";
  return {
    OutSum: pick("OutSum"),
    InvId: pick("InvId") || pick("InvoiceID"),
    SignatureValue: pick("SignatureValue"),
    EMail: pick("EMail") || pick("Email"),
    PaymentMethod: pick("PaymentMethod"),
  };
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

async function handleInitGift(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "method" });
  const auth = String(req.headers.authorization || "");
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return json(res, 401, { error: "Нужно войти" });

  const user = await authUser(token);
  if (!user?.id) return json(res, 401, { error: "Сессия истекла, войдите снова" });

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
      provider: "robokassa",
      status: "pending",
      metadata: {
        is_test: IS_TEST,
        gift_id: cert.id,
        gift_code: cert.code,
        recipient_name: cert.recipient_name,
        gift_kind: cert.kind,
        description,
      },
    }),
  });
  if (!insert.ok) {
    const detail = await insert.text();
    console.error("gift invoice failed", insert.status, detail);
    return json(res, 500, { error: "Не удалось создать счёт на подарок" });
  }
  const rows = await insert.json();
  const tx = Array.isArray(rows) ? rows[0] : rows;
  const invId = Number(tx?.invoice_no);
  if (!invId) {
    console.error("gift invoice_no missing", tx);
    return json(res, 500, { error: "Счёт создан без номера" });
  }

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
    const detail = await patch.text();
    console.error("gift patch failed", patch.status, detail);
    return json(res, 500, { error: "Счёт создан, но сертификат не обновился" });
  }

  const signature = signInit(outSum, invId);
  const pay = new URL(PAY_URL);
  pay.searchParams.set("MerchantLogin", MERCHANT);
  pay.searchParams.set("OutSum", outSum);
  pay.searchParams.set("InvId", String(invId));
  pay.searchParams.set("Description", description);
  pay.searchParams.set("SignatureValue", signature);
  pay.searchParams.set("Culture", "ru");
  pay.searchParams.set("IncCurrLabel", "SBP");
  pay.searchParams.append("PaymentMethods", "SBP");
  pay.searchParams.set("SuccessUrl2", SUCCESS_URL);
  pay.searchParams.set("SuccessUrl2Method", "GET");
  pay.searchParams.set("FailUrl2", FAIL_URL);
  pay.searchParams.set("FailUrl2Method", "GET");
  if (IS_TEST) pay.searchParams.set("IsTest", "1");

  return json(res, 200, {
    paymentUrl: pay.toString(),
    invoiceNo: invId,
    amount: Number(outSum),
    isTest: IS_TEST,
    code: cert.code,
  });
}

async function handleInit(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "method" });
  const auth = String(req.headers.authorization || "");
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return json(res, 401, { error: "Нужно войти в кабинет" });

  const user = await authUser(token);
  if (!user?.id) return json(res, 401, { error: "Сессия истекла, войдите снова" });

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
      return json(res, 400, {
        error: "Тариф Duo меняет владелец подписки",
      });
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
      provider: "robokassa",
      status: "pending",
      metadata: {
        is_test: IS_TEST,
        tier,
        is_duo: isDuo,
        description,
      },
    }),
  });
  if (!insert.ok) {
    const detail = await insert.text();
    console.error("create invoice failed", insert.status, detail);
    return json(res, 500, { error: "Не удалось создать счёт" });
  }
  const rows = await insert.json();
  const tx = Array.isArray(rows) ? rows[0] : rows;
  const invId = Number(tx?.invoice_no);
  if (!invId) {
    console.error("invoice_no missing", tx);
    return json(res, 500, { error: "Счёт создан без номера" });
  }

  const signature = signInit(outSum, invId);
  const pay = new URL(PAY_URL);
  pay.searchParams.set("MerchantLogin", MERCHANT);
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
  if (IS_TEST) pay.searchParams.set("IsTest", "1");
  const email = String(user.email || profile.email || "").trim();
  if (email) pay.searchParams.set("Email", email);

  return json(res, 200, {
    paymentUrl: pay.toString(),
    invoiceNo: invId,
    amount: Number(outSum),
    isTest: IS_TEST,
  });
}

async function handleResult(req, res) {
  const raw = req.method === "GET" ? "" : await readBody(req);
  const url = new URL(req.url || "/", APP_ORIGIN);
  const params = paramsFrom(req, raw, url);
  const outSum = String(params.OutSum || "").trim();
  const invId = String(params.InvId || "").trim();
  const signature = String(params.SignatureValue || "").trim().toLowerCase();
  const expected = signResult(outSum, invId).toLowerCase();

  if (!outSum || !invId || !signature || signature !== expected) {
    console.error("robokassa bad signature", { invId, outSum });
    return text(res, 400, "bad signature");
  }

  const confirm = await sb("/rest/v1/rpc/confirm_robokassa_payment", {
    method: "POST",
    body: JSON.stringify({
      p_invoice_no: Number(invId),
      p_out_sum: Number(outSum),
      p_external_id: params.PaymentMethod || null,
    }),
  });
  if (!confirm.ok) {
    const detail = await confirm.text();
    console.error("confirm failed", confirm.status, detail);
    return text(res, 500, "confirm failed");
  }

  return text(res, 200, `OK${invId}`);
}

function ready() {
  return Boolean(SUPABASE_URL && SERVICE_KEY && PASS1 && PASS2 && MERCHANT);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (
      path === "/health" ||
      path === "/api/robokassa/health" ||
      path === "/api/robokassa"
    ) {
      return json(res, 200, {
        ok: ready(),
        isTest: IS_TEST,
        merchant: MERCHANT,
      });
    }
    if (!ready()) return json(res, 503, { error: "pay-api is not configured" });
    if (path === "/api/robokassa/init") return handleInit(req, res);
    if (path === "/api/robokassa/init-gift") return handleInitGift(req, res);
    if (path === "/api/robokassa/result") return handleResult(req, res);
    return json(res, 404, { error: "not found" });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: "internal" });
  }
});

server.listen(PORT, BIND, () => {
  console.log(`pay-api listening on ${BIND}:${PORT} test=${IS_TEST}`);
});
