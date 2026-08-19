#!/usr/bin/env node
/**
 * Checks whether uniquevocal.ru resolves to Timeweb or leftover GitHub Pages IPs.
 * Run: npm run check-dns
 */
import dns from "node:dns/promises";

const TIMEWEB_IP = "92.246.76.92";
const PROXY_IP = "5.42.123.142";
const HOSTS = ["uniquevocal.ru", "www.uniquevocal.ru"];
const PROXY_HOST = "sb.uniquevocal.ru";
const GITHUB_PAGES_PREFIX = "185.199.";

const resolvers = [
  { label: "Google Public DNS", servers: ["8.8.8.8", "8.8.4.4"] },
  { label: "Yandex DNS", servers: ["77.88.8.8", "77.88.8.1"] },
  { label: "Cloudflare DNS", servers: ["1.1.1.1", "1.0.0.1"] },
  { label: "reg.ru authoritative", servers: ["176.99.13.13", "176.99.13.14"] },
];

function classify(ip) {
  if (ip === PROXY_IP) return "moscow-vps";
  if (ip === TIMEWEB_IP) return "timeweb-frontend";
  if (ip.startsWith(GITHUB_PAGES_PREFIX)) return "github-pages";
  return "other";
}

async function lookup(host, servers) {
  const resolver = new dns.Resolver();
  resolver.setServers(servers);
  const [aRecords, cnameRecords] = await Promise.all([
    resolver.resolve4(host).catch(() => []),
    resolver.resolveCname(host).catch(() => []),
  ]);
  return { aRecords, cnameRecords };
}

let failed = false;

console.log(`Expected site/proxy IP (Moscow VPS): ${PROXY_IP}\n`);

for (const host of HOSTS) {
  console.log(`=== ${host} ===`);
  for (const { label, servers } of resolvers) {
    try {
      const { aRecords, cnameRecords } = await lookup(host, servers);
      const cname =
        cnameRecords.length > 0 ? ` CNAME → ${cnameRecords.join(", ")}` : "";
      if (aRecords.length === 0 && cnameRecords.length === 0) {
        console.log(`  ${label}: (no A/CNAME)`);
        failed = true;
        continue;
      }
      for (const ip of aRecords) {
        const kind = classify(ip);
        const mark =
          kind === "moscow-vps"
            ? "OK"
            : kind === "github-pages"
              ? "BAD"
              : kind === "timeweb-frontend"
                ? "WARN"
                : "WARN";
        if (kind !== "moscow-vps") failed = true;
        console.log(`  ${label}: ${ip} [${mark}]${cname}`);
      }
      if (aRecords.length === 0 && cnameRecords.length > 0) {
        console.log(`  ${label}:${cname} [BAD — only CNAME, no A]`);
        failed = true;
      }
    } catch (err) {
      console.log(`  ${label}: error — ${err.message}`);
      failed = true;
    }
  }
  console.log("");
}

console.log(`=== ${PROXY_HOST} ===`);
for (const { label, servers } of resolvers) {
  try {
    const { aRecords, cnameRecords } = await lookup(PROXY_HOST, servers);
    const cname =
      cnameRecords.length > 0 ? ` CNAME → ${cnameRecords.join(", ")}` : "";
    if (aRecords.length === 0 && cnameRecords.length === 0) {
      console.log(`  ${label}: (no A/CNAME) [WARN — add A ${PROXY_IP}]`);
      failed = true;
      continue;
    }
    for (const ip of aRecords) {
      const mark = ip === PROXY_IP ? "OK" : "WARN";
      if (ip !== PROXY_IP) failed = true;
      console.log(`  ${label}: ${ip} [${mark}]${cname}`);
    }
  } catch (err) {
    console.log(`  ${label}: error — ${err.message}`);
    failed = true;
  }
}
console.log("");

if (failed) {
  console.error(
    "DNS is NOT clean everywhere. Site and proxy: A @, www, sb → 5.42.123.142 (Moscow VPS)."
  );
  process.exit(1);
}

console.log(
  "uniquevocal.ru, www, and sb point to the Moscow VPS. If a phone still shows a black screen, wait for DNS TTL or flush the resolver cache."
);
