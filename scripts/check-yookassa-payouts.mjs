/**
 * Local SBP payouts-gateway probe: GET /v3/me with agentId:secret.
 * Does not create payouts. Loads .env.local from repo root.
 *
 * Usage: node scripts/check-yookassa-payouts.mjs
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env.local");

function loadEnv(path) {
  const out = {};
  try {
    for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  } catch {
    /* optional */
  }
  return out;
}

const fileEnv = loadEnv(envPath);
const agentId =
  process.env.YOOKASSA_AGENT_ID || fileEnv.YOOKASSA_AGENT_ID || "";
const secret =
  process.env.YOOKASSA_PAYOUT_SECRET_KEY ||
  fileEnv.YOOKASSA_PAYOUT_SECRET_KEY ||
  process.env.YOOKASSA_SECRET_KEY ||
  fileEnv.YOOKASSA_SECRET_KEY ||
  "";

if (!agentId || !secret) {
  console.error(
    JSON.stringify({
      ok: false,
      error: "missing YOOKASSA_AGENT_ID or payout secret",
    })
  );
  process.exit(1);
}

const auth = Buffer.from(`${agentId}:${secret}`).toString("base64");
const res = await fetch("https://api.yookassa.ru/v3/me", {
  headers: { authorization: `Basic ${auth}` },
});
const body = await res.json().catch(() => ({}));
const methods = Array.isArray(body.payout_methods)
  ? body.payout_methods.map((m) =>
      typeof m === "string" ? m : m?.type || m?.method || m
    )
  : [];
const sbpAvailable = methods.some((m) =>
  String(m).toLowerCase().includes("sbp")
);

const report = {
  ok: res.ok && sbpAvailable,
  httpStatus: res.status,
  authOk: res.ok,
  accountId: body.account_id || null,
  test: Boolean(body.test),
  payoutMethods: methods,
  sbpAvailable,
  agentId,
};
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 2);
