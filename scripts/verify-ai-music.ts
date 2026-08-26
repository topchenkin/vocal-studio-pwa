import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const fn = readFileSync(
  path.join(root, "supabase", "functions", "generate-music", "index.ts"),
  "utf8"
);
assert.ok(fn.includes("facebook-musicgen.hf.space"));
assert.ok(fn.includes("predict_batched"));
assert.ok(!fn.includes("api-inference.huggingface.co"));
assert.ok(fn.includes('Deno.env.get("HUGGINGFACE_API_KEY")'));
assert.ok(fn.includes('error: "loading"'));
assert.ok(fn.includes("estimated_time"));
assert.ok(fn.includes("audioBase64"));
assert.ok(fn.includes("Access-Control-Allow-Origin"));

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
assert.ok(tools.includes("lg:grid-cols-6"));
assert.ok(tools.includes('locked={locked("musicgen")}'));
assert.ok(!tools.includes('href="/dashboard/student/ai-music"'));

const ui = readFileSync(
  path.join(root, "components", "ai", "AiMusicComposer.tsx"),
  "utf8"
);
assert.ok(ui.includes("functions.invoke"));
assert.ok(ui.includes("generate-music"));
assert.ok(ui.includes("Медленный джазовый бит с саксофоном и пианино"));
assert.ok(ui.includes("Lo-Fi Hip Hop"));
assert.ok(ui.includes("Pop Acoustic Guitar"));
assert.ok(ui.includes("Dark Synthwave"));
assert.ok(ui.includes("Сгенерировать трек"));
assert.ok(ui.includes("Скачать минусовку"));
assert.ok(ui.includes("Создание авторских треков с помощью нейросетей доступно в Premium"));
assert.ok(ui.includes("URL.createObjectURL"));
assert.ok(ui.includes("revokeObjectURL"));
assert.ok(ui.includes("Нейросеть разогревается"));
assert.ok(ui.includes("Отправляем запрос"));
assert.ok(ui.includes("Нейросеть сочиняет ноты"));
assert.ok(ui.includes("Сводим трек"));
assert.ok(ui.includes("locked?: boolean"));
assert.ok(ui.includes("humanizeError"));

const access = readFileSync(path.join(root, "lib", "ai-tools-access.ts"), "utf8");
assert.ok(access.includes('"musicgen"'));

const client = readFileSync(path.join(root, "lib", "supabase.ts"), "utf8");
assert.ok(client.includes("functions"));
assert.ok(client.includes("180_000"));

const sql = readFileSync(
  path.join(root, "supabase-migrations", "2026-08-26-ai-musicgen-tool.sql"),
  "utf8"
);
assert.ok(sql.includes("'musicgen'"));

console.log("ai music space + 6th нейросети tab: ok");
