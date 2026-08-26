import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const api = readFileSync(path.join(root, "deploy", "ai-api", "server.mjs"), "utf8");
assert.ok(api.includes("/api/ai/generate-music"));
assert.ok(api.includes("sanchit-gandhi/musicgen-streaming"));
assert.ok(api.includes("generate_audio"));
assert.ok(api.includes("hlsToWav"));
assert.ok(api.includes("waitForHlsPlaylist"));
assert.ok(api.includes("pickHlsSources"));
assert.ok(api.includes("ffmpeg"));
assert.ok(api.includes("HUGGINGFACE_API_KEY"));
assert.ok(api.includes("audioBase64"));
assert.ok(!api.includes("api-inference.huggingface.co"));

const page = readFileSync(
  path.join(root, "app", "dashboard", "student", "ai-music", "page.tsx"),
  "utf8"
);
assert.ok(page.includes("AiMusicComposer"));

const tools = readFileSync(
  path.join(root, "app", "dashboard", "student", "ai-tools", "page.tsx"),
  "utf8"
);
assert.ok(tools.includes('id: "musicgen"'));
assert.ok(tools.includes("ИИ-композитор"));
assert.ok(tools.includes("lg:grid-cols-7"));
assert.ok(tools.includes('locked={locked("musicgen")}'));

const ui = readFileSync(
  path.join(root, "components", "ai", "AiMusicComposer.tsx"),
  "utf8"
);
assert.ok(ui.includes('/api/ai/generate-music'));
assert.ok(ui.includes("getChatSessionToken"));
assert.ok(!ui.includes("functions.invoke"));
assert.ok(ui.includes("Медленный джазовый бит с саксофоном и пианино"));
assert.ok(ui.includes("Lo-Fi Hip Hop"));
assert.ok(ui.includes("Pop Acoustic Guitar"));
assert.ok(ui.includes("Dark Synthwave"));
assert.ok(ui.includes("Сгенерировать"));
assert.ok(ui.includes("Длительность"));
assert.ok(ui.includes("25 сек") || ui.includes("25"));
assert.ok(ui.includes("Скачать минусовку"));
assert.ok(ui.includes("Создание авторских треков с помощью нейросетей доступно в Premium"));
assert.ok(ui.includes("URL.createObjectURL"));
assert.ok(ui.includes("revokeObjectURL"));
assert.ok(ui.includes("locked?: boolean"));

const access = readFileSync(path.join(root, "lib", "ai-tools-access.ts"), "utf8");
assert.ok(access.includes('"musicgen"'));

const sql = readFileSync(
  path.join(root, "supabase-migrations", "2026-08-26-ai-musicgen-tool.sql"),
  "utf8"
);
assert.ok(sql.includes("'musicgen'"));

console.log("ai music via ai-api + 6th нейросети tab: ok");
