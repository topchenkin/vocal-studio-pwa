/**
 * Robokassa adapter for RF checkout (SBP / MIR / RU cards).
 *
 * Payment URL: https://auth.robokassa.ru/Merchant/Index.aspx
 * ResultURL must answer `OK{InvId}` as text/plain.
 * Receipt JSON is required for Robocheki SMZ / 54-FZ.
 *
 * Docs: https://docs.robokassa.ru/ru/pay-interface
 *       https://docs.robokassa.ru/ru/fiscalization
 *       https://docs.robokassa.ru/ru/notifications-and-redirects
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const ROBOKASSA_FLOW = "get_v3";

const APP_ORIGIN = (
  process.env.NEXT_PUBLIC_APP_URL || "https://www.uniquevocal.ru"
).replace(/\/$/, "");
const MERCHANT_LOGIN = process.env.ROBOKASSA_MERCHANT_LOGIN || "";
const PASSWORD1 = process.env.ROBOKASSA_PASSWORD1 || "";
const PASSWORD2 = process.env.ROBOKASSA_PASSWORD2 || "";
/** XML OpState uses Password #3 when the shop has one; fall back to #2. */
const PASSWORD3 = process.env.ROBOKASSA_PASSWORD3 || "";
const HASH_ALG = String(process.env.ROBOKASSA_HASH || "md5")
  .toLowerCase()
  .replace(/[^a-z0-9]/g, "");
const IS_TEST = ["1", "true", "yes"].includes(
  String(process.env.ROBOKASSA_IS_TEST || "").toLowerCase()
);
const TAX = String(process.env.ROBOKASSA_TAX || "none").trim() || "none";
const PAY_URL = "https://auth.robokassa.ru/Merchant/Index.aspx";
const OPSTATE_URL =
  "https://auth.robokassa.ru/Merchant/WebService/Service.asmx/OpStateExt";

const HASH_ALGS = new Set(["md5", "sha1", "sha256", "sha384", "sha512"]);

function hashAlg() {
  return HASH_ALGS.has(HASH_ALG) ? HASH_ALG : "md5";
}

function digest(value) {
  return createHash(hashAlg()).update(String(value), "utf8").digest("hex");
}

function sameHash(left, right) {
  const a = Buffer.from(String(left || "").trim().toLowerCase(), "utf8");
  const b = Buffer.from(String(right || "").trim().toLowerCase(), "utf8");
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

function sanitizeText(value, max) {
  return String(value || "")
    .replace(/[<>&"'`—–·•]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function goToken() {
  return randomBytes(12).toString("hex");
}

export function buildReceipt({ name, sum }) {
  const itemName = sanitizeText(name, 128) || "Unique Vocal Studio";
  const amount = Number(sum);
  return JSON.stringify({
    items: [
      {
        name: itemName,
        quantity: 1,
        sum: amount,
        payment_method: "full_payment",
        payment_object: "service",
        tax: TAX,
      },
    ],
  });
}

function queryString(fields) {
  return Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`
    )
    .join("&");
}

export function paymentFields({ outSum, invId, description, email }) {
  const sum = String(outSum);
  const invoice = String(invId);
  const receiptJson = buildReceipt({
    name: description,
    sum,
  });
  // Signature Receipt must match GET query encoding (encodeURIComponent, %20).
  // PHP urlencode (+) plus an HTML POST form produced error 29 in Chrome.
  const receiptEnc = encodeURIComponent(receiptJson);
  const signature = digest(
    `${MERCHANT_LOGIN}:${sum}:${invoice}:${receiptEnc}:${PASSWORD1}`
  );
  const fields = {
    MerchantLogin: MERCHANT_LOGIN,
    OutSum: sum,
    InvId: invoice,
    Description: sanitizeText(description, 100),
    SignatureValue: signature,
    Receipt: receiptJson,
  };
  if (email) fields.Email = String(email).slice(0, 128);
  if (IS_TEST) fields.IsTest = "1";
  return { fields, receiptEnc };
}

export function paymentUrlFromFields(fields) {
  return `${PAY_URL}?${queryString(fields)}`;
}

export function robokassaGoUrl(invId, token) {
  const params = new URLSearchParams({
    invoice: String(invId),
    t: String(token || ""),
  });
  return `${APP_ORIGIN}/api/payments/robokassa-go?${params.toString()}`;
}

export const robokassa = {
  id: "robokassa",
  isReady() {
    return Boolean(MERCHANT_LOGIN && PASSWORD1 && PASSWORD2);
  },
  isTest: IS_TEST,
  healthExtra() {
    return {
      robokassaReady: this.isReady(),
      robokassaLogin: MERCHANT_LOGIN || null,
      robokassaHash: hashAlg(),
      robokassaIsTest: IS_TEST,
      robokassaPassword1Set: Boolean(PASSWORD1),
      robokassaPassword2Set: Boolean(PASSWORD2),
      robokassaPassword3Set: Boolean(PASSWORD3),
      robokassaResultUrl: `${APP_ORIGIN}/api/robokassa/result`,
    };
  },
  createPayment({ outSum, invId, description, email, token }) {
    if (!this.isReady()) {
      throw new Error("Robokassa: задайте ROBOKASSA_MERCHANT_LOGIN, PASSWORD1 и PASSWORD2");
    }
    const built = paymentFields({ outSum, invId, description, email });
    return {
      paymentUrl: paymentUrlFromFields(built.fields),
      externalId: String(invId),
      fields: built.fields,
    };
  },
  verifyResult({ outSum, invId, signature }) {
    if (!PASSWORD2) return false;
    const expected = digest(`${outSum}:${invId}:${PASSWORD2}`);
    return sameHash(expected, signature);
  },
  async fetchPayment(invoiceNo) {
    if (!this.isReady()) {
      throw new Error("Robokassa is not configured");
    }
    const invoice = String(invoiceNo);
    const secrets = [PASSWORD3, PASSWORD2].filter(Boolean);
    let last = { status: "pending", stateCode: 0, resultCode: 0, invoiceNo: invoice };
    for (const secret of secrets) {
      const signature = digest(`${MERCHANT_LOGIN}:${invoice}:${secret}`);
      const url = `${OPSTATE_URL}?${queryString({
        MerchantLogin: MERCHANT_LOGIN,
        InvoiceID: invoice,
        Signature: signature,
      })}`;
      const response = await fetch(url);
      const xml = await response.text();
      if (!response.ok) continue;
      const resultCode = Number(
        (xml.match(/<Result>[\s\S]*?<Code>(\d+)<\/Code>/i) || [])[1] || ""
      );
      const stateCode = Number(
        (xml.match(/<State>[\s\S]*?<Code>(\d+)<\/Code>/i) || [])[1] || ""
      );
      last = { status: "pending", stateCode, resultCode, invoiceNo: invoice };
      // 1 = bad signature for this password; try the other.
      if (resultCode === 1) continue;
      // 100 = paid; 10 cancelled; 60 refunded.
      if (stateCode === 100) last.status = "succeeded";
      else if (stateCode === 10 || stateCode === 60) last.status = "canceled";
      return last;
    }
    return last;
  },
};
