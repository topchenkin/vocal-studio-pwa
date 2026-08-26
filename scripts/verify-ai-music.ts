import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const fn = readFileSync(
  path.join(root, "supabase", "functions", "generate-music", "index.ts"),
  "utf8"
);
assert.ok(fn.includes("api-inference.huggingface.co/models/facebook/musicgen-small"));
assert.ok(fn.includes("Deno.env.get('HUGGINGFACE_API_KEY')") || fn.includes('Deno.env.get("HUGGINGFACE_API_KEY")'));
assert.ok(fn.includes('error: "loading"') || fn.includes("error: 'loading'"));
assert.ok(fn.includes("estimated_time"));
assert.ok(fn.includes("audioBase64"));
assert.ok(fn.includes("Access-Control-Allow-Origin"));
assert.ok(fn.includes("inputs: prompt") || fn.includes("inputs: prompt"));

const page = readFileSync(
  path.join(root, "app", "dashboard", "student", "ai-music", "page.tsx"),
  "utf8"
);
assert.ok(page.includes("AiMusicComposer"));

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
assert.ok(ui.includes("try {"));
assert.ok(ui.includes("Нейросеть разогревается"));
assert.ok(ui.includes("Отправляем запрос"));
assert.ok(ui.includes("Нейросеть сочиняет ноты"));
assert.ok(ui.includes("Сводим трек"));

const client = readFileSync(path.join(root, "lib", "supabase.ts"), "utf8");
assert.ok(client.includes("functions"));
assert.ok(client.includes("120_000"));

console.log("ai music edge function, paywall, invoke: ok");
