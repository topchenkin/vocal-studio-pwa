import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const api = readFileSync(path.join(root, "deploy", "ai-api", "server.mjs"), "utf8");
assert.ok(api.includes("/api/ai/songwriter-chat"));
assert.ok(api.includes("huggingface-projects-llama-3-2-3b-instruct.hf.space"));
assert.ok(api.includes("Ты профессиональный музыкальный продюсер и автор хитов"));
assert.ok(api.includes("HUGGINGFACE_API_KEY"));
assert.ok(api.includes("{ reply"));

const page = readFileSync(
  path.join(root, "app", "dashboard", "student", "songwriter", "page.tsx"),
  "utf8"
);
assert.ok(page.includes("SongwriterChat"));

const ui = readFileSync(
  path.join(root, "components", "ai", "SongwriterChat.tsx"),
  "utf8"
);
assert.ok(ui.includes("/api/ai/songwriter-chat"));
assert.ok(ui.includes("getChatSessionToken"));
assert.ok(!ui.includes("functions.invoke"));
assert.ok(ui.includes("Написать хит про осень"));
assert.ok(ui.includes("Помоги с рифмой к слову..."));
assert.ok(ui.includes("Как структурировать песню?"));
assert.ok(ui.includes("Продюсер печатает"));
assert.ok(ui.includes("Твой личный ИИ-продюсер доступен в Premium"));
assert.ok(ui.includes("Обновить тариф"));
assert.ok(ui.includes("min-h-[5.5rem]"));
assert.ok(api.includes("Всегда отвечай на русском языке"));
assert.ok(ui.includes("scrollIntoView"));
assert.ok(ui.includes("MarkdownText"));
assert.ok(ui.includes("font-semibold"));

const tools = readFileSync(
  path.join(root, "app", "dashboard", "student", "ai-tools", "page.tsx"),
  "utf8"
);
assert.ok(tools.includes('id: "songwriter"'));
assert.ok(tools.includes("Нейросоздание песен"));
assert.ok(tools.includes("lg:grid-cols-7"));
assert.ok(tools.includes('locked={locked("songwriter")}'));

const access = readFileSync(path.join(root, "lib", "ai-tools-access.ts"), "utf8");
assert.ok(access.includes('"songwriter"'));

const sql = readFileSync(
  path.join(root, "supabase-migrations", "2026-08-26-ai-songwriter-tool.sql"),
  "utf8"
);
assert.ok(sql.includes("'songwriter'"));

console.log("songwriter chat via ai-api + 7th нейросети tab: ok");
