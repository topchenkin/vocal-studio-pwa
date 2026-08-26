import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const api = readFileSync(path.join(root, "deploy", "ai-api", "server.mjs"), "utf8");
assert.ok(api.includes("/api/ai/separate-vocal"));
assert.ok(!api.includes("/api/ai/songwriter-chat"));
assert.ok(!api.includes("api.groq.com"));
assert.ok(!api.includes("GROQ_API_KEY"));

const tools = readFileSync(
  path.join(root, "app", "dashboard", "student", "ai-tools", "page.tsx"),
  "utf8"
);
assert.ok(tools.includes('id: "vocalfx"'));
assert.ok(tools.includes('id: "chordloop"'));
assert.ok(tools.includes("Обработка голоса"));
assert.ok(tools.includes("Генератор аккордов"));
assert.ok(!tools.includes('id: "songwriter"'));
assert.ok(!tools.includes("SongwriterChat"));
assert.ok(!tools.includes("AiMusicComposer"));

const access = readFileSync(path.join(root, "lib", "ai-tools-access.ts"), "utf8");
assert.ok(access.includes('"vocalfx"'));
assert.ok(access.includes('"chordloop"'));
assert.ok(!access.includes('"songwriter"'));
assert.ok(!access.includes('"musicgen"'));

const fx = readFileSync(path.join(root, "lib", "vocal-fx.ts"), "utf8");
assert.ok(fx.includes("makeReverbImpulse"));
assert.ok(fx.includes("renderVocalFxWav"));
assert.ok(fx.includes('"church"'));
assert.ok(fx.includes('"street"'));
assert.ok(fx.includes('"megaphone"'));

const fxUi = readFileSync(
  path.join(root, "components", "audio", "VocalFxBox.tsx"),
  "utf8"
);
assert.ok(fxUi.includes("Обработка голоса"));
assert.ok(fxUi.includes("Из «Мои аудио»"));
assert.ok(fxUi.includes("Wet/Dry"));
assert.ok(fxUi.includes("LibraryTrackPicker"));
assert.ok(fxUi.includes('source: "vocalfx"'));

const chords = readFileSync(path.join(root, "lib", "chord-loop.ts"), "utf8");
assert.ok(chords.includes("rock-guitar"));
assert.ok(chords.includes("INSTRUMENTS"));

const chordUi = readFileSync(
  path.join(root, "components", "audio", "ChordLoopGenerator.tsx"),
  "utf8"
);
assert.ok(chordUi.includes("Генератор аккордов"));
assert.ok(chordUi.includes("Tap Tempo"));
assert.ok(chordUi.includes("Мои пресеты"));
assert.ok(chordUi.includes("saveChordLoopPreset"));

const sql = readFileSync(
  path.join(root, "supabase-migrations", "2026-08-26-music-lab-v2.sql"),
  "utf8"
);
assert.ok(sql.includes("chord_loop_presets"));
assert.ok(sql.includes("delete from public.ai_tool_access where tool_id = 'songwriter'"));
assert.ok(sql.includes("'vocalfx'"));

assert.ok(
  readFileSync(
    path.join(root, "components", "admin", "AdminAiToolsPanel.tsx"),
    "utf8"
  ).includes("Обработка голоса")
);

console.log("music lab tools: ok");
