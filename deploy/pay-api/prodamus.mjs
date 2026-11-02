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
export const PRODAMUS_FLOW = "intl_link_v6";
/**
 * Official REST codes for foreign cards
 * (help.prodamus.ru → самостоятельная интеграция + «Карты зарубежных банков»).
 *
 * Foreign cards are a separate method in USD/KZT, not the RF `AC` field.
 * Including `AC` opens the Russian checkout (SBP + SberPay + «Номер карты»).
 * `monetaworld` = world except RF; `ACUSDKB` = USD world except RF (US cards).
 */
const INTERNATIONAL_METHOD = "monetaworld";
const INTERNATIONAL_METHODS = [
  "monetaworld",
  "ACUSDKB",
  "ACEURKB",
  "ACUSDGTL",
  "ACEURGTL",
  "ACf",
  "ACkz",
  "ACBYNGTL",
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

function isStoredPayformLink(url) {
  try {
    const parsed = new URL(String(url || "").trim());
    if (!/(^|\.)payform\.ru$/i.test(parsed.hostname)) return false;
    if (parsed.searchParams.has("do") || parsed.searchParams.has("signature")) return false;
    return parsed.pathname.length > 1;
  } catch {
    return false;
  }
}

function parsePayformLink(text, location) {
  const candidates = [location];
  const raw = String(text || "").trim();
  if (raw.startsWith("{")) {
    try {
      const json = JSON.parse(raw);
      const nested = json && typeof json.data === "object" ? json.data : null;
      candidates.push(json.link, json.url, json.payment_link, nested?.link, nested?.url);
    } catch {
      /* fall through */
    }
  }
  if (/^https?:\/\//i.test(raw)) candidates.push(raw);
  const match = raw.match(/https?:\/\/[a-z0-9.-]*payform\.ru\/[^\s"'<>]+/i);
  if (match) candidates.push(match[0].replace(/[),.;]+$/, ""));
  return candidates.map((value) => String(value || "").trim()).find(isStoredPayformLink) || "";
}

async function requestPayformLink(encoded) {
  const headers = { Accept: "application/json, text/plain, */*" };
  const attempts = [
    {
      via: "GET",
      url: `${FORM_URL}/?${encoded}`,
      init: { method: "GET", headers, redirect: "follow" },
    },
    {
      via: "POST",
      url: `${FORM_URL}/`,
      init: {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        },
        body: encoded,
        redirect: "follow",
      },
    },
  ];
  for (const attempt of attempts) {
    const resp = await fetch(attempt.url, attempt.init);
    const text = await resp.text();
    const paymentUrl =
      parsePayformLink(text, resp.headers.get("location")) ||
      (isStoredPayformLink(resp.url) ? resp.url : "");
    if (paymentUrl) return { paymentUrl, via: attempt.via };
  }
  throw new Error("prodamus do=link did not return a payment URL");
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
   * Official «формирование ссылки»: signed `do=link` so Prodamus stores
   * `payment_method` on the order. Browser `do=pay` opens the SPA checkout
   * and keeps the RF methods (SBP / SberPay / AC) even when the query
   * listed monetaworld.
   */
  async createPayment({ outSum, invId, description, email, phone }) {
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
      payment_method: INTERNATIONAL_METHOD,
      available_payment_methods: INTERNATIONAL_METHODS,
      _param_invoice_no: String(invId),
    };
    if (email) data.customer_email = email;
    const phoneDigits = String(phone || "").replace(/[^\d+]/g, "");
    if (phoneDigits.length >= 10) data.customer_phone = phoneDigits;

    const signed = { ...data, signature: hmac(data, false) };
    const encoded = toQuery(signed);
    const { paymentUrl, via } = await requestPayformLink(encoded);
    let payHost = "";
    try {
      payHost = new URL(paymentUrl).host;
    } catch {
      payHost = "invalid";
    }
    console.log("[uvs:prodamus] create", {
      invoice: invId,
      amount: outSum,
      flow: PRODAMUS_FLOW,
      do: data.do,
      via,
      paymentMethod: INTERNATIONAL_METHOD,
      methods: INTERNATIONAL_METHODS,
      queryBytes: encoded.length,
      urlBytes: paymentUrl.length,
      hasMethods: encoded.includes("available_payment_methods"),
      hasPaymentMethod: encoded.includes("payment_method="),
      hasPhone: Boolean(data.customer_phone),
      host: payHost,
    });
    return { paymentUrl, externalId: null };
  },
};
