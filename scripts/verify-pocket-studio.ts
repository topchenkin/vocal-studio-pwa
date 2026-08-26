import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  COMPRESSOR_ATTACK_SEC,
  COMPRESSOR_RATIO,
  COMPRESSOR_RELEASE_SEC,
  COMPRESSOR_THRESHOLD_DB,
  DEFAULT_BACKING_GAIN,
  HIGH_SHELF_GAIN_DB,
  HIGH_SHELF_HZ,
} from "../lib/pocket-studio";

assert.equal(HIGH_SHELF_HZ, 3000);
assert.equal(HIGH_SHELF_GAIN_DB, 4);
assert.equal(COMPRESSOR_THRESHOLD_DB, -24);
assert.equal(COMPRESSOR_RATIO, 4);
assert.equal(COMPRESSOR_ATTACK_SEC, 0.003);
assert.equal(COMPRESSOR_RELEASE_SEC, 0.25);
assert.equal(DEFAULT_BACKING_GAIN, 0.8);

const root = process.cwd();
const util = readFileSync(path.join(root, "lib", "pocket-studio.ts"), "utf8");
assert.ok(util.includes("export async function mixAndEnhanceAudio"));
assert.ok(util.includes("export function generateImpulseResponse"));
assert.ok(util.includes("OfflineAudioContext"));
assert.ok(util.includes("createConvolver"));
assert.ok(util.includes("highshelf"));
assert.ok(util.includes("DynamicsCompressor") || util.includes("createDynamicsCompressor"));

const page = readFileSync(
  path.join(root, "app", "dashboard", "student", "pocket-studio", "page.tsx"),
  "utf8"
);
assert.ok(page.includes("PocketStudio"));
assert.ok(page.includes("Карманная студия"));

const ui = readFileSync(
  path.join(root, "components", "student", "PocketStudio.tsx"),
  "utf8"
);
assert.ok(ui.includes("try {"));
assert.ok(ui.includes("getSingingMicStream"));
assert.ok(ui.includes("MediaRecorder"));
assert.ok(ui.includes("audio.play()"));
assert.ok(ui.includes("URL.revokeObjectURL"));
assert.ok(ui.includes("Студийная обработка вокала доступна только в Premium"));
assert.ok(ui.includes("Обновить тариф"));
assert.ok(ui.includes("Сводим трек"));
assert.ok(ui.includes("Сделать студийно"));
assert.ok(ui.includes("Скачать трек"));
assert.ok(ui.includes("Громкость голоса"));
assert.ok(ui.includes("Громкость музыки"));

const nav = readFileSync(
  path.join(root, "components", "student", "StudentNav.tsx"),
  "utf8"
);
assert.ok(nav.includes("/dashboard/student/pocket-studio"));
assert.ok(nav.includes("grid-cols-5"));

console.log("pocket studio page, dsp chain, paywall: ok");
