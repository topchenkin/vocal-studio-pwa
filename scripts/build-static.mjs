/**
 * Static export (Timeweb production + GitHub CI check) cannot include
 * Route Handlers or middleware. Stash them for `next build`, then restore.
 */
import { access, cp, mkdir, readFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stashDir = path.join(root, ".static-export-stash");
const apiSrc = path.join(root, "app", "api");
const apiDst = path.join(stashDir, "api");
const mwSrc = path.join(root, "middleware.ts");
const mwDst = path.join(stashDir, "middleware.ts");

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** Copy then delete — `rename()` throws EXDEV across Docker overlay mounts. */
async function movePath(src, dest) {
  await cp(src, dest, { recursive: true, force: true });
  await rm(src, { recursive: true, force: true });
}

async function stashIncompatible() {
  await mkdir(stashDir, { recursive: true });
  if (await exists(apiSrc)) await movePath(apiSrc, apiDst);
  if (await exists(mwSrc)) await movePath(mwSrc, mwDst);
}

async function restoreIncompatible() {
  if (await exists(apiDst)) await movePath(apiDst, apiSrc);
  if (await exists(mwDst)) await movePath(mwDst, mwSrc);
}

function runNextBuild() {
  return new Promise((resolve) => {
    const child = spawn("npx", ["next", "build"], {
      cwd: root,
      stdio: "inherit",
      shell: true,
      env: process.env,
    });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

async function main() {
  await stashIncompatible();
  let code = 1;
  try {
    code = await runNextBuild();
  } finally {
    await restoreIncompatible();
  }
  if (code !== 0) process.exit(code);

  const sw = await readFile(path.join(root, "out", "sw.js"), "utf8");
  if (sw.includes("start-url")) {
    console.error("out/sw.js still registers a start-url cache — iOS will keep stale HTML");
    process.exit(1);
  }
  if (!sw.includes("NetworkOnly")) {
    console.error("out/sw.js is missing NetworkOnly handlers for HTML/JS");
    process.exit(1);
  }
}

main().catch(async (err) => {
  console.error(err);
  try {
    await restoreIncompatible();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
