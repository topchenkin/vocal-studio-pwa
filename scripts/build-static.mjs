/**
 * Static export (GitHub Pages) cannot include Route Handlers or middleware.
 * Stash them for the duration of `next build`, then restore.
 */
import { access, mkdir, rename } from "node:fs/promises";
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

async function stashIncompatible() {
  await mkdir(stashDir, { recursive: true });
  if (await exists(apiSrc)) await rename(apiSrc, apiDst);
  if (await exists(mwSrc)) await rename(mwSrc, mwDst);
}

async function restoreIncompatible() {
  if (await exists(apiDst)) await rename(apiDst, apiSrc);
  if (await exists(mwDst)) await rename(mwDst, mwSrc);
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
