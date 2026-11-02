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
 * Foreign-card methods must be enabled on the payform by Prodamus support.
 * Until PRODAMUS_INTERNATIONAL=1 the app hides the button, because the form
 * would otherwise open with Russian methods only.
 */
const INTERNATIONAL_ENABLED = ["1", "true", "yes"].includes(
  String(process.env.PRODAMUS_INTERNATIONAL || "").toLowerCase()
);
/** Bump when the signed link shape changes so stale Prodamus URLs are not reused. */
export const PRODAMUS_FLOW = "intl_direct_v3";
/**
 * Prodamus "Зарубежные карты" is a tariff on the card field, not a separate
 * SBP-style button. The form method is still `AC`. Extra world/CIS codes are
 * included when support enabled them as their own methods.
 *
 * A filter with zero hits is ignored → full list (SBP, SberPay, installments).
 * `AC` must stay in the list so the filter actually matches.
 */
const INTERNATIONAL_METHODS = [
  "AC",
  "MONETAWORLD",
  "monetaworld",
  "overpayeur",
  "ACUSDKB",
  "ACEURKB",
  "ACUSDGTL",
  "ACEURGTL",
  "ACUSDGV",
  "ACEURGV",
  "ACusdxp",
  "ACeurxp",
  "ACGBPGV",
  "ACBYNGTL",
  "ACf",
  "ACkz",
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

function withoutSignatureFields(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data;
  const copy = { ...data };
  delete copy.signature;
  delete copy.sign;
  delete copy.Sign;
  return copy;
}

/** Constant-time check; accepts both PHP-style (\uXXXX) and raw unicode JSON. */
export function verifySignature(data, signature) {
  const given = String(signature || "").trim().toLowerCase();
  if (!SECRET_KEY || !/^[0-9a-f]{64}$/.test(given)) return false;
  const givenBuf = Buffer.from(given, "hex");
  const payload = withoutSignatureFields(data);
  return [false, true].some((escapeUnicode) => {
    const expected = Buffer.from(hmac(payload, escapeUnicode), "hex");
    return (
      expected.length === givenBuf.length && timingSafeEqual(expected, givenBuf)
    );
  });
}

/**
 * JSON webhooks sometimes wrap fields in `submit`; form posts come as-is.
 * Try every plausible object so a paid order is not left pending.
 */
export function webhookPayloads(data, raw) {
  const out = [];
  const seen = new Set();
  const add = (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const clean = withoutSignatureFields(value);
    let key;
    try {
      key = JSON.stringify(stringifyDeep(clean));
    } catch {
      return;
    }
    if (seen.has(key)) return;
    seen.add(key);
    out.push(clean);
    if (clean.submit && typeof clean.submit === "object") add(clean.submit);
  };
  add(data);
  if (raw && typeof raw === "string" && raw.includes("=") && !raw.trim().startsWith("{")) {
    try {
      add(parseFormBody(raw));
    } catch {
      /* ignore malformed form bodies */
    }
  }
  return out;
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
  isInternational() {
    return Boolean(FORM_URL && SECRET_KEY && INTERNATIONAL_ENABLED);
  },
  healthExtra() {
    return {
      prodamusReady: Boolean(FORM_URL && SECRET_KEY),
      prodamusInternational: INTERNATIONAL_ENABLED,
      prodamusForm: FORM_URL || null,
    };
  },
  /**
   * Return a signed payform URL (`do=pay`) that the student opens directly.
   * `do=link` short URLs (tiny.payform.ru) render the page default methods
   * and drop `available_payment_methods` — that is why SBP kept showing.
   */
  async createPayment({ outSum, invId, description, email, phone }) {
    const successUrl = `${APP_ORIGIN}/pay/success?invoice=${encodeURIComponent(String(invId))}`;
    const data = {
      do: "pay",
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
      available_payment_methods: INTERNATIONAL_METHODS,
      installments_disabled: "1",
      _param_invoice_no: String(invId),
    };
    if (email) data.customer_email = email;
    const phoneDigits = String(phone || "").replace(/[^\d+]/g, "");
    if (phoneDigits.length >= 10) data.customer_phone = phoneDigits;

    const signed = { ...data, signature: hmac(data, false) };
    const encoded = toQuery(signed);
    const paymentUrl = `${FORM_URL}/?${encoded}`;
    console.log("[uvs:prodamus] create", {
      invoice: invId,
      amount: outSum,
      flow: PRODAMUS_FLOW,
      do: data.do,
      methods: INTERNATIONAL_METHODS,
      queryBytes: encoded.length,
      urlBytes: paymentUrl.length,
      hasMethods: encoded.includes("available_payment_methods"),
      hasInstallmentsOff: encoded.includes("installments_disabled"),
      hasPhone: Boolean(data.customer_phone),
      host: FORM_URL.replace(/^https?:\/\//, ""),
    });
    return { paymentUrl, externalId: null };
  },
};
