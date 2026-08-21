#!/usr/bin/env node
/**
 * Restore dumped public tables + storage into local self-hosted Supabase.
 * Skips chat tables (not present in the dump).
 * Env: LOCAL_URL (default http://127.0.0.1:8000), SERVICE_ROLE_KEY, DUMP_DIR
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { statSync } from "node:fs";

const ORIGIN = (process.env.LOCAL_URL || "http://127.0.0.1:8000").replace(
  /\/$/,
  ""
);
const KEY = process.env.SERVICE_ROLE_KEY || "";
const DUMP = process.env.DUMP_DIR || "/opt/uvs-migrate";

if (!KEY) {
  console.error("missing SERVICE_ROLE_KEY");
  process.exit(1);
}

function mimeFor(name) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return (
    {
      mp3: "audio/mpeg",
      wav: "audio/wav",
      m4a: "audio/mp4",
      aac: "audio/aac",
      ogg: "audio/ogg",
      webm: "video/webm",
      mp4: "video/mp4",
      mov: "video/quicktime",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      gif: "image/gif",
      heic: "image/heic",
    }[ext] || "application/octet-stream"
  );
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
    headers: { ...headers(), ...(init.headers || {}) },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${pathname} ${response.status} ${text.slice(0, 500)}`);
  }
  return text ? JSON.parse(text) : null;
}

async function restoreUsers() {
  const raw = await readFile(path.join(DUMP, "auth-users.json"), "utf8");
  const users = JSON.parse(raw);
  let ok = 0;
  for (const user of users) {
    const password = `tmp-${user.id.replace(/-/g, "").slice(0, 24)}Aa1!`;
    const response = await fetch(`${ORIGIN}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        ...headers(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        uid: user.id,
        id: user.id,
        email: user.email,
        phone: user.phone || undefined,
        email_confirm: true,
        phone_confirm: Boolean(user.phone_confirmed_at),
        user_metadata: user.user_metadata || {},
        app_metadata: user.app_metadata || {},
        password,
      }),
    });
    if (response.ok || response.status === 422) {
      ok += 1;
      continue;
    }
    const text = await response.text();
    console.error("user", user.email, response.status, text.slice(0, 200));
  }
  console.log("users restored", ok, "/", users.length);
}

async function insertTable(name, rows) {
  if (!rows.length) return 0;
  const chunkSize = 200;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const response = await fetch(`${ORIGIN}/rest/v1/${name}`, {
      method: "POST",
      headers: {
        ...headers(),
        "Content-Type": "application/json",
        Prefer: "return=minimal,resolution=merge-duplicates",
      },
      body: JSON.stringify(chunk),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${name} ${response.status} ${text.slice(0, 400)}`);
    }
    inserted += chunk.length;
  }
  return inserted;
}

async function restoreTables() {
  const dir = path.join(DUMP, "tables");
  const files = (await readdir(dir)).filter((name) => name.endsWith(".json"));
  const pending = new Map();
  for (const file of files) {
    const name = file.replace(/\.json$/, "");
    const rows = JSON.parse(await readFile(path.join(dir, file), "utf8"));
    pending.set(name, rows);
  }
  const preferred = [
    "profiles",
    "subscription_products",
    "student_folders",
    "exercises",
    "lessons",
    "ai_tool_access",
    "student_audio_tracks",
    "vocal_test_results",
    "lesson_homework",
    "student_notes",
    "notifications",
    "push_subscriptions",
    "payment_transactions",
    "duo_subscriptions",
    "student_folder_members",
    "exercise_folder_access",
    "exercise_student_access",
  ];
  const order = [
    ...preferred.filter((name) => pending.has(name)),
    ...[...pending.keys()].filter((name) => !preferred.includes(name)).sort(),
  ];
  const failed = new Map();
  for (const name of order) {
    const rows = pending.get(name) || [];
    try {
      const n = await insertTable(name, rows);
      console.log("table", name, n);
    } catch (error) {
      console.error("defer", name, error.message);
      failed.set(name, rows);
    }
  }
  for (let round = 0; round < 6 && failed.size; round += 1) {
    for (const [name, rows] of [...failed.entries()]) {
      try {
        const n = await insertTable(name, rows);
        console.log("retry", name, n);
        failed.delete(name);
      } catch (error) {
        console.error("still", name, error.message);
      }
    }
  }
  if (failed.size) {
    throw new Error(`unresolved tables: ${[...failed.keys()].join(", ")}`);
  }
}

async function restoreStorage() {
  let buckets = [];
  try {
    buckets = JSON.parse(await readFile(path.join(DUMP, "buckets.json"), "utf8"));
  } catch {
    buckets = [
      { id: "exercise-media", public: false },
      { id: "student-audio", public: false },
      { id: "chat-media", public: false },
    ];
  }
  for (const bucket of buckets) {
    await fetch(`${ORIGIN}/storage/v1/bucket`, {
      method: "POST",
      headers: {
        ...headers(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: bucket.id,
        name: bucket.name || bucket.id,
        public: Boolean(bucket.public),
        file_size_limit: bucket.file_size_limit || null,
        allowed_mime_types: bucket.allowed_mime_types || null,
      }),
    });
  }
  const storageRoot = path.join(DUMP, "storage");
  let names = [];
  try {
    names = await readdir(storageRoot);
  } catch {
    return;
  }
  for (const bucket of names) {
    async function walk(rel) {
      const abs = path.join(storageRoot, bucket, rel);
      const entries = await readdir(abs, { withFileTypes: true });
      for (const entry of entries) {
        const next = rel ? `${rel}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          await walk(next);
          continue;
        }
        const filePath = path.join(storageRoot, bucket, next);
        const body = await readFile(filePath);
        const response = await fetch(
          `${ORIGIN}/storage/v1/object/${bucket}/${next
            .split("/")
            .map(encodeURIComponent)
            .join("/")}`,
          {
            method: "POST",
            headers: {
              ...headers(),
              "x-upsert": "true",
              "Content-Type": mimeFor(next),
            },
            body,
          }
        );
        if (!response.ok) {
          const text = await response.text();
          throw new Error(`${bucket}/${next} ${response.status} ${text.slice(0, 200)}`);
        }
        console.log("file", bucket, next, statSync(filePath).size);
      }
    }
    await walk("");
  }
}

async function main() {
  await restoreUsers();
  await restoreTables();
  await restoreStorage();
  console.log("restore done");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
