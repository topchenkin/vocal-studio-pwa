#!/usr/bin/env node
/**
 * Dump hosted Supabase public data + storage (except chat) onto this machine.
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional: OUT_DIR (default /opt/uvs-migrate)
 */
import { mkdir, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const ORIGIN = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const OUT = process.env.OUT_DIR || "/opt/uvs-migrate";
const SKIP_TABLES = new Set([
  "chat_messages",
  "group_chat_messages",
  "group_chats",
  "group_chat_members",
]);
const SKIP_BUCKETS = new Set(["chat-media"]);

if (!ORIGIN || !KEY) {
  console.error("missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

function headers(extra = {}) {
  return {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    ...extra,
  };
}

async function api(pathname, init = {}) {
  const response = await fetch(`${ORIGIN}${pathname}`, {
    ...init,
    headers: { ...headers(init.headers || {}), ...(init.headers || {}) },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${pathname} ${response.status} ${text.slice(0, 400)}`);
  }
  return text ? JSON.parse(text) : null;
}

async function listTables() {
  const response = await fetch(`${ORIGIN}/rest/v1/`, {
    headers: {
      ...headers(),
      Accept: "application/openapi+json",
    },
  });
  const spec = await response.json();
  const names = Object.keys(spec.paths || {})
    .map((p) => p.replace(/^\//, "").split("/")[0])
    .filter(Boolean);
  return [...new Set(names)].filter(
    (name) => !name.startsWith("rpc") && name !== ""
  );
}

async function dumpTable(name) {
  const rows = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const to = from + page - 1;
    const response = await fetch(`${ORIGIN}/rest/v1/${name}?select=*`, {
      headers: {
        ...headers(),
        Range: `${from}-${to}`,
        Prefer: "count=exact",
      },
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`table ${name} ${response.status} ${text.slice(0, 400)}`);
    }
    const chunk = text ? JSON.parse(text) : [];
    rows.push(...chunk);
    if (chunk.length < page) break;
  }
  return rows;
}

async function listPrefix(bucket, prefix) {
  const files = [];
  const page = 1000;
  for (let offset = 0; ; offset += page) {
    const batch = await api(`/storage/v1/object/list/${bucket}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prefix,
        limit: page,
        offset,
        sortBy: { column: "name", order: "asc" },
      }),
    });
    const items = Array.isArray(batch) ? batch : [];
    for (const item of items) {
      const rel = `${prefix}${item.name}`;
      if (item.id) files.push(rel);
      else files.push(...(await listPrefix(bucket, `${rel}/`)));
    }
    if (items.length < page) break;
  }
  return files;
}

async function downloadObject(bucket, objectPath, dest) {
  await mkdir(path.dirname(dest), { recursive: true });
  const response = await fetch(
    `${ORIGIN}/storage/v1/object/${bucket}/${objectPath.split("/").map(encodeURIComponent).join("/")}`,
    { headers: headers() }
  );
  if (!response.ok) {
    throw new Error(
      `download ${bucket}/${objectPath} ${response.status}`
    );
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(dest));
}

async function main() {
  await mkdir(path.join(OUT, "tables"), { recursive: true });
  await mkdir(path.join(OUT, "storage"), { recursive: true });

  const tables = (await listTables()).filter((name) => !SKIP_TABLES.has(name));
  const summary = { tables: {}, users: 0, buckets: {} };

  for (const table of tables.sort()) {
    process.stdout.write(`table ${table}... `);
    const rows = await dumpTable(table);
    await writeFile(
      path.join(OUT, "tables", `${table}.json`),
      JSON.stringify(rows),
      "utf8"
    );
    summary.tables[table] = rows.length;
    console.log(rows.length);
  }

  const users = [];
  for (let page = 1; page <= 50; page += 1) {
    const batch = await api(
      `/auth/v1/admin/users?page=${page}&per_page=200`
    );
    const list = batch?.users || [];
    users.push(...list);
    if (list.length < 200) break;
  }
  await writeFile(
    path.join(OUT, "auth-users.json"),
    JSON.stringify(users),
    "utf8"
  );
  summary.users = users.length;
  console.log("users", users.length);

  const buckets = await api("/storage/v1/bucket");
  await writeFile(
    path.join(OUT, "buckets.json"),
    JSON.stringify(buckets, null, 2),
    "utf8"
  );
  for (const bucket of buckets) {
    if (SKIP_BUCKETS.has(bucket.id)) {
      console.log("skip bucket", bucket.id);
      continue;
    }
    const files = await listPrefix(bucket.id, "");
    summary.buckets[bucket.id] = files.length;
    console.log("bucket", bucket.id, files.length);
    for (const objectPath of files) {
      const dest = path.join(OUT, "storage", bucket.id, objectPath);
      await downloadObject(bucket.id, objectPath, dest);
    }
  }

  await writeFile(
    path.join(OUT, "summary.json"),
    JSON.stringify(summary, null, 2),
    "utf8"
  );
  console.log("done", JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
