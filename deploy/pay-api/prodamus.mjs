/**
 * Prodamus (payform) adapter for the static PWA pay-api.
 *
 * Used only for the "pay with an international card" flow. Payment is
 * confirmed ONLY by a webhook carrying a valid HMAC `Sign` header — returning
 * to urlSuccess proves nothing.
 *
 * Docs: https://help.prodamus.ru/payform/integracii/rest-api/instrukcii-dlya-samostoyatelnaya-integracii-servisov
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const APP_ORIGIN = (
  process.env.NEXT_PUBLIC_APP_URL || "https://www.uniquevocal.ru"
).replace(/\/$/, "");
const FORM_URL = (process.env.PRODAMUS_URL || "").replace(/\/+$/, "");
const SECRET_KEY = process.env.PRODAMUS_SECRET_KEY || "";

/**
 * Methods offered for the "international card" button. Prodamus ignores the
 * filter if none of these is enabled on the page, so the list is safe.
 */
const INTERNATIONAL_METHODS = [
  "ACUSDKB",
  "ACEURKB",
  "ACUSDGTL",
  "ACEURGTL",
  "monetaworld",
].join("|");

function stringifyDeep(value) {
  if (Array.isArray(value)) return value.map(stringifyDeep);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = stringifyDeep(value[key]);
    }
    return out;
  }
  if (value === null || value === undefined || value === false) return "";
  if (value === true) return "1";
  return String(value);
}

function serialize(data, escapeUnicode) {
  let json = JSON.stringify(stringifyDeep(data)).replace(/\//g, "\\/");
  if (escapeUnicode) {
    json = json.replace(
      /[\u0080-\uffff]/g,
      (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`
    );
  }
  return json;
}

function hmac(data, escapeUnicode) {
  return createHmac("sha256", SECRET_KEY)
    .update(serialize(data, escapeUnicode))
    .digest("hex");
}

export function signPayload(data, escapeUnicode = false) {
  return hmac(data, escapeUnicode);
}

/** Constant-time check; accepts both PHP-style (\uXXXX) and raw unicode JSON. */
export function verifySignature(data, signature) {
  const given = String(signature || "").trim().toLowerCase();
  if (!SECRET_KEY || !/^[0-9a-f]{64}$/.test(given)) return false;
  const givenBuf = Buffer.from(given, "hex");
  return [false, true].some((escapeUnicode) => {
    const expected = Buffer.from(hmac(data, escapeUnicode), "hex");
    return (
      expected.length === givenBuf.length && timingSafeEqual(expected, givenBuf)
    );
  });
}

function flatten(data, prefix = "", out = []) {
  for (const [key, value] of Object.entries(data)) {
    const name = prefix ? `${prefix}[${key}]` : key;
    if (value && typeof value === "object") {
      flatten(value, name, out);
    } else {
      out.push([name, String(value)]);
    }
  }
  return out;
}

function toQuery(data) {
  return flatten(data)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

/** Parse PHP-style form bodies (products[0][name]=…) into nested objects. */
export function parseFormBody(raw) {
  const root = {};
  for (const [rawKey, value] of new URLSearchParams(raw)) {
    const parts = rawKey.match(/[^[\]]+/g);
    if (!parts) continue;
    let node = root;
    parts.forEach((part, index) => {
      if (index === parts.length - 1) {
        node[part] = value;
        return;
      }
      if (typeof node[part] !== "object" || node[part] === null) {
        node[part] = {};
      }
      node = node[part];
    });
  }
  return listify(root);
}

/** {"0":…,"1":…} → […] so the signed JSON matches PHP's list encoding. */
function listify(node) {
  if (!node || typeof node !== "object") return node;
  const keys = Object.keys(node);
  const out = Array.isArray(node) ? node.map(listify) : {};
  if (!Array.isArray(node)) {
    for (const key of keys) out[key] = listify(node[key]);
    if (keys.length && keys.every((key, index) => key === String(index))) {
      return keys.map((key) => out[key]);
    }
  }
  return out;
}

export const prodamus = {
  id: "prodamus",
  isReady() {
    return Boolean(FORM_URL && SECRET_KEY);
  },
  isTest: false,
  healthExtra() {
    return {
      prodamusReady: Boolean(FORM_URL && SECRET_KEY),
      prodamusForm: FORM_URL || null,
    };
  },
  /**
   * Build a signed link and ask Prodamus for its short form (do=link).
   * `invId` is our payment_transactions.invoice_no.
   */
  async createPayment({ outSum, invId, description, email, international }) {
    const successUrl = `${APP_ORIGIN}/pay/success?invoice=${encodeURIComponent(String(invId))}`;
    const data = {
      do: "link",
      order_id: String(invId),
      products: [
        {
          name: description.slice(0, 128),
          price: String(outSum),
          quantity: "1",
        },
      ],
      urlSuccess: successUrl,
      urlReturn: `${APP_ORIGIN}/pay/fail?invoice=${encodeURIComponent(String(invId))}`,
      callbackType: "json",
      _param_invoice_no: String(invId),
    };
    if (email) data.customer_email = email;
    if (international) data.available_payment_methods = INTERNATIONAL_METHODS;

    // Raw unicode first; Prodamus verifies like PHP, so retry escaped on reject.
    let lastError;
    for (const escapeUnicode of [false, true]) {
      const signed = { ...data, signature: hmac(data, escapeUnicode) };
      const response = await fetch(`${FORM_URL}/?${toQuery(signed)}`, {
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
      });
      const text = (await response.text()).trim();
      if (response.ok && /^https?:\/\/\S+$/.test(text)) {
        return { paymentUrl: text, externalId: null };
      }
      lastError = new Error(
        `Prodamus HTTP ${response.status}: ${text.slice(0, 200)}`
      );
    }
    throw lastError;
  },
};
